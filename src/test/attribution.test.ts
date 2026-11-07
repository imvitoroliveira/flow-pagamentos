import { describe, expect, it } from "vitest";
import { readStoredRef, REF_TTL_MS, serializeRef } from "@/lib/ref-storage";
import { isLinkPreviewBot } from "@/lib/link-bots";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 7, 15, 0, 0);

describe("validade da atribuição (natv_ref)", () => {
  it("janela de 30 dias", () => {
    expect(REF_TTL_MS).toBe(30 * DAY);
  });
  it("devolve o ref guardado dentro da janela", () => {
    expect(readStoredRef(serializeRef("abc234", NOW - 5 * DAY), NOW)).toBe("ABC234");
  });
  it("descarta depois de 30 dias", () => {
    expect(readStoredRef(serializeRef("ABC234", NOW - 30 * DAY), NOW)).toBeNull();
    expect(readStoredRef(serializeRef("ABC234", NOW - 90 * DAY), NOW)).toBeNull();
  });
  it("descarta o formato antigo (texto puro, sem data)", () => {
    expect(readStoredRef("ABC234", NOW)).toBeNull();
    expect(readStoredRef("234567", NOW)).toBeNull();
  });
  it("descarta lixo e data no futuro", () => {
    expect(readStoredRef(null, NOW)).toBeNull();
    expect(readStoredRef("{not json", NOW)).toBeNull();
    expect(readStoredRef(JSON.stringify({ ref: "ABC234", t: NOW + 10 * DAY }), NOW)).toBeNull();
    expect(readStoredRef(JSON.stringify({ ref: 5, t: NOW }), NOW)).toBeNull();
  });
});

describe("robôs de pré-visualização não contam como clique", () => {
  it.each([
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.23.20.0 A",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Twitterbot/1.0",
    "TelegramBot (like TwitterBot)",
    "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  ])("detecta robô: %s", (ua) => expect(isLinkPreviewBot(ua)).toBe(true));

  it.each([
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/430.0.0.0]",
    "Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 Instagram 300.0.0.0 Android",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ])("não bloqueia cliente real: %s", (ua) => expect(isLinkPreviewBot(ua)).toBe(false));

  it("sem user agent não é tratado como robô", () => {
    expect(isLinkPreviewBot(null)).toBe(false);
    expect(isLinkPreviewBot("")).toBe(false);
  });
});
