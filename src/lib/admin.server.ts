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
