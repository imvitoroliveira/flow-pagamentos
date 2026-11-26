import { describe, expect, it } from "vitest";
import { buildQueue, classifyRegua, cleanCustomerName, daysUntil, formatBatch, interpolate, normalizePhoneBR, waLink } from "@/lib/cobranca";

// 12:00 em São Paulo (15:00 UTC) de 2026-11-20.
const NOW = new Date("2026-11-20T15:00:00Z");
const at = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * 86_400_000).toISOString();

describe("normalizePhoneBR", () => {
  it("prefixa 55 em 10/11 dígitos e limpa a formatação", () => {
    expect(normalizePhoneBR("11999998888")).toBe("5511999998888");
    expect(normalizePhoneBR("+55 (11) 99999-8888")).toBe("5511999998888");
    expect(normalizePhoneBR("(11) 3333-4444")).toBe("551133334444");
  });
  it("nulo ou inválido → null", () => {
    expect(normalizePhoneBR(null)).toBeNull();
    expect(normalizePhoneBR("")).toBeNull();
    expect(normalizePhoneBR("12345")).toBeNull();
    expect(normalizePhoneBR("abc")).toBeNull();
  });
});

describe("interpolate", () => {
  it("troca as variáveis conhecidas", () => {
    expect(interpolate("Olá {nome} ({usuario}) vence {vencimento}: {link} {dias}", { nome: "Ana", usuario: "ana1", vencimento: "23/11/2026", link: "https://x/r/a", dias: 3 }))
      .toBe("Olá Ana (ana1) vence 23/11/2026: https://x/r/a 3");
  });
  it("mantém variável sem valor", () => { expect(interpolate("{nome} {outra}", {})).toBe("{nome} {outra}"); });
});

describe("régua", () => {
  it("classifica por dias de calendário", () => {
    expect(classifyRegua(daysUntil(at(3), NOW))).toBe("d3");
    expect(classifyRegua(daysUntil(at(1), NOW))).toBe("d1");
    expect(classifyRegua(daysUntil(at(0), NOW))).toBe("d0");
    expect(classifyRegua(daysUntil(at(-2), NOW))).toBe("vencido");
    expect(classifyRegua(2)).toBeNull();
    expect(classifyRegua(4)).toBeNull();
    expect(classifyRegua(-8)).toBeNull();
  });
  it("vence hoje à noite ainda é D-0 (fuso de São Paulo)", () => {
    expect(daysUntil("2026-11-21T01:30:00Z", NOW)).toBe(0); // 22:30 de 20/11 em SP
  });
});

describe("buildQueue", () => {
  const clients = [
    { username: "ana", phone: "11999998888", expires_at: at(3), blocked: false },
    { username: "bia", phone: null, expires_at: at(0), blocked: false },
    { username: "caio", phone: "11988887777", expires_at: at(-2), blocked: false },
    { username: "futuro", phone: "11977776666", expires_at: at(1), blocked: false },
    { username: "bloq", phone: "11966665555", expires_at: at(1), blocked: true },
    { username: "longe", phone: "11955554444", expires_at: at(20), blocked: false },
    { username: "semdata", phone: "11944443333", expires_at: null, blocked: false },
  ];
  const q = buildQueue({ clients, scheduledUsernames: ["FUTURO"], names: new Map([["ana", "Ana Souza"]]), link: "https://s/r/renovacao?pagar=1", now: NOW });
  it("ignora Futuros ativos, bloqueados, fora da régua e sem data", () => {
    expect(q.map((i) => i.username)).toEqual(["ana", "bia", "caio"]);
  });
  it("quem pagou/renovou recentemente fica fora, sem diferenciar maiúsculas", () => {
    const r = buildQueue({ clients, scheduledUsernames: [], recentlyPaidUsernames: new Set(["ANA", "caio"]), link: "https://s", now: NOW });
    expect(r.map((i) => i.username)).toEqual(["futuro", "bia"]);
    expect(buildQueue({ clients, scheduledUsernames: [], recentlyPaidUsernames: undefined, link: "https://s", now: NOW }).length).toBe(4);
  });
  it("monta texto, nome e telefone", () => {
    const ana = q[0]!;
    expect(ana).toMatchObject({ regua: "d3", phone: "5511999998888", name: "Ana Souza" });
    expect(ana.text).toContain("Olá Ana!");
    expect(ana.text).toContain("https://s/r/renovacao?pagar=1");
    expect(q[1]).toMatchObject({ regua: "d0", phone: null, name: "Bia" });
    expect(q[2]).toMatchObject({ regua: "vencido" });
  });
  it("links e lote", () => {
    expect(waLink("5511999998888", "oi tudo")).toBe("https://web.whatsapp.com/send?phone=5511999998888&text=oi%20tudo");
    expect(formatBatch(q)).toContain("SEM NÚMERO");
  });
});

