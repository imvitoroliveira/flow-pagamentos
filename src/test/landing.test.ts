import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { landingPageSchema } from "@/lib/admin-schemas";
import { buildLeadEvent } from "@/lib/meta-capi";
import { readStoredRef, serializeRef, shouldStoreRef, REF_TTL_MS } from "@/lib/ref-storage";
import { buildWhatsappUrl, conversionRate, resolveWhatsapp } from "@/lib/landing";

const base = { title: "Teste Grátis", slug: "teste-gratis", headline: "Todos os canais sem travar", cta_text: "Quero meu teste" };

describe("landingPageSchema", () => {
  it("aceita o mínimo e aplica padrões", () => {
    const r = landingPageSchema.parse(base);
    expect(r).toMatchObject({ campaign_id: null, subheadline: "", whatsapp_number: "", meta_pixel_id: "", benefits: [], faq: [], active: true });
  });
  it("valida slug, whatsapp e pixel", () => {
    expect(landingPageSchema.safeParse({ ...base, slug: "Slug Inválido" }).success).toBe(false);
    expect(landingPageSchema.safeParse({ ...base, whatsapp_number: "123" }).success).toBe(false);
    expect(landingPageSchema.safeParse({ ...base, whatsapp_number: "(11) 99999-8888" }).success).toBe(true);
    expect(landingPageSchema.safeParse({ ...base, meta_pixel_id: "abc" }).success).toBe(false);
    expect(landingPageSchema.safeParse({ ...base, meta_pixel_id: "1234567890123456" }).success).toBe(true);
  });
  it("limita benefícios e exige textos", () => {
    const b = { icon: "tv", text: "Qualidade 4K" };
    expect(landingPageSchema.safeParse({ ...base, benefits: Array(9).fill(b) }).success).toBe(false);
    expect(landingPageSchema.safeParse({ ...base, benefits: [{ icon: "nope", text: "x y" }] }).success).toBe(false);
    expect(landingPageSchema.safeParse({ ...base, benefits: [b], faq: [{ question: "Como?", answer: "Assim." }] }).success).toBe(true);
  });
  it("campanha precisa ser uuid ou nula", () => {
    expect(landingPageSchema.safeParse({ ...base, campaign_id: "x" }).success).toBe(false);
    expect(landingPageSchema.safeParse({ ...base, campaign_id: "0b6a6b9e-6a5e-4f0e-9f57-2d3b2b8e1a11" }).success).toBe(true);
  });
});

describe("buildLeadEvent (Meta CAPI)", () => {
  const ev = buildLeadEvent({ eventId: "lp_ABC123_k9", sourceUrl: "https://s/lp/x", fbc: "fb.1.1.abc", fbp: "fb.1.2.3", userAgent: "UA", ip: "1.2.3.4", refCode: "ABC123", eventTime: 1_700_000_000 });
  it("monta o evento Lead com o mesmo event_id do Pixel", () => {
    expect(ev).toMatchObject({ event_name: "Lead", event_id: "lp_ABC123_k9", event_time: 1_700_000_000, action_source: "website", event_source_url: "https://s/lp/x" });
    expect(ev.custom_data).toMatchObject({ ref_code: "ABC123" });
  });
  it("envia IP/UA/fbc/fbp em claro e o ref_code como external_id com hash", () => {
    expect(ev.user_data).toMatchObject({ fbc: "fb.1.1.abc", fbp: "fb.1.2.3", client_user_agent: "UA", client_ip_address: "1.2.3.4" });
    expect(ev.user_data.external_id).toEqual([createHash("sha256").update("abc123").digest("hex")]);
  });
  it("omite o que não existe", () => {
    const e = buildLeadEvent({ eventId: "e1234567", sourceUrl: "https://s", eventTime: 1 });
    expect(e.user_data).toEqual({});
    expect(e.custom_data).toEqual({ content_name: "whatsapp_click" });
  });
});

describe("helpers da LP", () => {
  it("monta o link do WhatsApp com o código de rastreio", () => {
    expect(buildWhatsappUrl("5511999998888", "Olá! Quero meu teste grátis.", "ABC123")).toBe(`https://wa.me/5511999998888?text=${encodeURIComponent("Olá! Quero meu teste grátis. [ABC123]")}`);
    expect(buildWhatsappUrl("+55 (11) 99999-8888", "Oi", null)).toBe("https://wa.me/5511999998888?text=Oi");
  });
  it("resolve o WhatsApp: LP antes da campanha, ignora inválidos", () => {
    expect(resolveWhatsapp("11999998888", "5521988887777")).toBe("5511999998888");
    expect(resolveWhatsapp("", "5521988887777")).toBe("5521988887777");
    expect(resolveWhatsapp("123", null)).toBeNull();
  });
  it("taxa de conversão com 1 casa e sem divisão por zero", () => {
    expect(conversionRate(5, 40)).toBe(12.5);
    expect(conversionRate(1, 3)).toBe(33.3);
    expect(conversionRate(0, 0)).toBeNull();
  });
});

describe("gravação da referência da LP no localStorage", () => {
  it("clique novo sempre vence; regravação só renova a mesma ref ou ocupa vaga vazia", () => {
    expect(shouldStoreRef("OLD111", "NEW222", true)).toBe(true);
    expect(shouldStoreRef(null, "ABC234", false)).toBe(true);
    expect(shouldStoreRef("ABC234", "abc234", false)).toBe(true);
    expect(shouldStoreRef("NEW222", "ABC234", false)).toBe(false);
    expect(shouldStoreRef(null, "  ", true)).toBe(false);
  });
  it("o valor gravado é lido pelo /pagar dentro da validade de 30 dias", () => {
    const now = 1_800_000_000_000;
    const raw = serializeRef("ABC234", now);
    expect(readStoredRef(raw, now + 1000)).toBe("ABC234");
    expect(readStoredRef(raw, now + REF_TTL_MS)).toBeNull();
  });
});
