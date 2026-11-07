import { describe, expect, it } from "vitest";
import { buildPurchaseEvent, hashEmail, hashPhoneBR, metaEventsUrl, shouldReportToMeta } from "@/lib/meta-capi";

describe("hash dos dados do cliente (Meta)", () => {
  it("e-mail: remove espaços, minúsculas, SHA-256", () => {
    const h = "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b";
    expect(hashEmail("test@example.com")).toBe(h);
    expect(hashEmail("  Test@Example.COM ")).toBe(h);
    expect(hashEmail("")).toBeNull();
    expect(hashEmail(null)).toBeNull();
  });
  it("telefone: só dígitos com DDI 55", () => {
    const h = "029c7290f14c4516673508635f0519db95f7daf42057fd0e4ad1de84c5408a66"; // sha256("5511987654321")
    expect(hashPhoneBR("(11) 98765-4321")).toBe(h);
    expect(hashPhoneBR("11987654321")).toBe(h);
    expect(hashPhoneBR("5511987654321")).toBe(h);
    expect(hashPhoneBR("123")).toBeNull();
    expect(hashPhoneBR(null)).toBeNull();
  });
});

describe("evento Purchase", () => {
  const base = { eventId: "ev-1", orderId: "ord-1", paidAt: "2026-11-07T15:00:00.000Z", amountCents: 9990, sourceUrl: "https://x.app/pagar" };
  it("monta o evento no formato da API de Conversões", () => {
    const e = buildPurchaseEvent({ ...base, email: "a@b.com", phone: "11987654321", panelUsername: "Joao", fbc: "fb.1.1.abc", fbp: "fb.1.2.3", userAgent: "UA" });
    expect(e.event_name).toBe("Purchase");
    expect(e.event_id).toBe("ev-1");
    expect(e.event_time).toBe(Math.floor(Date.parse(base.paidAt) / 1000));
    expect(e.action_source).toBe("website");
    expect(e.event_source_url).toBe("https://x.app/pagar");
    expect(e.custom_data).toEqual({ currency: "BRL", value: 99.9, order_id: "ord-1" });
    expect(e.user_data.fbc).toBe("fb.1.1.abc"); // sem hash
    expect(e.user_data.fbp).toBe("fb.1.2.3");
    expect(e.user_data.client_user_agent).toBe("UA");
    expect(e.user_data.em).toHaveLength(1);
    expect(e.user_data.em![0]).toMatch(/^[0-9a-f]{64}$/);
    expect(e.user_data.ph![0]).toMatch(/^[0-9a-f]{64}$/);
  });
  it("omite o que não existe", () => {
    const e = buildPurchaseEvent({ ...base, fbc: "fb.1.1.abc" });
    expect(Object.keys(e.user_data)).toEqual(["fbc"]);
  });
  it("endereço da API usa a versão atual", () => {
    expect(metaEventsUrl("123456789012345")).toBe("https://graph.facebook.com/v26.0/123456789012345/events");
  });
  it("só reporta visitas vindas de clique rastreado pela Meta", () => {
    expect(shouldReportToMeta({ fbc: "fb.1.1.a", fbp: null })).toBe(true);
    expect(shouldReportToMeta({ fbc: null, fbp: "fb.1.2.3" })).toBe(true);
    expect(shouldReportToMeta({ fbc: null, fbp: null })).toBe(false);
    expect(shouldReportToMeta(null)).toBe(false);
  });
});
