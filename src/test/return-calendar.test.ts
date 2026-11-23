import { describe, expect, it } from "vitest";
import {
  aggregateDays, buildMonthGrid, centsToInput, dayPnl, dayTone, maskReais, monthBounds, monthTotals, parseReaisToCents, roas, shiftMonth, signedBrl, spDayKey,
} from "@/lib/return-calendar";

describe("dayPnl / dayTone", () => {
  it("PnL = vendas - gastos", () => {
    expect(dayPnl(19000, 5000)).toBe(14000);
    expect(dayPnl(0, 2500)).toBe(-2500);
  });
  it("detecta verde, vermelho e cinza", () => {
    expect(dayTone(14000)).toBe("profit");
    expect(dayTone(-2500)).toBe("loss");
    expect(dayTone(0)).toBe("neutral");
  });
});

describe("roas", () => {
  it("faturamento ÷ gasto", () => {
    expect(roas(425000, 120000)).toBeCloseTo(3.5417, 3);
  });
  it("sem gasto não divide por zero", () => {
    expect(roas(1000, 0)).toBeNull();
  });
});

describe("aggregateDays", () => {
  it("agrupa por dia de São Paulo (23h SP ainda é o mesmo dia, mesmo já sendo o dia seguinte em UTC)", () => {
    expect(spDayKey("2026-11-16T02:30:00Z")).toBe("2026-11-15");
    expect(spDayKey("2026-11-15T03:00:00Z")).toBe("2026-11-15");
  });
  it("soma vendas, gastos e PnL por dia", () => {
    const m = aggregateDays(
      [
        { paid_at: "2026-11-15T13:00:00Z", amount_cents: 5000 },
        { paid_at: "2026-11-16T01:00:00Z", amount_cents: 7000 },
        { paid_at: null, amount_cents: 999 },
      ],
      [{ date: "2026-11-15", spend_cents: 4000 }, { date: "2026-11-15", spend_cents: 1500 }, { date: "2026-11-20", spend_cents: 3000 }],
    );
    expect(m.get("2026-11-15")).toEqual({ sales: 2, revenue_cents: 12000, spend_cents: 5500, pnl_cents: 6500 });
    expect(m.get("2026-11-20")).toEqual({ sales: 0, revenue_cents: 0, spend_cents: 3000, pnl_cents: -3000 });
    expect(m.size).toBe(2);
  });
  it("totais do mês", () => {
    const m = aggregateDays([{ paid_at: "2026-11-02T15:00:00Z", amount_cents: 425000 }], [{ date: "2026-11-02", spend_cents: 120000 }]);
    const t = monthTotals(m.values());
    expect(t).toMatchObject({ revenue_cents: 425000, spend_cents: 120000, pnl_cents: 305000, sales: 1 });
    expect(t.roas).toBeCloseTo(3.54, 2);
  });
});

describe("buildMonthGrid", () => {
  it("novembro/2026 começa no domingo → 6 dias de preenchimento antes (semana começa na segunda)", () => {
    const g = buildMonthGrid(2026, 10);
    expect(g.length % 7).toBe(0);
    expect(g[0]).toMatchObject({ key: "2026-10-26", inMonth: false });
    expect(g[6]).toMatchObject({ key: "2026-11-01", day: 1, inMonth: true });
    expect(g.filter((c) => c.inMonth)).toHaveLength(30);
  });
  it("mês que começa na segunda não tem preenchimento inicial", () => {
    const g = buildMonthGrid(2026, 5); // junho/2026 começa numa segunda
    expect(g[0]).toMatchObject({ key: "2026-06-01", inMonth: true });
  });
});

describe("meses", () => {
  it("shiftMonth atravessa o ano", () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month0: 11 });
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month0: 0 });
  });
  it("monthBounds usa meia-noite de São Paulo", () => {
    expect(monthBounds(2026, 10)).toMatchObject({ from: "2026-11-01T00:00:00-03:00", to: "2026-12-01T00:00:00-03:00", toDate: "2026-12-01" });
    expect(monthBounds(2026, 11).to).toBe("2027-01-01T00:00:00-03:00");
  });
});

describe("máscara e formato em reais", () => {
  it("parseReaisToCents", () => {
    expect(parseReaisToCents("50")).toBe(5000);
    expect(parseReaisToCents("1.234,50")).toBe(123450);
    expect(parseReaisToCents("12,5")).toBe(1250);
    expect(parseReaisToCents("12.5")).toBe(1250);
    expect(parseReaisToCents("1.234")).toBe(123400);
    expect(parseReaisToCents("R$ 0,99")).toBe(99);
    expect(parseReaisToCents("")).toBeNull();
  });
  it("maskReais preenche da direita para a esquerda", () => {
    expect(maskReais("1")).toBe("0,01");
    expect(maskReais("12345")).toBe("123,45");
    expect(maskReais("123456")).toBe("1.234,56");
    expect(maskReais("abc")).toBe("");
    expect(parseReaisToCents(maskReais("123456"))).toBe(123456);
  });
  it("centsToInput / signedBrl", () => {
    expect(centsToInput(5000)).toBe("50,00");
    expect(signedBrl(14000).replace(/\s/g, " ")).toBe("+ R$ 140,00");
    expect(signedBrl(-2500).replace(/\s/g, " ")).toBe("- R$ 25,00");
    expect(signedBrl(0).replace(/\s/g, " ")).toBe("R$ 0,00");
  });
});
