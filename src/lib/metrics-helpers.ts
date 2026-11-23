// Commercial-intelligence helpers (pure, no I/O): device from User-Agent, state from phone area code, and the aggregation
// behind /admin/metricas. Money is integer cents everywhere; formatting happens in the screen.

export type Device = "iOS" | "Android" | "Desktop" | "Outro";
export const DEVICES_ORDER: Device[] = ["Android", "iOS", "Desktop", "Outro"];

export function parseDeviceFromUA(userAgent: string | null | undefined): Device {
  const ua = userAgent ?? "";
  if (!ua) return "Outro";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android"; // checked before Linux: Android UAs also say "Linux"
  if (/Mobile/i.test(ua)) return "Outro"; // other mobile OSes are not "Desktop"
  if (/Windows NT|Macintosh|Linux|X11|CrOS/i.test(ua)) return "Desktop";
  return "Outro";
}

// Real Brazilian area codes (DDD). Codes that don't exist (e.g. 10, 20, 52, 72) resolve to null.
const DDD_BY_UF: Record<string, number[]> = {
  SP: [11, 12, 13, 14, 15, 16, 17, 18, 19], RJ: [21, 22, 24], ES: [27, 28], MG: [31, 32, 33, 34, 35, 37, 38],
  PR: [41, 42, 43, 44, 45, 46], SC: [47, 48, 49], RS: [51, 53, 54, 55],
  DF: [61], GO: [62, 64], TO: [63], MT: [65, 66], MS: [67], AC: [68], RO: [69],
  BA: [71, 73, 74, 75, 77], SE: [79], PE: [81, 87], AL: [82], PB: [83], RN: [84], CE: [85, 88], PI: [86, 89],
  PA: [91, 93, 94], AM: [92, 97], RR: [95], AP: [96], MA: [98, 99],
};
const UF_BY_DDD = new Map<string, string>(Object.entries(DDD_BY_UF).flatMap(([uf, ddds]) => ddds.map((d) => [String(d), uf] as const)));

export const UF_NAME: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco",
  PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
  SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

/** "+55 (11) 99999-8888" → "SP". The DDI 55 is only removed from 12/13-digit numbers (DDD 55 is Rio Grande do Sul). */
export function getUfFromPhone(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  if (d.length !== 10 && d.length !== 11) return null;
  return UF_BY_DDD.get(d.slice(0, 2)) ?? null;
}

// ─── aggregation ──────────────────────────────────────────────────────────

export type ClickIn = { ref_code: string; user_agent: string | null };
export type SaleIn = { ref_code: string | null; amount_cents: number; customer_phone: string | null };

export type DeviceRow = { device: Device; accesses: number; sales: number; conversion: number | null; revenue_cents: number };
export type StateRow = { uf: string | null; sales: number; revenue_cents: number; ticket_cents: number | null; share: number | null };

const pctOf = (a: number, b: number) => (b > 0 ? (100 * a) / b : null);

/**
 * clicks: visits in the period (the "accesses"). sales: paid/renewed orders in the period.
 * refUa: user agents by ref_code for sales whose click happened before the period (so the device can still be found).
 * Devices count only tracked sales (with a ref_code); the state ranking counts every sale (phone area code).
 */
export function aggregateMetrics(clicks: ClickIn[], sales: SaleIn[], refUa: Map<string, string | null> = new Map()) {
  const uaByRef = new Map<string, string | null>(refUa);
  for (const c of clicks) uaByRef.set(c.ref_code, c.user_agent);

  const dev = new Map<Device, { accesses: number; sales: number; revenue_cents: number }>(DEVICES_ORDER.map((d) => [d, { accesses: 0, sales: 0, revenue_cents: 0 }]));
  for (const c of clicks) dev.get(parseDeviceFromUA(c.user_agent))!.accesses++;
  const tracked = sales.filter((s) => s.ref_code);
  for (const s of tracked) {
    const row = dev.get(parseDeviceFromUA(uaByRef.get(s.ref_code!) ?? null))!;
    row.sales++; row.revenue_cents += s.amount_cents;
  }
  const devices: DeviceRow[] = DEVICES_ORDER.map((d) => {
    const r = dev.get(d)!;
    return { device: d, ...r, conversion: pctOf(r.sales, r.accesses) };
  });

  const st = new Map<string | null, { sales: number; revenue_cents: number }>();
  for (const s of sales) {
    const uf = getUfFromPhone(s.customer_phone);
    const r = st.get(uf) ?? { sales: 0, revenue_cents: 0 };
    r.sales++; r.revenue_cents += s.amount_cents; st.set(uf, r);
  }
  const totalRevenue = sales.reduce((a, s) => a + s.amount_cents, 0);
  const states: StateRow[] = [...st.entries()]
    .map(([uf, r]) => ({ uf, ...r, ticket_cents: r.sales ? Math.round(r.revenue_cents / r.sales) : null, share: pctOf(r.revenue_cents, totalRevenue) }))
    .sort((a, b) => b.revenue_cents - a.revenue_cents || b.sales - a.sales || String(a.uf).localeCompare(String(b.uf)));

  const topDevice = [...devices].filter((d) => d.accesses > 0).sort((a, b) => b.accesses - a.accesses)[0] ?? null;
  const topState = states.find((s) => s.uf !== null) ?? null;
  return {
    devices, states, topDevice, topState,
    totals: {
      accesses: clicks.length, trackedSales: tracked.length, trackedRevenue_cents: tracked.reduce((a, s) => a + s.amount_cents, 0),
      conversion: pctOf(tracked.length, clicks.length), allSales: sales.length, allRevenue_cents: totalRevenue,
    },
  };
}
