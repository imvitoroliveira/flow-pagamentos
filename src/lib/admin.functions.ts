import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Used by the /admin layout beforeLoad. Throws 403 for non-admins. */
export const checkAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("./admin.server");
    await assertAdmin(context as never);
    return { ok: true };
  });

/** Only booleans — never secret values. */
export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("./admin.server");
    await assertAdmin(context as never);
    const has = (k: string) => !!process.env[k];
    return {
      ABACATEPAY_API_KEY: has("ABACATEPAY_API_KEY"),
      ABACATEPAY_WEBHOOK_SECRET: has("ABACATEPAY_WEBHOOK_SECRET"),
      TELEGRAM_BOT_TOKEN: has("TELEGRAM_BOT_TOKEN"),
      PANEL_RENEW_URL: has("RENEWAL_API_URL") && has("RENEWAL_API_KEY"),
    };
  });
