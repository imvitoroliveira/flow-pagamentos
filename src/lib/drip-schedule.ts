// Pure fractional-renewal ("Futuros") rules shared by the server scheduler and the admin screens.
export const DRIP_LEAD_DAYS = 2;

/** Next automatic activation: DRIP_LEAD_DAYS before expiration (or now if unknown/past). */
export function nextRunFor(exp: Date | null): string {
  const now = Date.now();
  if (!exp) return new Date(now).toISOString();
  return new Date(Math.max(now, exp.getTime() - DRIP_LEAD_DAYS * 86_400_000)).toISOString();
}

export function remainingMonths(s: { total_months: number; months_applied: number }) {
  return Math.max(0, s.total_months - s.months_applied);
}

export function scheduleStateAfterApply(s: { total_months: number; months_applied: number }, exp: Date | null) {
  const months_applied = s.months_applied + 1;
  const done = months_applied >= s.total_months;
  return {
    months_applied,
    status: done ? ("done" as const) : ("active" as const),
    next_run_at: done ? null : nextRunFor(exp),
  };
}

/** A panel month adds ~28-31 days; anything above this per month proves an activation really happened. */
export const MIN_DAYS_PER_MONTH = 25;

/**
 * After an uncertain panel response (timeout / 5xx / crash), tells whether the activation was in fact
 * applied: the panel expiration must have moved at least `months` months past where it stood before the
 * attempt (the later of the expiration we knew and the attempt start, since expired users restart from "now").
 */
export function looksApplied(a: { baselineExp: Date | null; startedAt: number; months: number; currentExp: Date | null }): boolean {
  if (!a.currentExp) return false;
  const base = Math.max(a.baselineExp?.getTime() ?? 0, a.startedAt);
  return a.currentExp.getTime() >= base + a.months * MIN_DAYS_PER_MONTH * 86_400_000;
}
