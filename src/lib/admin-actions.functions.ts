import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { campaignSchema, sellerSchema } from "./admin-schemas";

type Ctx = Parameters<typeof import("./admin.server").assertAdmin>[0];
async function guard(context: unknown) {
  const m = await import("./admin.server");
  await m.assertAdmin(context as Ctx);
  return { ...m, ctx: context as Ctx & { supabase: import("@supabase/supabase-js").SupabaseClient } };
}
const fail = (error: string) => ({ ok: false as const, error });

// ─── campaigns ────────────────────────────────────────────────────────────
export const saveCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => campaignSchema.extend({ id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { ctx, logAdminAction } = await guard(context);
    const { id, slug, ...rest } = data;
    const row = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === "" ? null : v]));
    if (id) {
      const { error } = await ctx.supabase.from("campaigns").update(row).eq("id", id);
      if (error) return fail("Não foi possível salvar a campanha.");
      await logAdminAction(ctx, { action: "campaign.update", entity: "campaign", entity_id: id, details: { name: data.name } });
      return { ok: true as const, id };
    }
    const { data: c, error } = await ctx.supabase.from("campaigns").insert({ ...row, slug, name: data.name } as never).select("id").single();
    if (error) return fail(error.code === "23505" ? "Este slug já está em uso." : "Não foi possível criar a campanha.");
    await logAdminAction(ctx, { action: "campaign.create", entity: "campaign", entity_id: c.id, details: { name: data.name, slug } });
    return { ok: true as const, id: c.id as string };
  });

export const setCampaignActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { ctx, logAdminAction } = await guard(context);
    const { error } = await ctx.supabase.from("campaigns").update({ active: data.active }).eq("id", data.id);
    if (error) return fail("Não foi possível atualizar.");
    await logAdminAction(ctx, { action: data.active ? "campaign.activate" : "campaign.archive", entity: "campaign", entity_id: data.id });
    return { ok: true as const };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { ctx, logAdminAction } = await guard(context);
    const [c, o] = await Promise.all([
      ctx.supabase.from("clicks").select("id", { count: "exact", head: true }).eq("campaign_id", data.id),
      ctx.supabase.from("orders").select("id", { count: "exact", head: true }).eq("campaign_id", data.id),
    ]);
    if ((c.count ?? 0) > 0 || (o.count ?? 0) > 0) return fail("Campanha com cliques ou pedidos não pode ser excluída. Arquive-a.");
    const { error } = await ctx.supabase.from("campaigns").delete().eq("id", data.id);
    if (error) return fail("Não foi possível excluir.");
    await logAdminAction(ctx, { action: "campaign.delete", entity: "campaign", entity_id: data.id });
    return { ok: true as const };
  });

// ─── sellers ──────────────────────────────────────────────────────────────
export const saveSeller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sellerSchema.extend({ id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { ctx, logAdminAction } = await guard(context);
    const row = { name: data.name, telegram_chat_id: data.telegram_chat_id || null, active: data.active };
    const r = data.id
      ? await ctx.supabase.from("sellers").update(row).eq("id", data.id).select("id").single()
      : await ctx.supabase.from("sellers").insert(row).select("id").single();
    if (r.error) return fail("Não foi possível salvar o vendedor.");
    await logAdminAction(ctx, { action: data.id ? "seller.update" : "seller.create", entity: "seller", entity_id: r.data.id, details: { name: data.name, active: data.active } });
    return { ok: true as const };
  });

export const deleteSeller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { ctx, logAdminAction } = await guard(context);
    const [o, k] = await Promise.all([
      ctx.supabase.from("orders").select("id", { count: "exact", head: true }).eq("seller_id", data.id),
      ctx.supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("seller_id", data.id),
    ]);
    if ((o.count ?? 0) > 0 || (k.count ?? 0) > 0) return fail("Vendedor com pedidos ou campanhas não pode ser excluído. Desative-o.");
    const { error } = await ctx.supabase.from("sellers").delete().eq("id", data.id);
    if (error) return fail("Não foi possível excluir.");
    await logAdminAction(ctx, { action: "seller.delete", entity: "seller", entity_id: data.id });
    return { ok: true as const };
  });

export const testSellerTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { ctx, telegramSendVerbose, logAdminAction } = await guard(context);
    const { data: s } = await ctx.supabase.from("sellers").select("name, telegram_chat_id").eq("id", data.id).single();
    if (!s?.telegram_chat_id) return fail("Este vendedor não tem chat ID.");
    const r = await telegramSendVerbose(s.telegram_chat_id, `✅ Teste NATV: ${s.name}, suas notificações de venda chegarão aqui.`);
    if (r.ok) await ctx.supabase.from("sellers").update({ telegram_tested_at: new Date().toISOString() }).eq("id", data.id);
    await logAdminAction(ctx, { action: "seller.telegram_test", entity: "seller", entity_id: data.id, details: { ok: r.ok } });
    return r;
  });

