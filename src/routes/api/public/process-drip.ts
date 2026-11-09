import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Daily job (08:00 America/Sao_Paulo = 11:00 UTC): applies the next month of every due "Futuros" schedule.
// Kept apart from /api/public/reconcile-payments, which runs every 2 min for PIX payments and immediate retries.
export const Route = createFileRoute("/api/public/process-drip")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { processCreditSchedules } = await import("@/lib/renewal.server");
        const schedules = await processCreditSchedules();
        return Response.json({ ok: true, schedules });
      },
    },
  },
});
