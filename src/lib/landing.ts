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

// Copy rules (Meta ad review): no "IPTV", "canais fechados", "todos os canais", "teste grátis de X horas", "TV Box", "sem travar".
// Speak of a multimedia streaming service, demonstration and support instead.
export const DEFAULT_BENEFITS: Benefit[] = [
  { icon: "tv", text: "Imagem em alta definição e reprodução estável" },
  { icon: "headset", text: "Atendimento humano pelo WhatsApp" },
  { icon: "shield", text: "Sem fidelidade: você decide quando parar" },
  { icon: "wrench", text: "Configuração guiada passo a passo" },
];

export const DEFAULT_FAQ: FaqItem[] = [
  { question: "Como funciona a demonstração?", answer: "Você chama no WhatsApp, nossa equipe explica o serviço e libera uma demonstração sem compromisso para você conhecer antes de decidir." },
  { question: "Preciso informar cartão de crédito?", answer: "Não. A demonstração não exige cartão. O pagamento só acontece se você decidir assinar, via PIX." },
  { question: "Funciona no meu aparelho?", answer: "Funciona em Smart TVs compatíveis, Android TV, Fire TV Stick, Roku, celular e computador. Na dúvida, pergunte no WhatsApp." },
  { question: "Posso cancelar quando quiser?", answer: "Sim. Não há contrato de fidelidade nem multa." },
];

export type LpTemplateKey = "geral" | "esportes" | "cinema" | "familia";
export type LpTemplate = { label: string; headline: string; subheadline: string; cta_text: string; cta_subtext: string; badge_top: string; whatsapp_message: string; benefits: Benefit[]; faq: FaqItem[] };

/** Niche templates used by the admin "Criar com modelo" buttons. */
export const LP_TEMPLATES: Record<LpTemplateKey, LpTemplate> = {
  geral: {
    label: "Streaming geral",
    headline: "Sua central de entretenimento na sua TV",
    subheadline: "Conteúdos em alta definição, lançamentos e transmissões com estabilidade no aparelho que você já tem.",
    cta_text: "Quero conhecer no WhatsApp", cta_subtext: "Atendimento em menos de 2 minutos",
    badge_top: "⭐ Experiência premium", whatsapp_message: "Olá! Gostaria de conhecer o serviço e ver como funciona.",
    benefits: DEFAULT_BENEFITS, faq: DEFAULT_FAQ,
  },
  esportes: {
    label: "Esportes",
    headline: "Acompanhe cada lance em tempo real",
    subheadline: "Transmissões esportivas fluidas em alta resolução na sua Smart TV, TV Stick ou celular.",
    cta_text: "Pedir demonstração no WhatsApp", cta_subtext: "Demonstração sem compromisso",
    badge_top: "⚽ Esportes em alta definição", whatsapp_message: "Olá! Vi o anúncio de esportes e quero ver uma demonstração.",
    benefits: [
      { icon: "zap", text: "Transmissão fluida, sem atraso perceptível" },
      { icon: "tv", text: "Alta definição na TV ou no celular" },
      { icon: "headset", text: "Suporte rápido em dia de jogo" },
      { icon: "shield", text: "Sem fidelidade e sem multa" },
    ],
    faq: DEFAULT_FAQ,
  },
  cinema: {
    label: "Filmes e séries",
    headline: "Cinema e séries no conforto do seu sofá",
    subheadline: "Títulos sob demanda com imagem superior e som imersivo para toda a família maratonar.",
    cta_text: "Pedir demonstração no WhatsApp", cta_subtext: "Sem contrato de fidelidade",
    badge_top: "🎬 Catálogo sempre atualizado", whatsapp_message: "Olá! Quero conhecer o catálogo de filmes e séries.",
    benefits: [
      { icon: "star", text: "Lançamentos e clássicos sob demanda" },
      { icon: "tv", text: "Imagem em alta definição" },
      { icon: "smartphone", text: "Continue assistindo em outro aparelho" },
      { icon: "shield", text: "Sem fidelidade e sem multa" },
    ],
    faq: DEFAULT_FAQ,
  },
  familia: {
    label: "Família",
    headline: "Entretenimento para toda a sua casa",
    subheadline: "Desenhos, documentários e variedades com navegação simples para todas as idades.",
    cta_text: "Falar com atendente no WhatsApp", cta_subtext: "Configuração guiada passo a passo",
    badge_top: "🧸 Diversão para a família", whatsapp_message: "Olá! Quero saber mais sobre a programação para a família.",
    benefits: [
      { icon: "star", text: "Conteúdo infantil e educativo" },
      { icon: "tv", text: "Navegação simples para todas as idades" },
      { icon: "headset", text: "Ajuda humana pelo WhatsApp" },
      { icon: "shield", text: "Sem fidelidade e sem multa" },
    ],
    faq: DEFAULT_FAQ,
  },
};

/** Default template ("Criar com Modelo Padrão"). */
export const LP_TEMPLATE = LP_TEMPLATES.geral;

/** Terms Meta's ad review flags on streaming landing pages (checked in tests and shown as a warning in the admin). */
export const RISKY_TERMS = ["iptv", "canais fechados", "canais abertos e fechados", "todos os canais", "tv box", "p2p", "pirata", "desbloqueado", "premiere", "teste grátis de", "sem travar"] as const;
export function findRiskyTerms(...texts: Array<string | null | undefined>): string[] {
  const all = texts.join(" \n ").toLowerCase();
  return RISKY_TERMS.filter((t) => all.includes(t));
}

export const DEVICES = ["Smart TV", "Android TV", "Fire TV Stick", "Roku", "Celular", "Computador"] as const;

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
