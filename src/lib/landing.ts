// Landing pages (pure, no I/O): shapes, defaults and helpers shared by the public page, the API and the admin.

export type Benefit = { icon: string; text: string };
export type FaqItem = { question: string; answer: string };

export type LandingPageRow = {
  id: string; campaign_id: string | null; title: string; slug: string; headline: string; subheadline: string | null;
  cta_text: string; cta_subtext: string | null; whatsapp_number: string | null; whatsapp_message: string | null;
  benefits: Benefit[]; badge_top: string | null; faq: FaqItem[]; meta_pixel_id: string | null; active: boolean;
  views_count: number; leads_count: number; created_at: string; updated_at: string;
};

/** What the public page receives: everything already resolved (campaign/global fallbacks), nothing private. */
export type PublicLanding = {
  slug: string; headline: string; subheadline: string | null; ctaText: string; ctaSubtext: string | null; badgeTop: string | null;
  benefits: Benefit[]; faq: FaqItem[]; pixelId: string | null; whatsapp: string | null; message: string;
};

export const BENEFIT_ICONS = ["tv", "zap", "headset", "shield", "wrench", "smartphone", "check", "star"] as const;
export type BenefitIcon = (typeof BENEFIT_ICONS)[number];

export const DEFAULT_BENEFITS: Benefit[] = [
  { icon: "tv", text: "Qualidade 4K / Full HD sem travamentos" },
  { icon: "headset", text: "Suporte ágil pelo WhatsApp" },
  { icon: "shield", text: "Sem fidelidade, cancele quando quiser" },
  { icon: "wrench", text: "Instalação fácil, a gente te ajuda" },
];

export const DEFAULT_FAQ: FaqItem[] = [
  { question: "Como funciona o teste grátis?", answer: "Você chama no WhatsApp, recebe o acesso em poucos minutos e testa por 4 horas, sem compromisso." },
  { question: "Preciso de cartão de crédito?", answer: "Não. O teste é liberado sem cartão e sem cadastro complicado." },
  { question: "Funciona na minha TV?", answer: "Funciona em Smart TV (Samsung, LG), Roku, Android TV, Fire TV, TV Box, celular e computador. Se tiver dúvida, pergunte no WhatsApp." },
];

/** Texts used by "Criar com Modelo Padrão". */
export const LP_TEMPLATE = {
  headline: "Todos os canais, filmes e séries sem travar na sua TV",
  subheadline: "Direto na Smart TV, TV Box ou celular. Peça seu teste grátis agora e veja a diferença.",
  cta_text: "Quero Meu Teste Grátis no WhatsApp",
  cta_subtext: "Ativação imediata em menos de 2 minutos",
  badge_top: "🔥 TESTE GRÁTIS DE 4 HORAS LIBERADO",
  whatsapp_message: "Olá! Vim pelo anúncio e quero meu teste grátis.",
  benefits: DEFAULT_BENEFITS,
  faq: DEFAULT_FAQ,
} as const;

export const DEVICES = ["Smart TV Samsung / LG", "Roku", "Android TV", "Fire TV", "TV Box", "Celular", "PC"] as const;

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** First valid BR WhatsApp number among LP → campaign. Null when none is set. */
export function resolveWhatsapp(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    let d = digits(c);
    if (d.length === 10 || d.length === 11) d = `55${d}`;
    if (/^55\d{10,11}$/.test(d)) return d;
  }
  return null;
}

/** wa.me link with the tracking code appended: "Olá! … [ABC123]". */
export function buildWhatsappUrl(number: string, message: string, ref: string | null): string {
  const text = `${message.trim()}${ref ? ` [${ref}]` : ""}`;
  return `https://wa.me/${digits(number)}?text=${encodeURIComponent(text)}`;
}

/** leads / views as a percentage with 1 decimal; null when there are no views (screen shows "—"). */
export function conversionRate(leads: number, views: number): number | null {
  return views > 0 ? Math.round((leads / views) * 1000) / 10 : null;
}

export const REF_RE = /^[A-Z2-9]{6}$/;
