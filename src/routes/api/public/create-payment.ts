import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/create-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { createPayment, createPaymentSchema, PublicError } = await import("@/lib/payments.server");
        const body = await request.json().catch(() => null);
        const parsed = createPaymentSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
        }
        try {
          return Response.json(await createPayment(parsed.data));
        } catch (e) {
          const msg = e instanceof PublicError ? e.message : "Erro interno";
          if (!(e instanceof PublicError)) console.error(e);
          return Response.json({ error: msg }, { status: e instanceof PublicError ? 422 : 500 });
        }
      },
    },
  },
});
