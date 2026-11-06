import { describe, expect, it } from "vitest";
import { CLOSED_RECHECK_WINDOW_MS, createThrottle, inRunSlot, mapLimit, shouldRecheckClosedOrder } from "@/lib/reconcile-policy";

const MIN = 60_000;
const at = (minute: number) => minute * MIN; // instante com minuto conhecido

describe("shouldRecheckClosedOrder", () => {
  it("pedidos com menos de 30 min são conferidos a cada rodada", () => {
    for (const m of [0, 1, 2, 3, 7, 9]) expect(shouldRecheckClosedOrder(10 * MIN, at(m))).toBe(true);
  });
  it("entre 30 min e 2 h confere uma vez a cada 10 min", () => {
    const hits = Array.from({ length: 10 }, (_, m) => shouldRecheckClosedOrder(60 * MIN, at(m))).filter(Boolean).length;
    expect(hits).toBe(2); // 2 minutos consecutivos por janela de 10; o cron de 2 em 2 min cai em 1
    expect(shouldRecheckClosedOrder(60 * MIN, at(5))).toBe(false);
  });
  it("entre 2 h e 6 h confere uma vez a cada 30 min", () => {
    const hits = Array.from({ length: 30 }, (_, m) => shouldRecheckClosedOrder(3 * 3_600_000, at(m))).filter(Boolean).length;
    expect(hits).toBe(2);
  });
  it("depois de 6 h nunca mais confere", () => {
    expect(shouldRecheckClosedOrder(CLOSED_RECHECK_WINDOW_MS, at(0))).toBe(false);
    expect(shouldRecheckClosedOrder(48 * 3_600_000, at(0))).toBe(false);
  });
  it("idade negativa (relógio desajustado) não confere", () => {
    expect(shouldRecheckClosedOrder(-1, at(0))).toBe(false);
  });
  it("com cron de 2 em 2 min, uma janela de 30 min de backoff gera no máximo 1 chamada por pedido", () => {
    let calls = 0;
    for (let m = 0; m < 30; m += 2) if (shouldRecheckClosedOrder(3 * 3_600_000, at(m))) calls++;
    expect(calls).toBe(1);
  });
});

describe("createThrottle", () => {
  it("deixa passar no máximo 1 vez por intervalo por chave", () => {
    const ok = createThrottle(15_000);
    expect(ok("a", 0)).toBe(true);
    expect(ok("a", 4_000)).toBe(false);
    expect(ok("a", 14_999)).toBe(false);
    expect(ok("a", 15_000)).toBe(true);
  });
  it("chaves diferentes não se bloqueiam", () => {
    const ok = createThrottle(15_000);
    expect(ok("a", 0)).toBe(true);
    expect(ok("b", 1)).toBe(true);
  });
  it("não cresce sem limite", () => {
    const ok = createThrottle(1_000, 3);
    for (let i = 0; i < 10; i++) expect(ok(`k${i}`, i)).toBe(true);
  });
});

describe("mapLimit", () => {
  it("processa tudo respeitando o limite de concorrência", async () => {
    let active = 0, peak = 0, done = 0;
    await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--; done++;
    });
    expect(done).toBe(7);
    expect(peak).toBeLessThanOrEqual(3);
  });
  it("aceita lista vazia", async () => {
    await expect(mapLimit([], 5, async () => {})).resolves.toBeUndefined();
  });
});

describe("inRunSlot (cron de 2 em 2 min rodando algo a cada 5 min)", () => {
  it("um cron de 2 min cai exatamente 1 vez por janela de 5 min", () => {
    for (const offset of [0, 1]) {
      const perSlot = new Map<number, number>();
      for (let m = offset; m < 600; m += 2) if (inRunSlot(at(m), 5)) perSlot.set(Math.floor(m / 5), (perSlot.get(Math.floor(m / 5)) ?? 0) + 1);
      expect(perSlot.size).toBe(120);
      expect([...perSlot.values()].every((n) => n === 1)).toBe(true);
    }
  });
  it("a média fica em torno de 5 min (nunca passa de 6 min entre execuções)", () => {
    const runs: number[] = [];
    for (let m = 0; m < 600; m += 2) if (inRunSlot(at(m), 5)) runs.push(m);
    const gaps = runs.slice(1).map((m, i) => m - runs[i]!);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(6);
  });
});
