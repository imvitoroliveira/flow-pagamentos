import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Scheduled backstop: settles PIX payments whose webhook never arrived and runs due renewal retries.
// Takes no input; every step is idempotent, so repeated calls are harmless.
export const Route = createFileRoute("/api/public/reconcile-payments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { reconcileRecentPayments } = await import("@/lib/payments.server");
        const { processDueRetries, processCreditSchedules } = await import("@/lib/renewal.server");
        const payments = await reconcileRecentPayments();
        const retries = await processDueRetries();
        const schedules = await processCreditSchedules();
        return Response.json({ payments, retries, schedules });
      },
    },
  },
});
