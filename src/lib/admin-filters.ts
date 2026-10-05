import { z } from "zod";

export const PERIODS = ["today", "yesterday", "7d", "30d", "90d", "month", "custom"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<Period, string> = {
  today: "Hoje", yesterday: "Ontem", "7d": "7 dias", "30d": "30 dias", "90d": "90 dias", month: "Este mês", custom: "Personalizado",
};

export const adminSearchSchema = z.object({
  period: z.enum(PERIODS).catch("30d").default("30d"),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  campaign: z.string().uuid().optional().catch(undefined),
  seller: z.string().uuid().optional().catch(undefined),
});
export type AdminSearch = z.infer<typeof adminSearchSchema>;

// America/Sao_Paulo has a fixed UTC-3 offset (no DST since 2019).
const SP = "-03:00";
const DAY = 86_400_000;

/** yyyy-MM-dd of "now" in São Paulo. */
export function spToday(now = new Date()) {
  return new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}
const startOf = (d: string) => new Date(`${d}T00:00:00.000${SP}`);
const endOf = (d: string) => new Date(`${d}T23:59:59.999${SP}`);
const addDays = (d: string, n: number) => new Date(startOf(d).getTime() + n * DAY + 3 * 3600_000).toISOString().slice(0, 10);

export function resolveRange(s: AdminSearch) {
  const today = spToday();
  let a = today, b = today;
  switch (s.period) {
    case "yesterday": a = b = addDays(today, -1); break;
    case "7d": a = addDays(today, -6); break;
    case "30d": a = addDays(today, -29); break;
    case "90d": a = addDays(today, -89); break;
    case "month": a = today.slice(0, 8) + "01"; break;
    case "custom": a = s.start ?? addDays(today, -29); b = s.end ?? today; if (a > b) [a, b] = [b, a]; break;
  }
  const from = startOf(a), to = endOf(b);
  const len = to.getTime() - from.getTime() + 1;
  const prevTo = new Date(from.getTime() - 1), prevFrom = new Date(from.getTime() - len);
  const days = Math.round(len / DAY);
  return {
    from: from.toISOString(), to: to.toISOString(),
    prevFrom: prevFrom.toISOString(), prevTo: prevTo.toISOString(),
    startDate: a, endDate: b, days,
    bucket: (days <= 1 ? "hour" : "day") as "hour" | "day",
    campaign: s.campaign ?? null, seller: s.seller ?? null,
  };
}
export type AdminRange = ReturnType<typeof resolveRange>;
