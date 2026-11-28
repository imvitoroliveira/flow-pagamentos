// Server-only: public landing pages (read), visit tracking and Lead events (Meta CAPI). Service role, no browser access.
import { requestCf, resolveUf } from "./geo";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_BENEFITS, DEFAULT_FAQ, REF_RE, resolveWhatsapp, type Benefit, type FaqItem, type LandingPageRow, type PublicLanding } from "./landing";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient; // landing_pages is newer than the generated types
}

const DEFAULT_MESSAGE = "Olá! Quero meu teste grátis.";

export async function getPublicLanding(slug: string): Promise<PublicLanding | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return null;
  const sb = await db();
  const { data: lp } = await sb.from("landing_pages").select("*").eq("slug", slug).eq("active", true).maybeSingle<LandingPageRow>();
  if (!lp) return null;
  const { data: camp } = lp.campaign_id
    ? await sb.from("campaigns").select("destination_whatsapp, prefilled_message, meta_pixel_id").eq("id", lp.campaign_id).maybeSingle()
    : { data: null };
  const { getSetting } = await import("./integration-settings.server");
  const pixelId = lp.meta_pixel_id?.trim() || camp?.meta_pixel_id?.trim() || (await getSetting("META_PIXEL_ID")).value;
  const benefits: Benefit[] = Array.isArray(lp.benefits) && lp.benefits.length ? lp.benefits : DEFAULT_BENEFITS;
  const faq: FaqItem[] = Array.isArray(lp.faq) && lp.faq.length ? lp.faq : DEFAULT_FAQ;
  return {
    slug: lp.slug, headline: lp.headline, subheadline: lp.subheadline, ctaText: lp.cta_text, ctaSubtext: lp.cta_subtext, badgeTop: lp.badge_top,
    benefits, faq, pixelId: pixelId || null,
    whatsapp: resolveWhatsapp(lp.whatsapp_number, camp?.destination_whatsapp),
    message: lp.whatsapp_message?.trim() || camp?.prefilled_message?.trim() || DEFAULT_MESSAGE,
  };
}

export type RequestInfo = { ip: string | null; userAgent: string | null; cookies: Record<string, string>; allowed: boolean; explicit: boolean; choiceId: string | null; country: string | null; region: string | null };

export async function readRequestInfo(request: Request): Promise<RequestInfo> {
  const { advertisingPermission, requestCookies } = await import("./advertising.server");
  const permission = await advertisingPermission(request);
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "";
  // Brazilian state (UF) from the hosting geo header; only kept for Brazilian visitors and valid 2-letter codes.
  // (header first, then request.cf; unknown country is treated as Brazil, a known foreign country is not)
  const cf = requestCf(request);
  const country = permission.country ?? cf?.country ?? null;
  const region = resolveUf(request.headers.get("cf-region-code"), cf, country);
  return { ...permission, country, region, cookies: permission.allowed ? requestCookies(request) : {}, ip: ip.split(",")[0]?.trim() || null, userAgent: request.headers.get("user-agent")?.slice(0,500) ?? null };
}

export async function registerView(slug: string, body: { sessionId: string; ref?: string | null | undefined; fbclid?: string | null | undefined }, info: RequestInfo): Promise<{ ref: string | null }> {
  const { isLinkPreviewBot } = await import("./link-bots");
  if (isLinkPreviewBot(info.userAgent)) return { ref: null };
  const sb = await db();
  const { makeRefCode, hashIp } = await import("./checkout.server");
  const fbclid = info.allowed ? body.fbclid ?? null : null;
  // fbclid is opaque: do NOT truncate it to 200 characters, which breaks Meta matching.
  const fbc = info.allowed ? info.cookies["_fbc"] ?? (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null) : null;
  for(let i=0;i<4;i++) {
    const { data, error } = await sb.rpc("record_landing_view", {p_slug:slug,p_session:body.sessionId,p_ref:makeRefCode(),p_fbclid:fbclid,p_fbc:fbc,p_fbp:info.cookies["_fbp"]??null,p_ua:info.userAgent,p_ip_hash:info.ip?hashIp(info.ip):null,p_country:info.country,p_choice:info.choiceId,p_allowed:info.allowed});
    if(!error) {
      const ref = typeof data === "string" ? data : null;
      if (ref && info.region) await sb.from("clicks").update({ state: info.region }).eq("ref_code", ref).is("state", null);
      return { ref };
    }
    if(error.code!=="23505") { console.error("[lp-view] database",error.code,error.message); throw new Error("Falha ao registrar visita"); }
  }
  throw new Error("Falha ao gerar referência");
}

export type LeadBody = { ref: string; fbp?: string | null | undefined; fbc?: string | null | undefined };
export async function registerLead(slug: string, body: LeadBody, info: RequestInfo, sourceUrl: string) {
  const sb = await db();
  const {data,error} = await sb.rpc("record_landing_lead",{p_slug:slug,p_ref:body.ref});
  if(error) throw new Error("Falha ao registrar clique no WhatsApp");
  const click = data as {id:string;lead_at:string;meta_lead_status:string|null;fbp:string|null;fbc:string|null;advertising_allowed:boolean;advertising_choice_id:string|null} | null;
  if(!click) return {ok:false};
  if(click.meta_lead_status === "sent" || click.meta_lead_status === "test") return {ok:true,meta:click.meta_lead_status};
  const fbp = info.allowed ? body.fbp ?? click.fbp : null;
  const fbc = info.allowed ? body.fbc ?? click.fbc : null;
  await sb.from("clicks").update({fbp,fbc,advertising_allowed:info.allowed,advertising_choice_id:info.choiceId}).eq("id",click.id);
  const {clickPermission} = await import("./advertising.server");
  const permission = await clickPermission(body.ref);
  let status = "blocked";
  let failure: string | null = null;
  if(info.allowed && permission.allowed) {
    const {getSetting} = await import("./integration-settings.server");
    const [token,globalPixel,testCode] = await Promise.all([getSetting("META_CAPI_TOKEN"),getSetting("META_PIXEL_ID"),getSetting("META_TEST_EVENT_CODE")]);
    const {data:lp} = await sb.from("landing_pages").select("meta_pixel_id,campaign_id").eq("slug",slug).maybeSingle();
    const {data:campaign} = lp?.campaign_id ? await sb.from("campaigns").select("meta_pixel_id").eq("id",lp.campaign_id).maybeSingle() : {data:null};
    const pixelId = lp?.meta_pixel_id || campaign?.meta_pixel_id || globalPixel.value;
    status = "not_configured";
    if(token.value && pixelId) {
      const {sendMetaLead} = await import("./meta-capi");
      const {leadEventId} = await import("./landing-tracking");
      const result = await sendMetaLead(pixelId,token.value,{eventId:leadEventId(body.ref),sourceUrl,fbc,fbp,userAgent:info.userAgent,ip:info.ip,eventTime:Math.floor(new Date(click.lead_at).getTime()/1000)},testCode.value);
      status = result.ok ? testCode.value ? "test" : "sent" : "failed";
      failure = result.error;
    }
  }
  await sb.from("clicks").update({meta_lead_status:status,meta_lead_error:failure}).eq("id",click.id);
  return {ok:true,meta:status};
}
