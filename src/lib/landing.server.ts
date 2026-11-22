// Server-only: public landing pages (read), visit tracking and Lead events (Meta CAPI). Service role, no browser access.
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

export type RequestInfo = { ip: string | null; userAgent: string | null; cookies: Record<string, string> };

export function readRequestInfo(request: Request): RequestInfo {
  const fwd = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "";
  const cookies = Object.fromEntries((request.headers.get("cookie") ?? "").split(";").map((p) => p.trim().split("=")).filter((p): p is [string, string] => !!p[0] && p[1] !== undefined));
  return { ip: fwd.split(",")[0]?.trim() || null, userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null, cookies };
}

const clean = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Records a visit: click row (with ref_code + Meta params) and view counter. Crawlers/link previews are ignored. */
export async function registerView(slug: string, body: { fbclid?: unknown }, info: RequestInfo): Promise<{ ref: string | null }> {
  const { isLinkPreviewBot } = await import("./link-bots");
  if (isLinkPreviewBot(info.userAgent)) return { ref: null };
  const sb = await db();
  const { data: lp } = await sb.from("landing_pages").select("id, campaign_id").eq("slug", slug).eq("active", true).maybeSingle<{ id: string; campaign_id: string | null }>();
  if (!lp) return { ref: null };
  const { makeRefCode, hashIp } = await import("./checkout.server");
  const fbclid = clean(body.fbclid);
  const fbc = clean(info.cookies["_fbc"]) ?? (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null);
  let ref: string | null = makeRefCode();
  for (let i = 0; i < 4; i++) {
    const { error } = await sb.from("clicks").insert({
      campaign_id: lp.campaign_id, ref_code: ref, fbp: clean(info.cookies["_fbp"]), fbc, fbclid,
      user_agent: info.userAgent, ip_hash: info.ip ? hashIp(info.ip) : null,
    });
    if (!error) break;
    ref = i === 3 ? null : makeRefCode();
  }
  if (ref) await sb.rpc("lp_bump", { p_id: lp.id, p_lead: false });
  return { ref };
}

export type LeadBody = { ref?: unknown; eventId?: unknown; fbp?: unknown; fbc?: unknown };

/** Counts the lead and sends the server-side "Lead" event. Needs a click row for the ref (registered by registerView). */
export async function registerLead(slug: string, body: LeadBody, info: RequestInfo, sourceUrl: string): Promise<{ ok: boolean }> {
  const ref = typeof body.ref === "string" && REF_RE.test(body.ref) ? body.ref : null;
  const eventId = typeof body.eventId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(body.eventId) ? body.eventId : null;
  if (!ref || !eventId) return { ok: false };
  const sb = await db();
  const { data: lp } = await sb.from("landing_pages").select("id, campaign_id, meta_pixel_id").eq("slug", slug).eq("active", true).maybeSingle<{ id: string; campaign_id: string | null; meta_pixel_id: string | null }>();
  if (!lp) return { ok: false };
  const { data: click } = await sb.from("clicks").select("id, fbc, fbp").eq("ref_code", ref).maybeSingle<{ id: string; fbc: string | null; fbp: string | null }>();
  if (!click) return { ok: false };

  // The Pixel cookies only exist after the page ran; complete the click with what the browser has now.
  const fbp = click.fbp ?? clean(body.fbp);
  const fbc = click.fbc ?? clean(body.fbc);
  if ((fbp && !click.fbp) || (fbc && !click.fbc)) await sb.from("clicks").update({ fbp, fbc }).eq("id", click.id);
  await sb.rpc("lp_bump", { p_id: lp.id, p_lead: true });

  try {
    const { getSetting } = await import("./integration-settings.server");
    const token = (await getSetting("META_CAPI_TOKEN")).value;
    if (!token) return { ok: true };
    let pixelId = lp.meta_pixel_id?.trim() || null;
    if (!pixelId && lp.campaign_id) pixelId = ((await sb.from("campaigns").select("meta_pixel_id").eq("id", lp.campaign_id).maybeSingle()).data as { meta_pixel_id: string | null } | null)?.meta_pixel_id?.trim() || null;
    pixelId = pixelId || (await getSetting("META_PIXEL_ID")).value;
    if (!pixelId) return { ok: true };
    const { sendMetaLead } = await import("./meta-capi");
    const testCode = (await getSetting("META_TEST_EVENT_CODE")).value;
    await sendMetaLead(pixelId, token, { eventId, sourceUrl, fbc, fbp, userAgent: info.userAgent, ip: info.ip, refCode: ref }, testCode);
  } catch (e) {
    console.error("[lp-lead] capi", (e as Error).message);
  }
  return { ok: true };
}
