// Server-only: renewal on the NATV reseller panel (https://revenda.pixbot.link, OpenAPI at /openapi.json).
//   POST /user/activation { username, months }  → renews (months: 1,2,3,4,5,6,12)
//   POST /user/search     { username }          → list of matching users (partial match)
import { sendTelegram } from "./checkout.server";
import { looksApplied, nextRunFor, scheduleStateAfterApply } from "./drip-schedule";

export const RETRY_DELAYS_MIN = [1, 5, 15];
const FAIL_RETRY_MIN = 30;
const LOW_CREDITS_THRESHOLD = 3;
const CREDIT_ALERT_COOLDOWN_MS = 86_400_000;

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function adminChatId() {
  return process.env["TELEGRAM_ADMIN_CHAT_ID"] || process.env["ADMIN_TELEGRAM_CHAT_ID"] || "-1003741340423";
}

const escapeHtml = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);

function panel() {
  const url = process.env["RENEWAL_API_URL"];
  const key = process.env["RENEWAL_API_KEY"];
  if (!url || !key) throw new Error("API de renovação não configurada (RENEWAL_API_URL/RENEWAL_API_KEY).");
  return { url: url.replace(/\/$/, ""), key };
}

export async function panelGet(path: string) {
  const { url, key } = panel();
  const res = await fetch(url + path, { headers: { Authorization: `Bearer ${key}` } });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { ok: res.ok, status: res.status, json, text };
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

/** The panel may or may not have applied the activation (no response, timeout or 5xx). Never retry blindly. */
export class PanelUncertainError extends Error {}

async function activate(username: string, months: number) {
  panel(); // configuration errors are definitive, not "uncertain"
  let r: Awaited<ReturnType<typeof panelPost>>;
  try {
    r = await panelPost("/user/activation", { username, months });
  } catch (e) {
    throw new PanelUncertainError(`Painel sem resposta: ${(e as Error).message}`);
  }
  if (!r.ok) {
    const detail = (r.json as { detail?: unknown } | null)?.detail;
    const msg = `Painel ${r.status}: ${typeof detail === "string" ? detail : r.text.slice(0, 200)}`;
    throw r.status >= 500 ? new PanelUncertainError(msg) : new Error(msg);
  }
  return r.json as PanelUser;
}

/** After an uncertain failure: asks the panel whether the months were really added. */
async function checkApplied(username: string, baselineExp: Date | null, startedAt: number, months: number): Promise<{ verdict: "applied"; user: PanelUser } | { verdict: "not_applied" | "unknown" }> {
  try {
    const u = await findPanelUser(username);
    if (!u) return { verdict: "not_applied" };
    const currentExp = u.exp_date ? new Date(u.exp_date * 1000) : null;
    return looksApplied({ baselineExp, startedAt, months, currentExp }) ? { verdict: "applied", user: u } : { verdict: "not_applied" };
  } catch {
    return { verdict: "unknown" };
  }
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
  // Fractional ("drip") renewal: activate only 1 month now; remaining months are applied
  // one by one by processCreditSchedules() shortly before each expiration.
  const activateNow = months > 1 ? 1 : months;
  // Baseline expiration (best effort): lets us tell, after an uncertain panel response, whether it was applied.
  const startedAt = Date.now();
  let baselineExp: Date | null = null;
  try { const u0 = await findPanelUser(o.panel_username); baselineExp = u0?.exp_date ? new Date(u0.exp_date * 1000) : null; } catch { /* optional */ }
  let user: PanelUser | null = null;
  let failure: Error | null = null;
  let unknownOutcome = false;
  try {
    user = await activate(o.panel_username, activateNow);
  } catch (e) {
    failure = e as Error;
    if (e instanceof PanelUncertainError) {
      const c = await checkApplied(o.panel_username, baselineExp, startedAt, activateNow);
      if (c.verdict === "applied") { user = c.user; failure = null; console.warn("[renew-customer] panel had applied the activation despite the error", orderId); }
      else if (c.verdict === "unknown") unknownOutcome = true;
    }
  }
  if (!user) {
    const msg = (failure?.message ?? "erro desconhecido").slice(0, 400) + (unknownOutcome ? " Resultado incerto: confira o vencimento no painel antes de repetir." : "");
    console.error("[renew-customer]", orderId, attempt, msg);
    await sb.from("orders").update({ status: "renewal_failed", renewal_error: msg }).eq("id", orderId).in("status", allowed as ("paid" | "renewal_failed")[]);
    const next = attempt + 1;
    if (opts.manual) {
      // manual retry from /admin: no automatic follow-ups
    } else if (unknownOutcome) {
      // can't tell whether the months were added: never retry automatically, a human must check the panel
      await alertAdmin(orderId, o.panel_username, msg, "Renovação com resultado incerto");
    } else if (next <= RETRY_DELAYS_MIN.length) {
      const run_at = new Date(Date.now() + (RETRY_DELAYS_MIN[next - 1] ?? 15) * 60_000).toISOString();
      await sb.from("renewal_retries").upsert({ order_id: orderId, attempt: next, run_at, status: "pending" }, { onConflict: "order_id,attempt" });
    } else {
      await alertAdmin(orderId, o.panel_username, msg);
    }
    return { ok: false, error: msg };
  }

  if (months > 1) {
    const exp = user.exp_date ? new Date(user.exp_date * 1000) : null;
    const { error: schErr } = await sb.from("credit_schedules").upsert({
      order_id: orderId, panel_username: o.panel_username, total_months: months, months_applied: 1,
      last_exp_date: exp?.toISOString() ?? null, next_run_at: nextRunFor(exp), status: "active",
    }, { onConflict: "order_id", ignoreDuplicates: true });
    if (schErr) console.error("[renew-customer] schedule insert failed", orderId, schErr.message);
  }
  const recorded = await recordRenewed(sb, orderId, allowed, activateNow, attempt, user);
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

async function alertAdmin(orderId: string, username: string, error: string, title = "Renovação falhou (3 tentativas)") {
  const sb = await db();
  let sent = false;
  try {
    sent = await sendTelegram(adminChatId(), `⚠️ <b>${escapeHtml(title)}</b>\nPedido: <code>${orderId}</code>\nUsuário: <code>${escapeHtml(username)}</code>\nErro: ${escapeHtml(error)}`);
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

// ─── Fractional credits ("Futuros") ──────────────────────────────────────

/** Applies 1 month to a schedule. Claims the row first so concurrent runs can't double-apply. */
export async function applyScheduleMonth(id: string, opts: { force?: boolean } = {}) {
  const sb = await db();
  const { data: s } = await sb.from("credit_schedules").select("*").eq("id", id).maybeSingle();
  if (!s) return { ok: false, error: "Agendamento não encontrado" };
  if (s.status !== "active" && !(opts.force && s.status === "paused")) return { ok: false, error: "Agendamento não está ativo" };
  if (s.months_applied >= s.total_months) {
    await sb.from("credit_schedules").update({ status: "done", next_run_at: null }).eq("id", id);
    return { ok: true };
  }
  const { data: claimed } = await sb.from("credit_schedules").update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", id).eq("months_applied", s.months_applied).in("status", ["active", "paused"]).select("id");
  if (!claimed?.length) return { ok: false, error: "Já está sendo processado" };
  const startedAt = Date.now();
  let user: PanelUser;
  try {
    user = await activate(s.panel_username, 1);
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    if (e instanceof PanelUncertainError) {
      const c = await checkApplied(s.panel_username, s.last_exp_date ? new Date(s.last_exp_date) : null, startedAt, 1);
      if (c.verdict === "applied") {
        console.warn("[drip] panel had applied the month despite the error", id);
        await recordScheduleApplied(sb, s, c.user, { recovered: true });
        return { ok: true };
      }
      if (c.verdict === "unknown") {
        // Outcome unknown: keep the row "running" so processCreditSchedules re-checks the panel before releasing it.
        return { ok: false, error: `${msg} Resultado incerto; será verificado automaticamente.` };
      }
    }
    await sb.from("credit_schedules").update({
      status: "active", last_error: msg, updated_at: new Date().toISOString(),
      next_run_at: new Date(Date.now() + FAIL_RETRY_MIN * 60_000).toISOString(),
    }).eq("id", id);
    if (!s.alerted_at) {
      let sent = false;
      try {
        sent = await sendTelegram(adminChatId(), `⚠️ <b>Renovação agendada falhou</b>\nUsuário: <code>${escapeHtml(s.panel_username)}</code>\nParcela: Mês ${s.months_applied + 1} de ${s.total_months}\nErro da API: ${escapeHtml(msg)}\nNova tentativa a cada ${FAIL_RETRY_MIN} min.`);
      } catch (err) { console.error("telegram drip alert failed", err); }
      await sb.from("notifications_log").insert({ order_id: s.order_id, channel: "telegram_admin", status: sent ? "sent" : "failed" });
      await sb.from("credit_schedules").update({ alerted_at: new Date().toISOString() }).eq("id", id);
    }
    return { ok: false, error: msg };
  }
  // The panel accepted the month. If saving fails or the process dies here, the row stays "running" and
  // recoverStaleSchedules() confirms with the panel instead of applying the month a second time.
  await recordScheduleApplied(sb, s, user);
  return { ok: true };
}

type ScheduleRow = { id: string; order_id: string; months_applied: number; total_months: number; last_exp_date: string | null };

/** Persists "1 more month applied" (state, expiration and event) for a schedule. */
async function recordScheduleApplied(sb: Awaited<ReturnType<typeof db>>, s: ScheduleRow, user: PanelUser, extra: Record<string, unknown> = {}) {
  const exp = user.exp_date ? new Date(user.exp_date * 1000) : null;
  const next = scheduleStateAfterApply(s, exp);
  const { error } = await sb.from("credit_schedules").update({
    ...next, last_exp_date: exp?.toISOString() ?? s.last_exp_date,
    last_error: null, alerted_at: null, updated_at: new Date().toISOString(),
  }).eq("id", s.id);
  if (error) { console.error("[drip] could not save applied month", s.id, error.message); return; }
  await sb.from("events").insert({ order_id: s.order_id, type: "renewed", metadata: { months: 1, drip: true, month: next.months_applied, of: s.total_months, exp_date: user.exp_date ?? null, ...extra } });
}

/**
 * Rows stuck in "running" for > 10 min (crash between panel activation and saving). Never put them back
 * blindly: ask the panel whether the month was applied. If the panel can't be reached the row stays as is.
 */
async function recoverStaleSchedules() {
  const sb = await db();
  const { data: stale } = await sb.from("credit_schedules").select("*")
    .eq("status", "running").lt("updated_at", new Date(Date.now() - 600_000).toISOString()).limit(20);
  for (const s of stale ?? []) {
    // updated_at is the lock token: only one worker recovers a given row
    const { data: got } = await sb.from("credit_schedules").update({ updated_at: new Date().toISOString() })
      .eq("id", s.id).eq("status", "running").eq("updated_at", s.updated_at).select("id");
    if (!got?.length) continue;
    const c = await checkApplied(s.panel_username, s.last_exp_date ? new Date(s.last_exp_date) : null, Date.parse(s.updated_at), 1);
    if (c.verdict === "unknown") continue;
    if (c.verdict === "applied") await recordScheduleApplied(sb, s, c.user, { recovered: true });
    else await sb.from("credit_schedules").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", s.id).eq("status", "running");
  }
}

/** Runs every due schedule (called by the reconcile cron). */
export async function processCreditSchedules() {
  const sb = await db();
  await recoverStaleSchedules();
  const { data: due } = await sb.from("credit_schedules").select("id").eq("status", "active").lte("next_run_at", new Date().toISOString()).limit(20);
  let applied = 0, failed = 0;
  for (const r of due ?? []) { const res = await applyScheduleMonth(r.id); if (res.ok) applied++; else failed++; }
  await checkLowCreditsAlert();
  return { applied, failed };
}

/** Warns the admin (at most once a day) when free panel credits are low or upcoming renewals exceed them. */
export async function checkLowCreditsAlert() {
  try {
    const credits = await getResellerCredits();
    if (credits === null) return;
    const sb = await db();
    const { count } = await sb.from("credit_schedules").select("id", { count: "exact", head: true })
      .eq("status", "active").lte("next_run_at", new Date(Date.now() + 3 * 86_400_000).toISOString());
    const upcoming = count ?? 0;
    if (credits >= LOW_CREDITS_THRESHOLD && upcoming <= credits) return;
    const { data: recent } = await sb.from("notifications_log").select("id")
      .eq("channel", "telegram_credit_alert").eq("status", "sent")
      .gte("created_at", new Date(Date.now() - CREDIT_ALERT_COOLDOWN_MS).toISOString()).limit(1);
    if (recent?.length) return;
    const sent = await sendTelegram(adminChatId(), `⚠️ <b>Atenção: Saldo de créditos NATV baixo</b>\nCréditos livres: ${credits}\nRenovações previstas em 3 dias: ${upcoming}\nRecarregue no painel para evitar falhas.`);
    await sb.from("notifications_log").insert({ channel: "telegram_credit_alert", status: sent ? "sent" : "failed" });
  } catch (e) {
    console.error("[low-credits-alert]", e);
  }
}

// ─── Panel client list ("Clientes") ──────────────────────────────────────
type ReportItem = { i: string; u: string; p: string; n?: string | null; d: string; l: string; e: string; c: string; o?: string | null; t: string; b: string };
const spDate = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? new Date(s.replace(" ", "T") + "-03:00").toISOString() : null);

/** Pulls every client from the panel into panel_clients (panel limit: 1 request / 60s). */
export async function syncPanelClients() {
  const r = await panelGet("/report/allusers");
  if (r.status === 429) return { ok: false as const, error: "O painel permite 1 sincronização por minuto. Aguarde e tente de novo." };
  if (!r.ok || !Array.isArray(r.json)) return { ok: false as const, error: `Painel respondeu ${r.status}.` };
  const now = new Date().toISOString();
  const rows = (r.json as ReportItem[]).map((x) => ({
    panel_id: String(x.i), username: x.u, password: x.p ?? null, notes: x.n ?? null,
    phone: (x.o ?? x.n ?? "").replace(/\D/g, "") || null,
    expires_at: spDate(x.e), last_seen_at: spDate(x.l), registered_at: spDate(x.d),
    status: x.t ?? null, blocked: String(x.b).toLowerCase() === "yes", connections: Number(x.c) || null, synced_at: now,
  }));
  const sb = await db();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("panel_clients").upsert(rows.slice(i, i + 500), { onConflict: "panel_id" });
    if (error) return { ok: false as const, error: "Não foi possível salvar os clientes." };
  }
  return { ok: true as const, count: rows.length };
}

export async function getResellerCredits(): Promise<number | null> {
  const r = await panelGet("/reseller/me");
  if (!r.ok) return null;
  const c = (r.json as { credits?: number } | null)?.credits;
  return typeof c === "number" ? c : null;
}
