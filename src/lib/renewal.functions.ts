import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** validate-username: public check that the app user exists on the panel. */
export const validateUsername = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ username: z.string().trim().min(2).max(64).regex(/^\S+$/) }).parse(d))
  .handler(async ({ data }) => {
    const { findPanelUser } = await import("./renewal.server");
    try {
      const u = await findPanelUser(data.username);
      return { exists: !!u, checked: true };
    } catch (e) {
      console.error("validate-username", e);
      return { exists: true, checked: false }; // panel unavailable: don't block
    }
  });

/** Admin action: "Tentar renovar novamente". */
export const retryRenewal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Sem permissão");
    const { renewCustomer } = await import("./renewal.server");
    const r = await renewCustomer(data.order_id, { allowFailed: true, manual: true });
    return { ok: !!r.ok, error: "error" in r ? (r.error ?? null) : null };
  });
