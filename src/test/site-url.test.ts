import { describe, expect, it } from "vitest";
import { normalizeSiteUrl, publicUrl, PUBLIC_SITE_URL } from "@/lib/site-url";

describe("endereço público dos links de campanha", () => {
  it("usa o site publicado por padrão", () => {
    expect(normalizeSiteUrl(undefined)).toBe("https://administrativotop.lovable.app");
    expect(normalizeSiteUrl("")).toBe("https://administrativotop.lovable.app");
  });
  it("aceita domínio próprio e remove a barra final", () => {
    expect(normalizeSiteUrl("https://meudominio.com.br/")).toBe("https://meudominio.com.br");
  });
  it("ignora valor inválido ou com caminho", () => {
    expect(normalizeSiteUrl("meudominio.com.br")).toBe("https://administrativotop.lovable.app");
    expect(normalizeSiteUrl("https://a.com/painel")).toBe("https://administrativotop.lovable.app");
  });
  it("monta o link de rastreio sem barras duplicadas", () => {
    expect(publicUrl("/r/facebook-ads?l=abc&pagar=1")).toBe(`${PUBLIC_SITE_URL}/r/facebook-ads?l=abc&pagar=1`);
    expect(publicUrl("r/renovacao")).toBe(`${PUBLIC_SITE_URL}/r/renovacao`);
  });
});
