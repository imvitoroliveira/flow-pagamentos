// Pure helpers for Meta Conversions API "Purchase" events (server-side). No I/O here.
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

type UserData = { em?: string[]; ph?: string[]; external_id?: string[]; fbc?: string; fbp?: string; client_user_agent?: string };

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

/** Only visits that came from a Meta-tracked click (fbc/fbp) are reported, so organic renewals don't teach Meta the wrong audience. */
export const shouldReportToMeta = (click: { fbc?: string | null; fbp?: string | null } | null | undefined) => !!(click?.fbc || click?.fbp);
