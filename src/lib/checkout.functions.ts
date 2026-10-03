import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getPlans = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("plans")
    .select("id, slug, name, price_cents, months")
    .eq("active", true)
    .order("months");
  if (error) throw new Error("Falha ao carregar planos");
  return data;
});

const eventSchema = z.object({
  session_id: z.string().max(64),
  ref_code: z.string().max(16).nullable().optional(),
  type: z.enum(["page_view", "checkout_started"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const trackEvent = createServerFn({ method: "POST" })
  .inputValidator((d) => eventSchema.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    await db.from("events").insert({
      session_id: data.session_id,
      ref_code: data.ref_code ?? null,
      type: data.type,
      metadata: (data.metadata ?? {}) as never,
    });
    return { ok: true };
  });

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => createPaymentSchemaClient.parse(d))
  .handler(async ({ data }) => {
    const { createPayment, PublicError } = await import("./payments.server");
    try {
      return await createPayment(data);
    } catch (e) {
      if (e instanceof PublicError) throw new Error(e.message);
      console.error(e);
      throw new Error("Erro interno. Tente novamente.");
    }
  });

export const getOrderStatus = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getOrderPublicStatus } = await import("./payments.server");
    return (await getOrderPublicStatus(data.id)) ?? { status: null, plan_name: null, valid_until: null, whatsapp: null };
  });

// Client-safe copy of the payment input schema (payments.server is server-only).
const createPaymentSchemaClient = z.object({
  plan_slug: z.enum(["mensal", "trimestral", "semestral"]),
  panel_username: z.string().trim().min(2).max(64).regex(/^\S+$/),
  customer_name: z.string().trim().min(2).max(100),
  customer_email: z.string().trim().email().max(255).optional().or(z.literal("")).nullable(),
  customer_phone: z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().regex(/^\d{10,13}$/)),
  ref_code: z.string().trim().max(16).optional().nullable(),
  session_id: z.string().max(64).optional().nullable(),
});
