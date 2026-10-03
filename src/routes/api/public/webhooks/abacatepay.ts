import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const Route = createFileRoute("/api/public/webhooks/abacatepay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["ABACATEPAY_WEBHOOK_SECRET"];
        const given = new URL(request.url).searchParams.get("webhookSecret") ?? "";
        if (!secret || !safeEq(given, secret)) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { sendTelegram, renewOnPanel, brl } = await import("@/lib/checkout.server");

        const payload = (await request.json().catch(() => null)) as {
          event?: string;
          data?: { pixQrCode?: { id?: string }; billing?: { id?: string } };
        } | null;
        const { data: log } = await db
          .from("webhook_logs")
          .insert({ provider: "abacatepay", event: payload?.event ?? null, payload: payload as never })
          .select("id")
          .single();
        const finish = (processed: boolean, error?: string) =>
          log && db.from("webhook_logs").update({ processed, error: error ?? null }).eq("id", log.id);

        try {
          if (payload?.event !== "billing.paid") {
            await finish(true);
            return new Response("ignored");
          }
          const abacateId = payload.data?.pixQrCode?.id ?? payload.data?.billing?.id;
          if (!abacateId) throw new Error("id ausente");
          const { data: order } = await db
            .from("orders")
            .select("*, plans(name, months), sellers(name, telegram_chat_id)")
            .eq("abacate_id", abacateId)
            .maybeSingle();
          if (!order) throw new Error("pedido não encontrado");
          if (order.status !== "pending") {
            await finish(true);
            return new Response("already processed");
          }

          await db.from("orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", order.id);
          await db.from("events").insert({ order_id: order.id, ref_code: order.ref_code, type: "paid", metadata: { event_id: order.event_id } });

          // Renewal
          let renewed = false;
          try {
            await renewOnPanel(order.panel_username, order.plans?.months ?? 1);
            await db.from("orders").update({ status: "renewed", renewed_at: new Date().toISOString() }).eq("id", order.id);
            await db.from("events").insert({ order_id: order.id, ref_code: order.ref_code, type: "renewed", metadata: {} });
            renewed = true;
          } catch (e) {
            await db.from("orders").update({ status: "renewal_failed", renewal_error: (e as Error).message }).eq("id", order.id);
          }

          // Notifications
          const text = `${renewed ? "✅ Renovado" : "⚠️ Pago (renovação falhou)"}\n<b>${order.customer_name}</b> — ${order.panel_username}\nPlano: ${order.plans?.name} • ${brl(order.amount_cents)}\nTel: ${order.customer_phone}`;
          const chats = [process.env["TELEGRAM_ADMIN_CHAT_ID"], order.sellers?.telegram_chat_id].filter(Boolean) as string[];
          for (const chat of chats) {
            const ok = await sendTelegram(chat, text).catch(() => false);
            await db.from("notifications_log").insert({ order_id: order.id, channel: `telegram:${chat}`, status: ok ? "sent" : "failed" });
          }

          await finish(true);
          return new Response("ok");
        } catch (e) {
          await finish(false, (e as Error).message);
          return new Response("error", { status: 200 });
        }
      },
    },
  },
});
