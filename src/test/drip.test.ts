import { describe, expect, it } from "vitest";
import { DRIP_LEAD_DAYS, nextRunFor, remainingMonths, scheduleStateAfterApply } from "@/lib/drip-schedule";

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
