import { z } from "zod";

export const UTM_SOURCES = ["facebook", "instagram", "tiktok", "google", "whatsapp", "outro"] as const;

export const slugify = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** Accepts a BR phone in any format; returns digits with DDI 55 or null if invalid. */
export function normalizeBrPhone(v: string): string | null {
  let d = v.replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return /^55\d{10,11}$/.test(d) ? d : null;
}

/** Extracts a Meta Pixel ID from a raw ID or the full snippet. */
export function extractMetaPixel(v: string): string {
  const m = v.match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{10,20})['"]/) ?? v.match(/[?&]id=(\d{10,20})/) ?? v.match(/\b(\d{10,20})\b/);
  return m?.[1] ?? v.trim();
}
/** Extracts a TikTok Pixel ID (alphanumeric, ~20 chars) from a raw ID or the full snippet. */
export function extractTiktokPixel(v: string): string {
  const m = v.match(/ttq\.load\(\s*['"]([A-Z0-9]{15,30})['"]/i) ?? v.match(/\b([A-Z0-9]{18,24})\b/);
  return (m?.[1] ?? v.trim()).toUpperCase();
}

const opt = (max: number) => z.string().trim().max(max).optional().default("");

export const campaignSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(80),
  slug: z.string().trim().min(2, "Informe o slug").max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use a-z, 0-9 e hífen"),
  seller_id: z.string().uuid("Escolha o vendedor"),
  utm_source: z.enum(UTM_SOURCES),
  utm_medium: z.string().trim().min(1).max(60),
  utm_campaign: opt(80),
  utm_term: opt(80),
  utm_content: opt(80),
  destination_whatsapp: z.string().trim().max(20).refine((v) => !v || /^55\d{10,11}$/.test(v), "WhatsApp inválido (DDD + número)").optional().default(""),
  prefilled_message: opt(300),
  meta_pixel_id: z.string().trim().refine((v) => !v || /^\d{10,20}$/.test(v), "Meta Pixel ID deve ter 10 a 20 dígitos").optional().default(""),
  tiktok_pixel_id: z.string().trim().refine((v) => !v || /^[A-Z0-9]{15,30}$/.test(v), "TikTok Pixel ID inválido").optional().default(""),
});
export type CampaignInput = z.input<typeof campaignSchema>;

export const sellerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(80),
  telegram_chat_id: z.string().trim().max(20).refine((v) => !v || /^-?\d{3,20}$/.test(v), "Chat ID deve ser numérico (pode começar com -)").optional().default(""),
  active: z.boolean(),
});
export type SellerInput = z.input<typeof sellerSchema>;
