import { describe, expect, it } from "vitest";
import { isSecretKey, SETTING_KEYS, validateSetting } from "@/lib/integration-settings";

describe("validação das configurações de integração", () => {
  it("Pixel ID aceita o número ou o código completo do pixel", () => {
    expect(validateSetting("META_PIXEL_ID", " 123456789012345 ")).toEqual({ ok: true, value: "123456789012345" });
    expect(validateSetting("META_PIXEL_ID", "fbq('init', '123456789012345');")).toEqual({ ok: true, value: "123456789012345" });
  });
  it("Pixel ID recusa lixo", () => {
    expect(validateSetting("META_PIXEL_ID", "abc").ok).toBe(false);
    expect(validateSetting("META_PIXEL_ID", "123").ok).toBe(false);
  });
  it("token: sem espaços e com tamanho plausível", () => {
    const t = "EAAB" + "x".repeat(40);
    expect(validateSetting("META_CAPI_TOKEN", `  ${t}\n`)).toEqual({ ok: true, value: t });
    expect(validateSetting("META_CAPI_TOKEN", "EAAB com espaço no meio 123456789").ok).toBe(false);
    expect(validateSetting("META_CAPI_TOKEN", "curto").ok).toBe(false);
  });
  it("código de teste", () => {
    expect(validateSetting("META_TEST_EVENT_CODE", "TEST12345")).toEqual({ ok: true, value: "TEST12345" });
    expect(validateSetting("META_TEST_EVENT_CODE", "tes t").ok).toBe(false);
  });
  it("valor vazio é recusado (remover é outra ação)", () => {
    for (const k of SETTING_KEYS) expect(validateSetting(k, "   ").ok).toBe(false);
  });
  it("só o token é segredo", () => {
    expect(isSecretKey("META_CAPI_TOKEN")).toBe(true);
    expect(isSecretKey("META_PIXEL_ID")).toBe(false);
    expect(isSecretKey("META_TEST_EVENT_CODE")).toBe(false);
  });
});
