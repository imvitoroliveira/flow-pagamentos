/** Pure helpers for the monthly profit/loss calendar (all money in integer cents, days in America/Sao_Paulo). */

export type SaleDay = { paid_at: string | null; amount_cents: number };
export type SpendDay = { date: string; spend_cents: number };
export type DayTone = "profit" | "loss" | "neutral";
export type DayCell = { key: string; day: number; inMonth: boolean };
export type DayStat = { sales: number; revenue_cents: number; spend_cents: number; pnl_cents: number };

const SP_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const pad = (n: number) => String(n).padStart(2, "0");

export const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;
export const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"] as const;

/** yyyy-MM-dd of an instant, as seen in São Paulo. */
export const spDayKey = (iso: string) => SP_DAY.format(new Date(iso));
export const dayKey = (year: number, month0: number, day: number) => `${year}-${pad(month0 + 1)}-${pad(day)}`;
export const monthKey = (year: number, month0: number) => `${year}-${pad(month0 + 1)}`;

/** ISO instants bounding a month in São Paulo (UTC-03:00, no DST), end exclusive. */
export function monthBounds(year: number, month0: number) {
  const next = month0 === 11 ? { y: year + 1, m: 0 } : { y: year, m: month0 + 1 };
  return { from: `${dayKey(year, month0, 1)}T00:00:00-03:00`, to: `${dayKey(next.y, next.m, 1)}T00:00:00-03:00`, fromDate: dayKey(year, month0, 1), toDate: dayKey(next.y, next.m, 1) };
}

export function shiftMonth(year: number, month0: number, delta: number) {
  const t = year * 12 + month0 + delta;
  return { year: Math.floor(t / 12), month0: ((t % 12) + 12) % 12 };
}

/** Monday-first grid (complete weeks) including the neighbouring days that pad the first/last week. */
export function buildMonthGrid(year: number, month0: number): DayCell[] {
  const first = new Date(Date.UTC(year, month0, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const days = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const total = Math.ceil((lead + days) / 7) * 7;
  const cells: DayCell[] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(Date.UTC(year, month0, 1 - lead + i));
    cells.push({ key: dayKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), day: d.getUTCDate(), inMonth: d.getUTCMonth() === month0 });
  }
  return cells;
}

/** Revenue, sales count, spend and PnL per São Paulo day. */
export function aggregateDays(sales: SaleDay[], spend: SpendDay[]): Map<string, DayStat> {
  const m = new Map<string, DayStat>();
  const get = (k: string) => {
    let s = m.get(k);
    if (!s) m.set(k, (s = { sales: 0, revenue_cents: 0, spend_cents: 0, pnl_cents: 0 }));
    return s;
  };
  for (const s of sales) {
    if (!s.paid_at) continue;
    const d = get(spDayKey(s.paid_at));
    d.sales += 1;
    d.revenue_cents += s.amount_cents;
  }
  for (const s of spend) get(s.date).spend_cents += s.spend_cents;
  for (const d of m.values()) d.pnl_cents = d.revenue_cents - d.spend_cents;
  return m;
}

export const dayPnl = (revenueCents: number, spendCents: number) => revenueCents - spendCents;
export const dayTone = (pnlCents: number): DayTone => (pnlCents > 0 ? "profit" : pnlCents < 0 ? "loss" : "neutral");

export function monthTotals(days: Iterable<DayStat>) {
  let revenue_cents = 0, spend_cents = 0, sales = 0;
  for (const d of days) { revenue_cents += d.revenue_cents; spend_cents += d.spend_cents; sales += d.sales; }
  return { revenue_cents, spend_cents, sales, pnl_cents: revenue_cents - spend_cents, roas: roas(revenue_cents, spend_cents) };
}

/** Revenue ÷ spend; null when nothing was spent (shown as "—"). */
export const roas = (revenueCents: number, spendCents: number): number | null => (spendCents > 0 ? revenueCents / spendCents : null);

/** "1.234,50" / "12,5" / "12.5" / "R$ 50" → cents; null when empty or invalid. */
export function parseReaisToCents(text: string): number | null {
  const t = text.replace(/[^\d.,]/g, "");
  if (!t) return null;
  const comma = t.lastIndexOf(","), dot = t.lastIndexOf(".");
  const sep = Math.max(comma, dot);
  let int = t, frac = "";
  // a separator followed by 1–2 digits is the decimal mark; otherwise it's thousands grouping
  if (sep >= 0 && t.length - sep - 1 <= 2) { int = t.slice(0, sep); frac = t.slice(sep + 1); }
  const intDigits = int.replace(/[.,]/g, "");
  const cents = Number(intDigits || "0") * 100 + Number(frac.padEnd(2, "0") || "0");
  return Number.isFinite(cents) ? cents : null;
}

/** Cents → "1.234,50" for the input field (no currency symbol). */
export const centsToInput = (cents: number) => (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Mask while typing: digits fill from the right (12345 → "123,45"). */
export function maskReais(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits ? centsToInput(Number(digits)) : "";
}

/** Signed BRL for PnL: "+ R$ 140,00" / "- R$ 25,00" / "R$ 0,00". */
export function signedBrl(cents: number): string {
  const v = (Math.abs(cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return cents > 0 ? `+ ${v}` : cents < 0 ? `- ${v}` : v;
}
