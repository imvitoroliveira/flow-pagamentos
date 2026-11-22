import { describe, expect, it } from "vitest";
import { buildQueue, classifyRegua, daysUntil, formatBatch, interpolate, normalizePhoneBR, waLink } from "@/lib/cobranca";

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
    expect(q[1]).toMatchObject({ regua: "d0", phone: null, name: "bia" });
    expect(q[2]).toMatchObject({ regua: "vencido" });
  });
  it("links e lote", () => {
    expect(waLink("5511999998888", "oi tudo")).toBe("https://web.whatsapp.com/send?phone=5511999998888&text=oi%20tudo");
    expect(formatBatch(q)).toContain("SEM NÚMERO");
  });
});
