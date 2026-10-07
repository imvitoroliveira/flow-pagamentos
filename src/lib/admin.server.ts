// Server-only admin helpers. Use inside createServerFn handlers that run requireSupabaseAuth.
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthCtx = { supabase: SupabaseClient; userId: string; claims?: { email?: string } & Record<string, unknown> };

export async function assertAdmin(context: AuthCtx) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) {
    throw new Response("Forbidden", { status: 403 });
  }
}

export async function logAdminAction(
  context: AuthCtx,
  entry: { action: string; entity?: string; entity_id?: string; details?: Record<string, unknown> },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_audit_log").insert({
    admin_user_id: context.userId,
    admin_email: (context.claims?.email as string | undefined) ?? null,
    action: entry.action,
    entity: entry.entity ?? null,
    entity_id: entry.entity_id ?? null,
    details: (entry.details ?? {}) as never,
  });
}

/** Sends a Telegram message and returns a human-readable pt-BR error (never the token). */
export async function telegramSendVerbose(chatId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return { ok: false, error: "Bot do Telegram não configurado (TELEGRAM_BOT_TOKEN pendente)." };
  if (!chatId) return { ok: false, error: "Chat ID não informado." };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (res.ok) return { ok: true };
    const j = (await res.json().catch(() => ({}))) as { description?: string };
    const d = (j.description ?? "").toLowerCase();
    if (d.includes("chat not found") || d.includes("bot can't initiate") || d.includes("blocked"))
      return { ok: false, error: "Bot não iniciado pelo destinatário (ou bloqueado). Peça para abrir o bot e enviar /start." };
    if (res.status === 401) return { ok: false, error: "Token do bot inválido." };
    return { ok: false, error: `Telegram recusou a mensagem (${res.status}).` };
  } catch {
    return { ok: false, error: "Não foi possível falar com o Telegram." };
  }
}
