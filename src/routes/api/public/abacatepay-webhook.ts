import { createFileRoute } from "@tanstack/react-router";

type Payload = {
  event?: string;
  data?: {
    pixQrCode?: { id?: string; metadata?: { order_id?: string } };
    billing?: { id?: string; metadata?: { order_id?: string } };
    metadata?: { order_id?: string };
  };
};

export const Route = createFileRoute("/api/public/abacatepay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyAbacateWebhook, renewCustomer, notifySeller, sendConversionEvents } = await import("@/lib/payments.server");
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
          if (payload?.event !== "billing.paid") {
            await finish(null);
            return new Response("ignored");
          }
          const d = payload.data ?? {};
          const orderId = d.pixQrCode?.metadata?.order_id ?? d.billing?.metadata?.order_id ?? d.metadata?.order_id;
          const abacateId = d.pixQrCode?.id ?? d.billing?.id;

          let q = db.from("orders").select("id, status, ref_code, event_id");
          q = orderId ? q.eq("id", orderId) : q.eq("abacate_id", abacateId ?? "__none__");
          const { data: order } = await q.maybeSingle();
          if (!order) throw new Error("pedido não encontrado");

          if (order.status === "paid" || order.status === "renewed") {
            await finish(null);
            return new Response("already processed");
          }

          // Idempotent transition: only flips rows that are not already paid/renewed.
          const { data: updated } = await db
            .from("orders")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", order.id)
            .not("status", "in", "(paid,renewed)")
            .select("id");
          if (!updated?.length) {
            await finish(null);
            return new Response("already processed");
          }
          await db.from("events").insert({ order_id: order.id, ref_code: order.ref_code, type: "paid", metadata: { event_id: order.event_id } });

          const steps = await Promise.allSettled([renewCustomer(order.id), notifySeller(order.id), sendConversionEvents(order.id)]);
          const failed = steps.filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => String(s.reason));
          await finish(failed.length ? failed.join("; ") : null);
          return new Response("ok");
        } catch (e) {
          await finish((e as Error).message);
          return new Response("ok"); // valid event: always 200; error stored in webhook_logs
        }
      },
    },
  },
});
