import { describe, expect, it } from "vitest";
import { manualScheduleSchema } from "@/lib/admin-schemas";
import { DRIP_LEAD_DAYS, looksApplied, buildClientHistory, centsToReaisText, fillFromHistory, manualScheduleRow, nextRunFor, reaisToCents, remainingMonths, scheduleStateAfterApply } from "@/lib/drip-schedule";

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

describe("agendamento manual (venda em espécie)", () => {
  const exp = new Date(Date.now() + 30 * DAY);
  it("converte reais em centavos sem erro de ponto flutuante", () => {
    expect(reaisToCents(150)).toBe(15000);
    expect(reaisToCents(19.9)).toBe(1990);
    expect(reaisToCents(0.1 + 0.2)).toBe(30);
    expect(reaisToCents(-5)).toBe(0);
    expect(reaisToCents(Number.NaN)).toBe(0);
  });
  it("monta o agendamento: 1 mês já aplicado, próxima execução 2 dias antes do vencimento", () => {
    const r = manualScheduleRow({ total_months: 3, amount_reais: 120, activate_first_month_now: false }, exp);
    expect(r.amount_cents).toBe(12000);
    expect(r.schedule).toMatchObject({ total_months: 3, months_applied: 1, status: "active", last_exp_date: exp.toISOString() });
    expect(new Date(r.schedule.next_run_at!).getTime()).toBe(exp.getTime() - DRIP_LEAD_DAYS * DAY);
    expect(remainingMonths(r.schedule)).toBe(2);
  });
  it("vencimento a menos de 2 dias: próxima execução é imediata (nunca no passado)", () => {
    const soon = new Date(Date.now() + DAY);
    const r = manualScheduleRow({ total_months: 2, amount_reais: 50, activate_first_month_now: false }, soon);
    expect(new Date(r.schedule.next_run_at!).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
  it("valida a entrada: mínimo 1 mês, usuário obrigatório, valores como texto", () => {
    const base = { panel_username: " joao ", total_months: "3", amount_reais: "150", activate_first_month_now: false };
    const ok = manualScheduleSchema.parse(base);
    expect(ok).toMatchObject({ panel_username: "joao", total_months: 3, amount_reais: 150, customer_name: "" });
    expect(manualScheduleSchema.safeParse({ ...base, total_months: 1 }).success).toBe(true);
    expect(manualScheduleSchema.safeParse({ ...base, total_months: 0 }).success).toBe(false);
    expect(manualScheduleSchema.safeParse({ ...base, total_months: 2.5 }).success).toBe(false);
    expect(manualScheduleSchema.safeParse({ ...base, panel_username: "  " }).success).toBe(false);
    expect(manualScheduleSchema.safeParse({ ...base, amount_reais: -1 }).success).toBe(false);
  });
  it("1 mês adiantado e agendado: nada aplicado, ativa 2 dias antes do vencimento", () => {
    const r = manualScheduleRow({ total_months: 1, amount_reais: 35, activate_first_month_now: false }, exp);
    expect(r.amount_cents).toBe(3500);
    expect(r.schedule.months_applied).toBe(0);
    expect(r.schedule.status).toBe("active");
    expect(new Date(r.schedule.next_run_at!).getTime()).toBe(exp.getTime() - DRIP_LEAD_DAYS * DAY);
    expect(remainingMonths(r.schedule)).toBe(1);
  });
  it("1 mês ativado agora: nasce concluído, sem próxima execução", () => {
    const r = manualScheduleRow({ total_months: 1, amount_reais: 35, activate_first_month_now: true }, exp);
    expect(r.schedule.months_applied).toBe(1);
    expect(r.schedule.status).toBe("done");
    expect(r.schedule.next_run_at).toBeNull();
    expect(remainingMonths(r.schedule)).toBe(0);
  });
  it("3 meses com o 1º já ativo: 1 aplicado, 2 restantes", () => {
    const r = manualScheduleRow({ total_months: 3, amount_reais: 90, activate_first_month_now: false }, exp);
    expect(r.schedule.months_applied).toBe(1);
    expect(r.schedule.status).toBe("active");
    expect(remainingMonths(r.schedule)).toBe(2);
  });
});

describe("auto-preenchimento a partir do histórico", () => {
  it("formata centavos em reais pt-BR", () => {
    expect(centsToReaisText(3500)).toBe("35,00");
    expect(centsToReaisText(1990)).toBe("19,90");
    expect(centsToReaisText(5)).toBe("0,05");
  });
  it("monta o histórico da última compra e preserva os campos de cliente recorrente", () => {
    const h = buildClientHistory("matheus", { customer_name: "Matheus Lemos", customer_phone: "", amount_cents: 3500 }, { phone: "11999990000" });
    expect(h).toMatchObject({ last_customer_name: "Matheus Lemos", last_customer_phone: "11999990000", last_amount_reais: "35,00", is_recurring: true });
    const r = { found: true as const, username: "matheus", exp_date: null, open_schedules: 0, ...h };
    expect(r.is_recurring).toBe(true);
    expect(r.last_amount_reais).toBe("35,00");
  });
  it("nome igual ao usuário não conta como nome; sem histórico não é recorrente", () => {
    expect(buildClientHistory("joao", { customer_name: "JOAO", customer_phone: "1", amount_cents: 100 }, null).last_customer_name).toBeNull();
    const none = buildClientHistory("joao", null, null);
    expect(none).toMatchObject({ last_customer_name: null, last_customer_phone: null, last_amount_reais: null, is_recurring: false });
  });
  it("só preenche campos vazios, sem sobrescrever o que o admin digitou", () => {
    const h = { last_customer_name: "Matheus Lemos", last_customer_phone: "11999990000", last_amount_reais: "35,00" };
    expect(fillFromHistory({ name: "", phone: "", amount: "" }, h)).toMatchObject({ name: "Matheus Lemos", phone: "11999990000", amount: "35,00" });
    expect(fillFromHistory({ name: "Outro", phone: "", amount: "50" }, h)).toMatchObject({ name: "Outro", phone: "11999990000", amount: "50" });
  });
});
