import { describe, expect, it } from "vitest";
import {
  CUSTOM_USERNAME_RE, durationLabel, formatTestMessage, isPanelMinutes, isTestActive, isValidTestMinutes, maskPhoneBR, PANEL_TEST_MINUTES,
  parsePanelTestUser, testPayLink, testWhatsappUrl, UI_DURATIONS,
} from "@/lib/test-accounts";

const T = { username: "11987650001", password: "s3nh@", domain: "natv.pm", minutes: 120 };
const ORIGIN = "https://administrativotop.lovable.app";

describe("formatTestMessage", () => {
  it("interpola nome, duração, usuário, senha, servidor e link", () => {
    const m = formatTestMessage({ ...T, customerName: "Maria Souza" }, ORIGIN);
    expect(m).toContain("Prontinho, Maria! Seu teste de 2 horas está ativo:");
    expect(m).toContain("🔑 Usuário: 11987650001");
    expect(m).toContain("🔒 Senha: s3nh@");
    expect(m).toContain("🔗 Servidor: natv.pm");
    expect(m).toContain(`👉 ${ORIGIN}/pagar?u=11987650001`);
    expect(m).not.toMatch(/\{[a-z_]+\}/);
  });
  it("nome vazio vira amigo(a)", () => {
    expect(formatTestMessage({ ...T, customerName: "" }, ORIGIN)).toContain("Prontinho, amigo(a)!");
    expect(formatTestMessage({ ...T, customerName: "   " }, ORIGIN)).toContain("Prontinho, amigo(a)!");
    expect(formatTestMessage(T, ORIGIN)).toContain("Prontinho, amigo(a)!");
  });
  it("não reinterpreta { } vindo da senha", () => {
    expect(formatTestMessage({ ...T, password: "{nome}x" }, ORIGIN)).toContain("🔒 Senha: {nome}x");
  });
});

describe("minutos aceitos pela API", () => {
  it("aceita exatamente os valores do painel", () => {
    expect(PANEL_TEST_MINUTES).toEqual(["15", "30", "60", "120", "180", "240", "300", "360"]);
    for (const m of [15, 30, 60, 120, 180, 240, 300, 360]) expect(isValidTestMinutes(m)).toBe(true);
    for (const m of [0, 10, 90, 361, -60, 1.5, NaN]) expect(isValidTestMinutes(m)).toBe(false);
    expect(isPanelMinutes("120")).toBe(true);
    expect(isPanelMinutes(120)).toBe(false);
  });
  it("as durações da tela são todas válidas", () => {
    expect(UI_DURATIONS.every(isValidTestMinutes)).toBe(true);
  });
  it("rótulos de duração", () => {
    expect(durationLabel(60)).toBe("1 hora");
    expect(durationLabel(120)).toBe("2 horas");
    expect(durationLabel(240)).toBe("4 horas");
    expect(durationLabel(30)).toBe("30 minutos");
  });
});

describe("link de pagamento", () => {
  it("contém ?u={usuario}, codificado e sem barra dupla", () => {
    expect(testPayLink(ORIGIN, "abc")).toBe(`${ORIGIN}/pagar?u=abc`);
    expect(testPayLink(`${ORIGIN}/`, "a b&c")).toBe(`${ORIGIN}/pagar?u=a%20b%26c`);
  });
});

describe("telefone e WhatsApp", () => {
  it("máscara (99) 99999-9999", () => {
    expect(maskPhoneBR("")).toBe("");
    expect(maskPhoneBR("11")).toBe("(11");
    expect(maskPhoneBR("119998")).toBe("(11) 9998");
    expect(maskPhoneBR("11999998888")).toBe("(11) 99999-8888");
    expect(maskPhoneBR("1199999888877")).toBe("(11) 99999-8888");
    expect(maskPhoneBR("1133334444")).toBe("(11) 3333-4444");
  });
  it("wa.me só com telefone válido", () => {
    expect(testWhatsappUrl("(11) 99999-8888", "oi ✓")).toBe(`https://wa.me/5511999998888?text=${encodeURIComponent("oi ✓")}`);
    expect(testWhatsappUrl("", "oi")).toBeNull();
    expect(testWhatsappUrl("123", "oi")).toBeNull();
  });
});

describe("usuário personalizado, status e resposta do painel", () => {
  it("valida usuário", () => {
    expect(CUSTOM_USERNAME_RE.test("joao.silva_1")).toBe(true);
    expect(CUSTOM_USERNAME_RE.test("ab")).toBe(false);
    expect(CUSTOM_USERNAME_RE.test("com espaço")).toBe(false);
  });
  it("ativo x expirado", () => {
    const now = new Date("2026-11-27T12:00:00Z");
    expect(isTestActive("2026-11-27T12:00:01Z", now)).toBe(true);
    expect(isTestActive("2026-11-27T12:00:00Z", now)).toBe(false);
  });
  it("parsePanelTestUser converte exp_date (segundos) e rejeita formato inesperado", () => {
    const u = parsePanelTestUser({ id: 4240216, username: "x1", password: "p", max_connections: 1, exp_date: 1752530845, domain: "natv.pm", notes: "n" });
    expect(u).toMatchObject({ id: "4240216", username: "x1", password: "p", domain: "natv.pm", notes: "n" });
    expect(u!.expiresAt.getTime()).toBe(1752530845 * 1000);
    expect(parsePanelTestUser(null)).toBeNull();
    expect(parsePanelTestUser({ username: "x" })).toBeNull();
    expect(parsePanelTestUser({ username: "x", password: "p", exp_date: "abc" })).toBeNull();
  });
});
