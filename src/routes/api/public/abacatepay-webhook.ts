import { createFileRoute } from "@tanstack/react-router";

type Payload = {
  event?: string;
  data?: {
    transparent?: { id?: string; metadata?: { order_id?: string } };
    pixQrCode?: { id?: string; metadata?: { order_id?: string } };
    billing?: { id?: string; metadata?: { order_id?: string } };
    metadata?: { order_id?: string };
  };
};

const PAID_EVENTS = new Set(["transparent.completed", "billing.paid"]);

export const Route = createFileRoute("/api/public/abacatepay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyAbacateWebhook, settlePaidOrder } = await import("@/lib/payments.server");
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

        const raw = await request.text();
        const authError = verifyAbacateWebhook(new URL(request.url), raw, request.headers.get("x-webhook-signature"));
        let payload: Payload | null = null;
        try { payload = JSON.parse(raw); } catch { /* keep null */ }

        const { data: log } = await db
          .from("webhook_logs")
          .insert({
            provider: "abacatepay",
            event: payload?.event ?? null,
            payload: (payload ?? { raw: raw.slice(0, 5000) }) as never,
            processed: false,
            error: authError,
          })
          .select("id")
          .single();
        if (authError) return new Response("Unauthorized", { status: 401 });

        const finish = async (error: string | null) => {
          if (log) await db.from("webhook_logs").update({ processed: !error, error }).eq("id", log.id);
        };

        try {
          if (!PAID_EVENTS.has(payload?.event ?? "")) {
            await finish(null);
            return new Response("ignored");
          }
          const d = payload?.data ?? {};
          const orderId = d.transparent?.metadata?.order_id ?? d.pixQrCode?.metadata?.order_id ?? d.billing?.metadata?.order_id ?? d.metadata?.order_id;
          const abacateId = d.transparent?.id ?? d.pixQrCode?.id ?? d.billing?.id;

          let q = db.from("orders").select("id, status");
          q = orderId ? q.eq("id", orderId) : q.eq("abacate_id", abacateId ?? "__none__");
          const { data: order } = await q.maybeSingle();
          if (!order) throw new Error("pedido não encontrado");

          const result = await settlePaidOrder(order.id);
          if (result.alreadyProcessed) {
            await finish(null);
            return new Response("already processed");
          }
          await finish(result.failed.length ? result.failed.join("; ") : null);
          return new Response("ok");
        } catch (e) {
          await finish((e as Error).message);
          return new Response("ok"); // valid event: always 200; error stored in webhook_logs
        }
      },
    },
  },
});