describe("cleanCustomerName", () => {
  it("separador com sufixo genérico descarta o sufixo", () => {
    expect(cleanCustomerName("mara.iptv")).toEqual({ firstName: "Mara", fullName: "Mara" });
    expect(cleanCustomerName("wilton.cliente")).toEqual({ firstName: "Wilton", fullName: "Wilton" });
  });
  it("separador com sobrenome vira nome completo", () => {
    expect(cleanCustomerName("antonio.barbosa")).toEqual({ firstName: "Antonio", fullName: "Antonio Barbosa" });
    expect(cleanCustomerName("_joao-silva_")).toEqual({ firstName: "Joao", fullName: "Joao Silva" });
  });
  it("sufixo genérico colado é removido", () => {
    expect(cleanCustomerName("Fabioiptv")).toEqual({ firstName: "Fabio", fullName: "Fabio" });
  });
  it("sem separador nem sufixo apenas capitaliza", () => {
    expect(cleanCustomerName("ronemoreira")).toEqual({ firstName: "Ronemoreira", fullName: "Ronemoreira" });
  });
  it("nome salvo no pedido tem prioridade", () => {
    expect(cleanCustomerName("ronemoreira", "  Rone Moreira ")).toEqual({ firstName: "Rone", fullName: "Rone Moreira" });
  });
});

describe("buildQueue: nome limpo e link com usuário", () => {
  const NOW2 = new Date("2026-11-20T15:00:00Z");
  const at2 = (d: number) => new Date(NOW2.getTime() + d * 86_400_000).toISOString();
  const clients = [
    { username: "mara.iptv", phone: "11999998888", expires_at: at2(3), blocked: false },
    { username: "ronemoreira", phone: "11999997777", expires_at: at2(1), blocked: false },
  ];
  it("usa o primeiro nome e anexa u= (codificado) ao link", () => {
    const q = buildQueue({ clients, scheduledUsernames: [], names: new Map([["ronemoreira", "Rone Moreira"]]), link: "https://s/r/renovacao?pagar=1", now: NOW2 });
    const mara = q.find((i) => i.username === "mara.iptv")!;
    expect(mara.name).toBe("Mara");
    expect(mara.text).toContain("Olá Mara!");
    expect(mara.text).toContain("https://s/r/renovacao?pagar=1&u=mara.iptv");
    const rone = q.find((i) => i.username === "ronemoreira")!;
    expect(rone.name).toBe("Rone Moreira");
    expect(rone.text).toContain("Olá Rone,");
  });
  it("link sem query usa ? e codifica caracteres especiais", () => {
    const q = buildQueue({ clients: [{ username: "a b&c", phone: null, expires_at: at2(3), blocked: false }], scheduledUsernames: [], link: "https://s/pagar", now: NOW2 });
    expect(q[0]!.text).toContain("https://s/pagar?u=a%20b%26c");
  });
});

describe("buildQueue: cada aviso usa a própria mensagem configurada", () => {
  const N = new Date("2026-11-20T15:00:00Z");
  const at = (d: number) => new Date(N.getTime() + d * 86_400_000).toISOString();
  it("D-3, D-1, D-0 e vencido recebem textos diferentes, com quebras de linha preservadas", () => {
    const templates = { d3: "TRES {nome}\nlinha2", d1: "AMANHA {nome}", d0: "HOJE {nome}", vencido: "VENCEU {nome}" };
    const clients = [
      { username: "ana.iptv", phone: "11999990001", expires_at: at(3), blocked: false },
      { username: "bia.iptv", phone: "11999990002", expires_at: at(1), blocked: false },
      { username: "caio.iptv", phone: "11999990003", expires_at: at(0), blocked: false },
      { username: "duda.iptv", phone: "11999990004", expires_at: at(-1), blocked: false },
    ];
    const q = buildQueue({ clients, scheduledUsernames: [], templates, link: "https://s", now: N });
    const t = (u: string) => q.find((i) => i.username === u)!.text;
    expect(t("ana.iptv")).toBe("TRES Ana\nlinha2");
    expect(t("bia.iptv")).toBe("AMANHA Bia");
    expect(t("caio.iptv")).toBe("HOJE Caio");
    expect(t("duda.iptv")).toBe("VENCEU Duda");
  });
});
