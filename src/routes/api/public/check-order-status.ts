import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/public/check-order-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("order_id"));
        if (!id.success) return Response.json({ error: "order_id inválido" }, { status: 400 });
        const { getOrderPublicStatus } = await import("@/lib/payments.server");
        const s = await getOrderPublicStatus(id.data);
        if (!s) return Response.json({ error: "Pedido não encontrado" }, { status: 404 });
        return Response.json(s, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
