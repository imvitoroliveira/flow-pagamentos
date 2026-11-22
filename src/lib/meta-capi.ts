// Meta Conversions API helpers (server-side): "Purchase" and "Lead" events. Builders are pure; only sendMetaLead does I/O.
import { createHash } from "crypto";

export const META_API_VERSION = "v26.0";
export const metaEventsUrl = (pixelId: string) => `https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(pixelId)}/events`;

const sha256 = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

/** Meta wants e-mail trimmed + lowercased, then SHA-256 (hex). */
export const hashEmail = (email: string | null | undefined): string | null => {
  const v = (email ?? "").trim().toLowerCase();
  return v ? sha256(v) : null;
};

/** Brazilian phone → digits with country code (55), then SHA-256. Returns null when it doesn't look like a BR number. */
export function hashPhoneBR(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!/^55\d{10,11}$/.test(d)) return null;
  return sha256(d);
}

export const hashExternalId = (id: string | null | undefined): string | null => {
  const v = (id ?? "").trim().toLowerCase();
  return v ? sha256(v) : null;
};

export type PurchaseInput = {
  eventId: string;
  orderId: string;
  paidAt: string; // ISO
  amountCents: number;
  sourceUrl: string;
  email?: string | null;
  phone?: string | null;
  panelUsername?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  userAgent?: string | null;
};

type UserData = { em?: string[]; ph?: string[]; external_id?: string[]; fbc?: string; fbp?: string; client_user_agent?: string; client_ip_address?: string };

export function buildPurchaseEvent(i: PurchaseInput) {
  const em = hashEmail(i.email);
  const ph = hashPhoneBR(i.phone);
  const ext = hashExternalId(i.panelUsername);
  const user_data: UserData = {
    ...(em ? { em: [em] } : {}),
    ...(ph ? { ph: [ph] } : {}),
    ...(ext ? { external_id: [ext] } : {}),
    ...(i.fbc ? { fbc: i.fbc } : {}),
    ...(i.fbp ? { fbp: i.fbp } : {}),
    ...(i.userAgent ? { client_user_agent: i.userAgent } : {}),
  };
  return {
    event_name: "Purchase",
    event_time: Math.floor(new Date(i.paidAt).getTime() / 1000),
    event_id: i.eventId,
    event_source_url: i.sourceUrl,
    action_source: "website",
    user_data,
    custom_data: { currency: "BRL", value: Math.round(i.amountCents) / 100, order_id: i.orderId },
  };
}

/**
 * Reports a sale when the visit carries Meta cookies (fbc/fbp), OR when the order came from a campaign and has customer data for
 * Advanced Matching (valid BR phone or e-mail) — browsers that block cookies (iPhone, Brave) would otherwise lose real sales.
 * Orders without a campaign and without cookies (organic renewals) are never reported, so Meta doesn't learn the wrong audience.
 */
export function shouldReportToMeta(
  click: { fbc?: string | null; fbp?: string | null } | null | undefined,
  order?: { campaign_id?: string | null; customer_phone?: string | null; customer_email?: string | null } | null,
): boolean {
  if (click?.fbc || click?.fbp) return true;
  if (!order?.campaign_id) return false;
  return hashPhoneBR(order.customer_phone) !== null || !!order.customer_email?.trim();
}

export type LeadInput = {
  eventId: string;
  sourceUrl: string;
  fbc?: string | null | undefined;
  fbp?: string | null | undefined;
  userAgent?: string | null | undefined;
  ip?: string | null | undefined;
  refCode?: string | null | undefined;
  eventTime?: number | undefined; // unix seconds; defaults to now
};

/** "Lead" fired when the visitor taps the WhatsApp button. Same event_id as the browser Pixel so Meta de-duplicates. */
export function buildLeadEvent(i: LeadInput) {
  const ext = hashExternalId(i.refCode);
  const user_data: UserData = {
    ...(ext ? { external_id: [ext] } : {}),
    ...(i.fbc ? { fbc: i.fbc } : {}),
    ...(i.fbp ? { fbp: i.fbp } : {}),
    ...(i.userAgent ? { client_user_agent: i.userAgent } : {}),
    ...(i.ip ? { client_ip_address: i.ip } : {}),
  };
  return {
    event_name: "Lead",
    event_time: i.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: i.eventId,
    event_source_url: i.sourceUrl,
    action_source: "website",
    user_data,
    custom_data: { ...(i.refCode ? { ref_code: i.refCode } : {}), content_name: "whatsapp_click" },
  };
}

/** Sends one Lead to the Conversions API. Never throws; returns whether Meta accepted it. */
export async function sendMetaLead(pixelId: string, token: string, input: LeadInput, testCode?: string | null): Promise<boolean> {
  const body: Record<string, unknown> = { data: [buildLeadEvent(input)] };
  if (testCode) body["test_event_code"] = testCode;
  try {
    const res = await fetch(`${metaEventsUrl(pixelId)}?access_token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[meta-capi] lead rejected", res.status, (await res.text().catch(() => "")).slice(0, 300));
    return res.ok;
  } catch (e) {
    console.error("[meta-capi] lead request failed", (e as Error).message);
    return false;
  }
}
