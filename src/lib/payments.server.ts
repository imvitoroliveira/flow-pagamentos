// Server-only payment core shared by server routes (/api/public/*) and server functions.
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

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

export async function getOrderPublicStatus(id: string) {
  const sb = await db();
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
  console.log("[renew-customer] stub", orderId);
}
export async function notifySeller(orderId: string) {
  console.log("[notify-seller] stub", orderId);
}
export async function sendConversionEvents(orderId: string) {
  console.log("[send-conversion-events] stub", orderId);
}
