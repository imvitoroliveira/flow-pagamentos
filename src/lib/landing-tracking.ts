import { z } from "zod";

export const viewSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60),
  sessionId: z.string().uuid(),
  ref: z.string().regex(/^[A-Z0-9]{6}$/).optional().nullable(),
  fbclid: z.string().max(1000).optional().nullable(),
});
export const leadSchema = viewSchema.pick({ slug: true, ref: true }).extend({
  ref: z.string().regex(/^[A-Z0-9]{6}$/),
  fbp: z.string().max(200).optional().nullable(),
  fbc: z.string().max(1100).optional().nullable(),
});
export const leadEventId = (ref: string) => `lp_lead_${ref}`;
export const consentCountries = new Set("AT,BE,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GR,HU,IE,IT,LV,LT,LU,MT,NL,PL,PT,RO,SK,SI,ES,SE,IS,LI,NO,GB,CH,RE,GP,MQ,GF,YT,MF,AX,CA".split(","));
export function advertisingPermitted(choice: string | null, country: string | null, gpc: boolean) {
  if (gpc || choice === "denied") return false;
  if (choice === "granted") return true;
  return !!country && /^[A-Z]{2}$/.test(country) && country !== "XX" && !consentCountries.has(country);
}

/** Same operational session as checkout, with an in-memory fallback if storage is blocked. */
let fallback: string | null = null;
export function visitorSessionId(): string {
  try {
    const stored = localStorage.getItem("natv_sid");
    if (stored && z.string().uuid().safeParse(stored).success) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem("natv_sid", id);
    return id;
  } catch { return fallback ??= crypto.randomUUID(); }
}
