import { describe, expect, it } from "vitest";
import { DRIP_LEAD_DAYS, looksApplied, nextRunFor, remainingMonths, scheduleStateAfterApply } from "@/lib/drip-schedule";

const DAY = 86_400_000;

describe("nextRunFor", () => {
  it("agenda a renovação exatamente 2 dias antes do vencimento", () => {
    const exp = new Date(Date.now() + 30 * DAY);
    expect(new Date(nextRunFor(exp)).getTime()).toBe(exp.getTime() - DRIP_LEAD_DAYS * DAY);
  });
  it("roda imediatamente se o vencimento já está a menos de 2 dias", () => {
    const exp = new Date(Date.now() + DAY);
    expect(Math.abs(new Date(nextRunFor(exp)).getTime() - Date.now())).toBeLessThan(1000);
  });
  it("roda imediatamente se o vencimento já passou", () => {
    const exp = new Date(Date.now() - 5 * DAY);
    expect(Math.abs(new Date(nextRunFor(exp)).getTime() - Date.now())).toBeLessThan(1000);
  });
  it("roda imediatamente se o vencimento é desconhecido", () => {
    expect(Math.abs(new Date(nextRunFor(null)).getTime() - Date.now())).toBeLessThan(1000);
  });
});

describe("parcelas restantes", () => {
  it("trimestral: 3 meses no total, 1 aplicado, restam 2", () => {
    expect(remainingMonths({ total_months: 3, months_applied: 1 })).toBe(2);
  });
  it("semestral: 6 meses no total, 1 aplicado, restam 5", () => {
    expect(remainingMonths({ total_months: 6, months_applied: 1 })).toBe(5);
  });
  it("nunca fica negativo", () => {
    expect(remainingMonths({ total_months: 3, months_applied: 4 })).toBe(0);
  });
});

describe("finalização do ciclo", () => {
  it("marca como concluído quando a última parcela é aplicada", () => {
    const next = scheduleStateAfterApply({ total_months: 3, months_applied: 2 }, new Date(Date.now() + 30 * DAY));
    expect(next).toEqual({ months_applied: 3, status: "done", next_run_at: null });
  });
  it("mantém ativo e agenda a próxima parcela enquanto restam meses", () => {
    const exp = new Date(Date.now() + 30 * DAY);
    const next = scheduleStateAfterApply({ total_months: 6, months_applied: 1 }, exp);
    expect(next.status).toBe("active");
    expect(next.months_applied).toBe(2);
    expect(new Date(next.next_run_at!).getTime()).toBe(exp.getTime() - DRIP_LEAD_DAYS * DAY);
  });
});

describe("looksApplied (resposta incerta do painel)", () => {
  const start = Date.now();
  const before = new Date(start + 2 * DAY); // vencimento conhecido antes da tentativa
  it("reconhece que o mês foi aplicado quando o vencimento avançou ~1 mês", () => {
    expect(looksApplied({ baselineExp: before, startedAt: start, months: 1, currentExp: new Date(before.getTime() + 30 * DAY) })).toBe(true);
  });
  it("não considera aplicado se o vencimento não mudou", () => {
    expect(looksApplied({ baselineExp: before, startedAt: start, months: 1, currentExp: before })).toBe(false);
  });
  it("não considera aplicado se avançou menos de 25 dias", () => {
    expect(looksApplied({ baselineExp: before, startedAt: start, months: 1, currentExp: new Date(before.getTime() + 10 * DAY) })).toBe(false);
  });
  it("cliente vencido recomeça a contar de agora", () => {
    const expired = new Date(start - 20 * DAY);
    expect(looksApplied({ baselineExp: expired, startedAt: start, months: 1, currentExp: new Date(start + 30 * DAY) })).toBe(true);
    expect(looksApplied({ baselineExp: expired, startedAt: start, months: 1, currentExp: new Date(start + 5 * DAY) })).toBe(false);
  });
  it("sem vencimento no painel nunca conta como aplicado", () => {
    expect(looksApplied({ baselineExp: before, startedAt: start, months: 1, currentExp: null })).toBe(false);
  });
});
