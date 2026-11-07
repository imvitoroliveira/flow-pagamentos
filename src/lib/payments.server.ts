// Server-only payment core shared by server routes (/api/public/*) and server functions.
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { buildPurchaseEvent, metaEventsUrl, shouldReportToMeta } from "./meta-capi";
import { CLOSED_RECHECK_WINDOW_MS, createThrottle, mapLimit, shouldRecheckClosedOrder } from "./reconcile-policy";

// ─── AbacatePay API config ────────────────────────────────────────────────
// The API key version must match the endpoint ("API key version mismatch" otherwise).
//   v1: POST {BASE}/v1/pixQrCode/create   body: { amount, expiresIn, description, metadata }
//   v2: POST {BASE}/v2/transparents/create body: { method: "PIX", data: { ...same fields } }
// Switch by changing ABACATE_API_VERSION. The current key is a v2 key.
export const ABACATE_API_BASE = "https://api.abacatepay.com";
export const ABACATE_API_VERSION = "v2" as "v1" | "v2";
export const ABACATE_API_PATH = ABACATE_API_VERSION === "v1" ? "/v1/pixQrCode/create" : "/v2/transparents/create";
export const PIX_EXPIRES_SECONDS = 30 * 60;

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const createPaymentSchema = z.object({
  plan_slug: z.enum(["mensal", "trimestral", "semestral"]),
  panel_username: z.string().trim().min(2).max(64).regex(/^\S+$/, "Usuário não pode ter espaços"),
  customer_name: z.string().trim().min(2).max(100),
  customer_email: z.string().trim().email().max(255).optional().or(z.literal("")).nullable(),
  customer_phone: z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().regex(/^\d{10,13}$/, "Telefone inválido")),
  ref_code: z.string().trim().max(16).optional().nullable(),
  session_id: z.string().max(64).optional().nullable(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export class PublicError extends Error {}

function buildAbacateBody(p: {
  amount: number; description: string; name: string; phone: string; email: string | null;
  orderId: string; username: string; slug: string;
}) {
  const data = {
    amount: p.amount,
    expiresIn: PIX_EXPIRES_SECONDS,
    description: p.description.slice(0, 37),
    // AbacatePay requires customer.taxId (CPF) whenever `customer` is sent. We don't collect CPF,
    // so customer data travels in metadata. To send `customer`, collect CPF and add:
    // customer: { name, cellphone, email, taxId }
    metadata: {
      order_id: p.orderId, panel_username: p.username, plan_slug: p.slug,
      customer_name: p.name, customer_phone: p.phone, customer_email: p.email ?? "",
    },
  };
  return ABACATE_API_VERSION === "v1" ? data : { method: "PIX", data };
}

function parseAbacateResponse(json: unknown) {
  const d = (json as { data?: { id?: string; brCode?: string; brCodeBase64?: string; expiresAt?: string } })?.data;
  if (!d?.id || !d.brCode) return null;
  return { id: d.id, brCode: d.brCode, brCodeBase64: d.brCodeBase64 ?? "", expiresAt: d.expiresAt ?? null };
}

export async function createPayment(input: CreatePaymentInput) {
  const key = process.env["ABACATEPAY_API_KEY"];
  if (!key) throw new PublicError("Pagamento PIX ainda não configurado.");
  const sb = await db();

  const { data: plan } = await sb.from("plans").select("*").eq("slug", input.plan_slug).eq("active", true).maybeSingle();
  if (!plan) throw new PublicError("Plano inválido");

  const { findPanelUser } = await import("./renewal.server");
  let panelUser: Awaited<ReturnType<typeof findPanelUser>>;
  try {
    panelUser = await findPanelUser(input.panel_username);
  } catch (e) {
    console.error("panel lookup failed", e);
    throw new PublicError("Não foi possível confirmar o usuário agora. Tente novamente em instantes.");
  }
  if (!panelUser) throw new PublicError("Usuário do aplicativo não encontrado. Confira e tente novamente.");

  const ref = input.ref_code?.toUpperCase() || null;
  let campaign_id: string | null = null;
  let seller_id: string | null = null;
  if (ref) {
    const { data: click } = await sb.from("clicks").select("campaign_id, campaigns(seller_id)").eq("ref_code", ref).maybeSingle();
    campaign_id = click?.campaign_id ?? null;
    seller_id = click?.campaigns?.seller_id ?? null;
  }

  const event_id = crypto.randomUUID();
  const { data: order, error } = await sb
    .from("orders")
    .insert({
      ref_code: ref, campaign_id, seller_id,
      customer_name: input.customer_name,
      customer_email: input.customer_email || null,
      customer_phone: input.customer_phone,
      panel_username: input.panel_username,
      plan_id: plan.id,
      amount_cents: plan.price_cents,
      status: "pending",
      event_id,
    })
    .select("id")
    .single();
  if (error || !order) throw new PublicError("Não foi possível criar o pedido");

  const res = await fetch(ABACATE_API_BASE + ABACATE_API_PATH, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(
      buildAbacateBody({
        amount: plan.price_cents, description: `NATV - Plano ${plan.name}`,
        name: input.customer_name, phone: input.customer_phone, email: input.customer_email || null,
        orderId: order.id, username: input.panel_username, slug: plan.slug,
      }),
    ),
  });
  const json = await res.json().catch(() => null);
  const pix = res.ok ? parseAbacateResponse(json) : null;
  if (!pix) {
    console.error("AbacatePay create failed", ABACATE_API_PATH, res.status, json);
    await sb.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    throw new PublicError("Não foi possível gerar o PIX. Tente novamente.");
  }

  await sb.from("orders").update({ abacate_id: pix.id, pix_brcode: pix.brCode, pix_qr_base64: pix.brCodeBase64 }).eq("id", order.id);
  await sb.from("events").insert({
    session_id: input.session_id ?? null, ref_code: ref, order_id: order.id, type: "pix_generated",
    metadata: { plan: plan.slug, amount_cents: plan.price_cents, event_id },
  });

  return {
    order_id: order.id,
    abacate_id: pix.id,
    brcode: pix.brCode,
    qr: pix.brCodeBase64,
    amount_cents: plan.price_cents,
    expires_at: pix.expiresAt ?? new Date(Date.now() + PIX_EXPIRES_SECONDS * 1000).toISOString(),
  };
}

// The checkout screen polls this often; the webhook is the primary signal, so AbacatePay is only asked
// directly at most once per EXTERNAL_CHECK_MIN_MS per order (per server instance).
const EXTERNAL_CHECK_MIN_MS = 15_000;
const mayCheckAbacate = createThrottle(EXTERNAL_CHECK_MIN_MS);

export async function getOrderPublicStatus(id: string) {
  const sb = await db();
  const { data: pending } = await sb.from("orders").select("status, abacate_id").eq("id", id).maybeSingle();
  if (pending?.status === "pending" && pending.abacate_id && mayCheckAbacate(id, Date.now())) await reconcilePendingPayment(id, pending.abacate_id);
  const { data: o } = await sb
    .from("orders")
    .select("status, paid_at, renewed_at, plans(name, months), campaigns(destination_whatsapp)")
    .eq("id", id)
    .maybeSingle();
  if (!o) return null;
  const base = o.renewed_at ?? o.paid_at;
  const valid = base ? new Date(base) : null;
  if (valid) valid.setMonth(valid.getMonth() + (o.plans?.months ?? 1));
  return {
    status: o.status,
    plan_name: o.plans?.name ?? null,
    valid_until: valid?.toISOString() ?? null,
    whatsapp: o.campaigns?.destination_whatsapp ?? process.env["SUPPORT_WHATSAPP"] ?? null,
  };
}

// ─── Webhook signature ────────────────────────────────────────────────────
function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** HMAC key: ABACATEPAY_HMAC_KEY if set (AbacatePay's published key), else ABACATEPAY_WEBHOOK_SECRET. */
export function verifyAbacateWebhook(url: URL, rawBody: string, signature: string | null) {
  const secret = process.env["ABACATEPAY_WEBHOOK_SECRET"];
  if (!secret) return "secret_not_configured";
  if (!safeEq(url.searchParams.get("webhookSecret") ?? "", secret)) return "invalid_webhook_secret";
  if (!signature) return "missing_signature";
  const mac = createHmac("sha256", process.env["ABACATEPAY_HMAC_KEY"] || secret).update(rawBody, "utf8").digest();
  const sig = signature.trim().replace(/^sha256=/, "");
  if (!safeEq(sig, mac.toString("base64")) && !safeEq(sig.toLowerCase(), mac.toString("hex"))) return "invalid_signature";
  return null;
}

// ─── Post-payment steps (stubs; implemented in later steps) ───────────────
export async function renewCustomer(orderId: string) {
  const { renewCustomer: run } = await import("./renewal.server");
  return run(orderId);
}
/** Marks the order paid once (conditional update) and runs the post-payment steps. */
export async function settlePaidOrder(orderId: string) {
  const sb = await db();
  const { data: updated } = await sb
    .from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", orderId)
    .not("status", "in", "(paid,renewed)")
    .select("id, ref_code, event_id");
  const order = updated?.[0];
  if (!order) return { alreadyProcessed: true as const, failed: [] as string[] };

  await sb.from("events").insert({ order_id: order.id, ref_code: order.ref_code, type: "paid", metadata: { event_id: order.event_id } });
  const [renewal, conversions] = await Promise.allSettled([renewCustomer(order.id), sendConversionEvents(order.id)]);
  // Runs after the renewal so the expiry shown to the admin already includes the new activation.
  await notifyAdminOfSale(order.id);
  const failed: string[] = [];
  if (renewal.status === "rejected") failed.push(String(renewal.reason));
  else if (!renewal.value.ok) failed.push("error" in renewal.value && renewal.value.error ? renewal.value.error : "renovação não concluída");
  if (conversions.status === "rejected") failed.push(String(conversions.reason));
  return { alreadyProcessed: false as const, failed };
}

/** Asks AbacatePay directly, so a missed webhook does not leave the customer waiting forever. */
async function reconcilePendingPayment(orderId: string, abacateId: string) {
  const key = process.env["ABACATEPAY_API_KEY"];
  if (!key) return;
  const res = await fetch(`${ABACATE_API_BASE}/v2/transparents/check?id=${encodeURIComponent(abacateId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  }).catch(() => null);
  if (!res?.ok) return;
  const json = (await res.json().catch(() => null)) as { data?: { status?: string } } | null;
  if (json?.data?.status === "PAID") await settlePaidOrder(orderId);
}

const SAO_PAULO_DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatSaoPaulo(date: Date) {
  const parts = Object.fromEntries(SAO_PAULO_DATE.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts["day"]}/${parts["month"]}/${parts["year"]} ${parts["hour"]}:${parts["minute"]}`;
}

const escapeHtml = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);

export async function notifyAdminOfSale(orderId: string) {
  try {
    const sb = await db();
    const { data: order } = await sb
      .from("orders")
      .select("customer_name, panel_username, amount_cents, paid_at, plans(name, months)")
      .eq("id", orderId)
      .maybeSingle();
    if (!order?.paid_at) {
      console.error("[notify-admin-of-sale] pedido sem dados de pagamento", orderId);
      return;
    }

    const months = order.plans?.months ?? 1;
    const futureMonths = Math.max(0, months - 1);
    const [{ count }, { data: renewedEvent }, { data: schedule }, { data: panelClient }] = await Promise.all([
      sb.from("orders")
        .select("id", { count: "exact", head: true })
        .eq("panel_username", order.panel_username)
        .in("status", ["paid", "renewed"] as const)
        .neq("id", orderId),
      sb.from("events").select("metadata").eq("order_id", orderId).eq("type", "renewed").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("credit_schedules").select("last_exp_date").eq("order_id", orderId).maybeSingle(),
      sb.from("panel_clients").select("expires_at").eq("username", order.panel_username).maybeSingle(),
    ]);

    const renewedExpSeconds = (renewedEvent?.metadata as { exp_date?: number | null } | null)?.exp_date;
    const baseDate = renewedExpSeconds
      ? new Date(renewedExpSeconds * 1000)
      : schedule?.last_exp_date
        ? new Date(schedule.last_exp_date)
        : panelClient?.expires_at
          ? new Date(panelClient.expires_at)
          : null;
    const expires = new Date(baseDate ?? order.paid_at);
    expires.setMonth(expires.getMonth() + (baseDate ? futureMonths : months));

    const kind = (count ?? 0) > 0 ? "RENOVAÇÃO" : "NOVO CLIENTE";
    const futureLabel = futureMonths === 0 ? "0 meses" : `+${futureMonths} meses`;
    const text = [
      "<pre>🟢 VENDA CONFIRMADA • PIX APROVADO",
      "",
      "┌ DADOS DO ASSINANTE",
      `│ Cliente: ${escapeHtml(order.customer_name)}`,
      `│ Usuário: ${escapeHtml(order.panel_username)}`,
      `│ Status:  [${kind}]`,
      "│",
      "├ PLANO & CRÉDITOS",
      `│ Plano:   ${escapeHtml(order.plans?.name ?? "-")}`,
      `│ Futuro:  ${futureLabel}`,
      `│ Expira:  ${formatSaoPaulo(expires)}`,
      "│",
      "└ PAGAMENTO",
      `  Valor:   ${BRL.format(order.amount_cents / 100)}`,
      `  Data:    ${formatSaoPaulo(new Date(order.paid_at))}`,
      "</pre>",
    ].join("\n");

    const chatId = process.env["TELEGRAM_ADMIN_CHAT_ID"] || process.env["ADMIN_TELEGRAM_CHAT_ID"] || "-1003741340423";
    const { sendTelegram } = await import("./checkout.server");
    const sent = await sendTelegram(chatId, text);
    await sb.from("notifications_log").insert({ order_id: orderId, channel: "telegram_admin", status: sent ? "sent" : "failed" });
  } catch (e) {
    console.error("[notify-admin-of-sale]", orderId, e);
  }
}
/**
 * Reports a paid order to Meta (Conversions API, server-side Purchase). Needs META_CAPI_TOKEN and the campaign's
 * Meta Pixel ID; does nothing otherwise. Only orders that came from a Meta-tracked click (fbc/fbp) are sent.
 * Never throws: a Meta failure must not affect the payment. Optional META_TEST_EVENT_CODE sends to the Test Events tool.
 */
export async function sendConversionEvents(orderId: string) {
  try {
    const token = process.env["META_CAPI_TOKEN"];
    if (!token) return;
    const sb = await db();
    const { data: o } = await sb.from("orders")
      .select("id, event_id, ref_code, amount_cents, paid_at, customer_email, customer_phone, panel_username, campaigns(meta_pixel_id)")
      .eq("id", orderId).maybeSingle();
    const pixelId = o?.campaigns?.meta_pixel_id;
    if (!o || !o.paid_at || !pixelId || !o.ref_code) return;
    const { data: click } = await sb.from("clicks").select("fbc, fbp, user_agent").eq("ref_code", o.ref_code).maybeSingle();
    if (!shouldReportToMeta(click)) return;

    const { publicUrl } = await import("./site-url");
    const body: Record<string, unknown> = {
      data: [buildPurchaseEvent({
        eventId: o.event_id ?? o.id, orderId: o.id, paidAt: o.paid_at, amountCents: o.amount_cents, sourceUrl: publicUrl("/pagar"),
        email: o.customer_email, phone: o.customer_phone, panelUsername: o.panel_username,
        fbc: click?.fbc ?? null, fbp: click?.fbp ?? null, userAgent: click?.user_agent ?? null,
      })],
    };
    if (process.env["META_TEST_EVENT_CODE"]) body["test_event_code"] = process.env["META_TEST_EVENT_CODE"];

    let ok = false;
    try {
      const res = await fetch(`${metaEventsUrl(pixelId)}?access_token=${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      ok = res.ok;
      if (!res.ok) console.error("[meta-capi] rejected", res.status, (await res.text().catch(() => "")).slice(0, 300));
    } catch (e) {
      console.error("[meta-capi] request failed", (e as Error).message);
    }
    await sb.from("notifications_log").insert({ order_id: orderId, channel: "meta_capi", status: ok ? "sent" : "failed" });
  } catch (e) {
    console.error("[meta-capi]", orderId, e);
  }
}

/**
 * Backstop for missed webhooks: asks AbacatePay about every recent PIX that is not settled yet
 * (pending, or cancelled/expired locally) and settles the ones it reports as PAID.
 */
export async function reconcileRecentPayments() {
  const key = process.env["ABACATEPAY_API_KEY"];
  if (!key) return { checked: 0, settled: 0, expired: 0 };
  const sb = await db();
  const now = Date.now();
  // Pending PIX are checked on every run. Orders already expired/cancelled locally cannot be paid any more,
  // so they are only re-checked for a few hours, with backoff (see reconcile-policy.ts), instead of 48 h of every-2-min calls.
  const [pending, closed] = await Promise.all([
    sb.from("orders").select("id, status, abacate_id, created_at")
      .eq("status", "pending").not("abacate_id", "is", null)
      .gte("created_at", new Date(now - 48 * 3600_000).toISOString()).order("created_at", { ascending: false }).limit(50),
    sb.from("orders").select("id, status, abacate_id, created_at")
      .in("status", ["cancelled", "expired"]).not("abacate_id", "is", null)
      .gte("created_at", new Date(now - CLOSED_RECHECK_WINDOW_MS).toISOString()).order("created_at", { ascending: false }).limit(50),
  ]);
  const rows = [
    ...(pending.data ?? []),
    ...(closed.data ?? []).filter((o) => shouldRecheckClosedOrder(now - new Date(o.created_at).getTime(), now)),
  ];
  let settled = 0, expired = 0;
  await mapLimit(rows, 5, async (o) => {
    const res = await fetch(`${ABACATE_API_BASE}/v2/transparents/check?id=${encodeURIComponent(o.abacate_id!)}`, {
      headers: { Authorization: `Bearer ${key}` },
    }).catch(() => null);
    if (!res?.ok) return;
    const json = (await res.json().catch(() => null)) as { data?: { status?: string } } | null;
    const st = json?.data?.status;
    if (st === "PAID") { const r = await settlePaidOrder(o.id); if (!r.alreadyProcessed) settled++; }
    else if (st === "EXPIRED" && o.status === "pending") { await sb.from("orders").update({ status: "expired" }).eq("id", o.id).eq("status", "pending"); expired++; }
  });
  return { checked: rows.length, settled, expired };
}