// ─── settings: plans ──────────────────────────────────────────────────────
export const updatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(), name: z.string().trim().min(2).max(60),
    price_cents: z.number().int().positive().max(10_000_000), months: z.number().int().min(1).max(12), active: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { ctx, logAdminAction } = await guard(context);
    const { data: before } = await ctx.supabase.from("plans").select("name, price_cents, months, active").eq("id", data.id).single();
    const { id, ...patch } = data;
    const { error } = await ctx.supabase.from("plans").update(patch).eq("id", id);
    if (error) return fail("Não foi possível salvar o plano.");
    await logAdminAction(ctx, { action: "plan.update", entity: "plan", entity_id: id, details: { before, after: patch } });
    return { ok: true as const };
  });

// ─── settings: integrations ───────────────────────────────────────────────
const anyEnv = (...k: string[]) => k.some((x) => !!process.env[x]);

export const getIntegrationDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context);
    const { ABACATE_API_VERSION } = await import("./payments.server");
    const items: { key: string; label: string; ok: boolean; optional?: boolean }[] = [
      { key: "ABACATEPAY_API_KEY", label: "Chave da AbacatePay", ok: anyEnv("ABACATEPAY_API_KEY") },
      { key: "ABACATEPAY_WEBHOOK_SECRET", label: "Segredo do webhook", ok: anyEnv("ABACATEPAY_WEBHOOK_SECRET") },
      { key: "ABACATEPAY_HMAC_KEY", label: "Chave HMAC (opcional)", ok: anyEnv("ABACATEPAY_HMAC_KEY"), optional: true },
      { key: "TELEGRAM_BOT_TOKEN", label: "Bot do Telegram", ok: anyEnv("TELEGRAM_BOT_TOKEN") },
      { key: "ADMIN_TELEGRAM_CHAT_ID", label: "Chat do admin no Telegram", ok: anyEnv("ADMIN_TELEGRAM_CHAT_ID", "TELEGRAM_ADMIN_CHAT_ID") },
      { key: "PANEL_RENEW_URL", label: "Endereço do painel de renovação", ok: anyEnv("PANEL_RENEW_URL", "RENEWAL_API_URL") },
      { key: "PANEL_API_KEY", label: "Chave do painel de renovação", ok: anyEnv("PANEL_API_KEY", "RENEWAL_API_KEY") },
      { key: "CRON_SECRET", label: "Segredo das tarefas agendadas", ok: anyEnv("CRON_SECRET", "LOVABLE_CRON_SECRET") },
      { key: "META_CAPI_TOKEN", label: "Meta Conversions API", ok: anyEnv("META_CAPI_TOKEN"), optional: true },
      { key: "TIKTOK_EVENTS_TOKEN", label: "TikTok Events API", ok: anyEnv("TIKTOK_EVENTS_TOKEN"), optional: true },
      { key: "SUPPORT_WHATSAPP", label: "WhatsApp de suporte", ok: anyEnv("SUPPORT_WHATSAPP") },
    ];
    return { items, abacateVersion: ABACATE_API_VERSION };
  });

export const testAdminTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ctx, telegramSendVerbose, logAdminAction } = await guard(context);
    const chat = process.env["ADMIN_TELEGRAM_CHAT_ID"] ?? process.env["TELEGRAM_ADMIN_CHAT_ID"] ?? "";
    if (!chat) return fail("Chat do admin não configurado (ADMIN_TELEGRAM_CHAT_ID pendente).");
    const r = await telegramSendVerbose(chat, "✅ Teste NATV: alertas do painel chegarão aqui.");
    await logAdminAction(ctx, { action: "settings.telegram_test", details: { ok: r.ok } });
    return r;
  });

export const testPanelConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ctx, logAdminAction } = await guard(context);
    const { findPanelUser } = await import("./renewal.server");
    let r: { ok: true } | { ok: false; error: string };
    try { await findPanelUser("natv_conn_test"); r = { ok: true }; }
    catch { r = fail("O painel de renovação não respondeu ou recusou a chave."); }
    await logAdminAction(ctx, { action: "settings.panel_test", details: { ok: r.ok } });
    return r;
  });

// ─── settings: team ───────────────────────────────────────────────────────
export const inviteAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().trim().toLowerCase().email().max(255), redirectTo: z.string().url().max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { ctx, logAdminAction } = await guard(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let userId: string | undefined;
    const inv = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, { redirectTo: `${new URL(data.redirectTo).origin}/reset-password` });
    if (inv.error) {
      // Already registered: find the existing account and grant the role.
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      userId = list?.users.find((u) => u.email?.toLowerCase() === data.email)?.id;
      if (!userId) return fail("Não foi possível enviar o convite.");
    } else userId = inv.data.user?.id;
    if (!userId) return fail("Não foi possível enviar o convite.");
    const { data: has } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!has) {
      const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "admin" });
      if (error) return fail("Convite enviado, mas não foi possível conceder a permissão.");
    }
    await logAdminAction(ctx, { action: "admin.invite", entity: "user", entity_id: userId, details: { email: data.email, invited: !inv.error } });
    return { ok: true as const, invited: !inv.error };
  });

export const revokeAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { ctx, logAdminAction } = await guard(context);
    if (data.user_id === ctx.userId) return fail("Você não pode remover a própria permissão.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) <= 1) return fail("Não é possível remover o último admin.");
    const { error } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", "admin");
    if (error) return fail("Não foi possível remover a permissão.");
    await logAdminAction(ctx, { action: "admin.revoke", entity: "user", entity_id: data.user_id });
    return { ok: true as const };
  });
