// Server-only: renewal on the NATV reseller panel (https://revenda.pixbot.link, OpenAPI at /openapi.json).
//   POST /user/activation { username, months }  → renews (months: 1,2,3,4,5,6,12)
//   POST /user/search     { username }          → list of matching users (partial match)
import { sendTelegram } from "./checkout.server";

export const RETRY_DELAYS_MIN = [1, 5, 15];

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function panel() {
  const url = process.env["RENEWAL_API_URL"];
  const key = process.env["RENEWAL_API_KEY"];
  if (!url || !key) throw new Error("API de renovação não configurada (RENEWAL_API_URL/RENEWAL_API_KEY).");
  return { url: url.replace(/\/$/, ""), key };
}

async function panelPost(path: string, body: unknown) {
  const { url, key } = panel();
  const res = await fetch(url + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { ok: res.ok, status: res.status, json, text };
}

type PanelUser = { id: number; username: string; exp_date?: number; enabled?: number };

/** Exact (case-insensitive) username lookup. */
export async function findPanelUser(username: string): Promise<PanelUser | null> {
  const r = await panelPost("/user/search", { username });
  if (!r.ok || !Array.isArray(r.json)) throw new Error(`Painel respondeu ${r.status}`);
  const u = username.toLowerCase();
  return (r.json as PanelUser[]).find((x) => x.username?.toLowerCase() === u) ?? null;
}

async function activate(username: string, months: number) {
  const r = await panelPost("/user/activation", { username, months });
  if (!r.ok) {
    const detail = (r.json as { detail?: unknown } | null)?.detail;
    throw new Error(`Painel ${r.status}: ${typeof detail === "string" ? detail : r.text.slice(0, 200)}`);
  }
  return r.json as PanelUser;
}

/**
 * Renews a paid order. Only activates when the order is "paid" (first attempt) or, with
 * allowFailed, "renewal_failed" (retries). Once the panel has accepted the activation the
 * order is never flagged as failed, so a retry can't add the months a second time.
 */
export async function renewCustomer(orderId: string, opts: { attempt?: number; allowFailed?: boolean; manual?: boolean } = {}) {
  const sb = await db();
  const attempt = opts.attempt ?? 0;
  const { data: o } = await sb.from("orders").select("id, status, panel_username, plans(slug, months)").eq("id", orderId).maybeSingle();
  if (!o) return { ok: false, error: "Pedido não encontrado" };
  const allowed = opts.allowFailed ? ["renewal_failed"] : ["paid"];
  if (!allowed.includes(o.status)) return { ok: o.status === "renewed", skipped: true };

  const months = o.plans?.months ?? ({ mensal: 1, trimestral: 3, semestral: 6 } as Record<string, number>)[o.plans?.slug ?? ""] ?? 1;
  let user: PanelUser;
  try {
    user = await activate(o.panel_username, months);
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    console.error("[renew-customer]", orderId, attempt, msg);
    await sb.from("orders").update({ status: "renewal_failed", renewal_error: msg }).eq("id", orderId).in("status", allowed as ("paid" | "renewal_failed")[]);
    const next = attempt + 1;
    if (opts.manual) {
      // manual retry from /admin: no automatic follow-ups
    } else if (next <= RETRY_DELAYS_MIN.length) {
      const run_at = new Date(Date.now() + (RETRY_DELAYS_MIN[next - 1] ?? 15) * 60_000).toISOString();
      await sb.from("renewal_retries").upsert({ order_id: orderId, attempt: next, run_at, status: "pending" }, { onConflict: "order_id,attempt" });
    } else {
      await alertAdmin(orderId, o.panel_username, msg);
    }
    return { ok: false, error: msg };
  }

  const recorded = await recordRenewed(sb, orderId, allowed, months, attempt, user);
  if (!recorded.ok) return { ok: false, error: recorded.error };
  await sb.from("renewal_retries").update({ status: "cancelled" }).eq("order_id", orderId).eq("status", "pending");
  return { ok: true };
}

async function recordRenewed(
  sb: Awaited<ReturnType<typeof db>>,
  orderId: string,
  allowed: string[],
  months: number,
  attempt: number,
  user: PanelUser,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: upErr } = await sb.from("orders")
    .update({ status: "renewed", renewed_at: new Date().toISOString(), renewal_error: null })
    .eq("id", orderId).in("status", allowed as ("paid" | "renewal_failed")[]);
  const { error: evErr } = await sb.from("events").insert({
    order_id: orderId, type: "renewed",
    metadata: { months, attempt, exp_date: user.exp_date ?? null },
  });
  if (upErr || evErr) {
    const error = "Renovado no painel, mas não foi possível registrar no sistema. Confira o pedido manualmente.";
    console.error("[renew-customer] recorded after activation failed", orderId, upErr?.message, evErr?.message);
    return { ok: false, error };
  }
  return { ok: true };
}

async function alertAdmin(orderId: string, username: string, error: string) {
  const sb = await db();
  const chat = process.env["TELEGRAM_ADMIN_CHAT_ID"] ?? "";
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
  let sent = false;
  try {
    sent = await sendTelegram(chat, `⚠️ <b>Renovação falhou (3 tentativas)</b>\nPedido: <code>${orderId}</code>\nUsuário: <code>${esc(username)}</code>\nErro: ${esc(error)}`);
  } catch (e) { console.error("telegram alert failed", e); }
  await sb.from("notifications_log").insert({ order_id: orderId, channel: "telegram_admin", status: sent ? "sent" : "failed" });
}

/** Processes due retries; disarms the scheduler when the queue is empty. */
export async function processDueRetries() {
  const sb = await db();
  const { data: due } = await sb.from("renewal_retries").select("id, order_id, attempt")
    .eq("status", "pending").lte("run_at", new Date().toISOString()).limit(20);
  let processed = 0;
  for (const r of due ?? []) {
    const { data: claimed } = await sb.from("renewal_retries").update({ status: "running" })
      .eq("id", r.id).eq("status", "pending").select("id");
    if (!claimed?.length) continue;
    const res = await renewCustomer(r.order_id, { attempt: r.attempt, allowFailed: true });
    await sb.from("renewal_retries").update({ status: res.ok ? "done" : "failed", last_error: res.ok ? null : (res.error ?? null) }).eq("id", r.id);
    processed++;
  }
  return { processed };
}
