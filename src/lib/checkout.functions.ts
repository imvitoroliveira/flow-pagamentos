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

const orderSchema = z.object({
  plan_id: z.string().uuid(),
  customer_name: z.string().trim().min(2).max(100),
  customer_email: z.string().trim().email().max(255).optional().or(z.literal("")),
  customer_phone: z.string().trim().regex(/^\d{10,13}$/, "Telefone inválido"),
  panel_username: z.string().trim().min(2).max(64),
  ref_code: z.string().trim().max(16).optional().nullable(),
  session_id: z.string().max(64),
});

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => orderSchema.parse(d))
  .handler(async ({ data }) => {
    const { createAbacatePix } = await import("./checkout.server");
    const db = await admin();
    const { data: plan } = await db.from("plans").select("*").eq("id", data.plan_id).eq("active", true).single();
    if (!plan) throw new Error("Plano inválido");

    let campaign_id: string | null = null;
    let seller_id: string | null = null;
    const ref = data.ref_code?.toUpperCase() || null;
    if (ref) {
      const { data: click } = await db.from("clicks").select("campaign_id").eq("ref_code", ref).maybeSingle();
      campaign_id = click?.campaign_id ?? null;
      if (campaign_id) {
        const { data: c } = await db.from("campaigns").select("seller_id").eq("id", campaign_id).maybeSingle();
        seller_id = c?.seller_id ?? null;
      }
    }

    const event_id = crypto.randomUUID();
    const { data: order, error } = await db
      .from("orders")
      .insert({
        ref_code: ref,
        campaign_id,
        seller_id,
        customer_name: data.customer_name,
        customer_email: data.customer_email || null,
        customer_phone: data.customer_phone,
        panel_username: data.panel_username,
        plan_id: plan.id,
        amount_cents: plan.price_cents,
        event_id,
      })
      .select("id")
      .single();
    if (error || !order) throw new Error("Não foi possível criar o pedido");

    const pix = await createAbacatePix({
      amountCents: plan.price_cents,
      description: `NATV ${plan.name}`,
      name: data.customer_name,
      phone: data.customer_phone,
      email: data.customer_email || null,
      orderId: order.id,
    });

    await db
      .from("orders")
      .update({ abacate_id: pix.id, pix_brcode: pix.brCode, pix_qr_base64: pix.brCodeBase64 })
      .eq("id", order.id);
    await db.from("events").insert({
      session_id: data.session_id,
      ref_code: ref,
      order_id: order.id,
      type: "pix_generated",
      metadata: { plan: plan.slug, amount_cents: plan.price_cents },
    });

    return { order_id: order.id, brcode: pix.brCode, qr: pix.brCodeBase64, amount_cents: plan.price_cents };
  });

export const getOrderStatus = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: o } = await db.from("orders").select("status").eq("id", data.id).maybeSingle();
    return { status: o?.status ?? null };
  });
