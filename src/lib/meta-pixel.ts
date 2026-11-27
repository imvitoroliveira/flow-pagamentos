import { canTrack, onConsentChange } from "./consent";
// Browser-only Meta Pixel loader (injects fbevents.js on demand; nothing is loaded when the LP has no Pixel ID).
type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

const initialized = new Set<string>();
let subscribed = false;
export async function initPixel(pixelId: string) {
  if(typeof window === "undefined" || !await canTrack("advertising")) return;
  if(!subscribed) { subscribed=true; onConsentChange(()=>{void canTrack("advertising").then(allowed=>window.fbq?.("consent",allowed?"grant":"revoke"));}); }
  if(window.fbq) {
    window.fbq("consent","grant");
    if(!initialized.has(pixelId)) { window.fbq("init",pixelId,{}, {agent:"lovable"}); initialized.add(pixelId); }
    return;
  }
  if (typeof window === "undefined" || window.fbq) return;
  const fbq = function (...args: unknown[]) { if (fbq.callMethod) fbq.callMethod.apply(fbq,args); else (fbq.queue as unknown[]).push(args); } as Fbq;
  fbq.push = fbq; fbq.loaded = true; fbq.version = "2.0"; fbq.queue = [];
  window.fbq = fbq; window._fbq = fbq;
  const s = document.createElement("script");
  s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
  fbq("init", pixelId, {}, {agent:"lovable"});
  initialized.add(pixelId);
  fbq("track", "PageView");
}

export async function trackPixel(event: string, data: Record<string, unknown>, eventId: string) {
  if(typeof window === "undefined" || !await canTrack("advertising")) return;
  window.fbq?.("track", event, data, { eventID: eventId });
}

export function readCookie(name: string): string | null {
  try { return document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? null; } catch { return null; }
}
