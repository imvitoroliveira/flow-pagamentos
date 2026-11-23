import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, CircleHelp, Map as MapIcon, Monitor, Smartphone, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle } from "@/components/admin/coming-soon";
import { Skeleton } from "@/components/ui/skeleton";
import { BrazilMap } from "@/components/admin/brazil-map";
import { ReturnCalendar } from "@/components/admin/return-calendar";
import { aggregateMetrics, UF_NAME, type ClickIn, type Device, type SaleIn } from "@/lib/metrics-helpers";
import { useAdminFilters } from "./admin";
import { brl, Card, COLORS, Empty, ErrorState, num, pct } from "./admin.index";

export const Route = createFileRoute("/_authenticated/admin/metricas")({
  head: () => ({ meta: [{ title: "Métricas e Inteligência — Admin NATV" }, { name: "description", content: "Aparelhos, estados e conversão das vendas rastreadas." }, { property: "og:title", content: "Métricas e Inteligência — Admin NATV" }, { property: "og:description", content: "Aparelhos, estados e conversão das vendas rastreadas." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: MetricsPage,
});

const PAGE = 1000;
const MAX_ROWS = 20_000;
const DEVICE_ICON: Record<Device, LucideIcon> = { iOS: Smartphone, Android: Smartphone, Desktop: Monitor, Outro: CircleHelp };
const tipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 12 };
const ufLabel = (uf: string | null) => (uf ? `${uf} · ${UF_NAME[uf] ?? uf}` : "Não identificado");

/** Reads every page of a query (the API returns at most 1000 rows per call), up to MAX_ROWS. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: Error | null }>) {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

function useMetrics() {
  const f = useAdminFilters();
  return useQuery({
    queryKey: ["metricas", f.from, f.to, f.campaign, f.seller],
    staleTime: 60_000, placeholderData: keepPreviousData,
    queryFn: async () => {
      // campaign filter is direct; seller filter goes through that seller's campaigns
      let campaignIds: string[] | null = f.campaign ? [f.campaign] : null;
      if (f.seller) {
        const { data, error } = await supabase.from("campaigns").select("id").eq("seller_id", f.seller);
        if (error) throw error;
        const mine = (data ?? []).map((c) => c.id);
        campaignIds = campaignIds ? campaignIds.filter((id) => mine.includes(id)) : mine;
      }
      if (campaignIds && !campaignIds.length) return { ...aggregateMetrics([], []), truncated: false };

      const [c, o] = await Promise.all([
        fetchAll<ClickIn>((a, b) => {
          let q = supabase.from("clicks").select("id, created_at, user_agent, ref_code, campaign_id, source").gte("created_at", f.from).lte("created_at", f.to).order("created_at", { ascending: false });
          if (campaignIds) q = q.in("campaign_id", campaignIds);
          return q.range(a, b);
        }),
        fetchAll<SaleIn>((a, b) => {
          let q = supabase.from("orders").select("id, created_at, status, amount_cents, customer_phone, ref_code, campaign_id, paid_at").in("status", ["paid", "renewed"]).gte("paid_at", f.from).lte("paid_at", f.to).order("paid_at", { ascending: false });
          if (campaignIds) q = q.in("campaign_id", campaignIds);
          return q.range(a, b);
        }),
      ]);

      // Sales whose click happened before the period still tell us the device.
      const known = new Set(c.rows.map((x) => x.ref_code));
      const missing = [...new Set(o.rows.map((s) => s.ref_code).filter((r): r is string => !!r && !known.has(r)))];
      const refUa = new Map<string, string | null>();
      for (let i = 0; i < missing.length; i += 150) {
        const { data, error } = await supabase.from("clicks").select("ref_code, user_agent").in("ref_code", missing.slice(i, i + 150));
        if (error) throw error;
        for (const r of data ?? []) refUa.set(r.ref_code, r.user_agent);
      }
      return { ...aggregateMetrics(c.rows, o.rows, refUa), truncated: c.truncated || o.truncated };
    },
  });
}

function Kpi({ title, value, hint, loading }: { title: string; value: string; hint: string; loading: boolean }) {
  return (
    <Card title={title}>
      {loading ? <Skeleton className="h-14" /> : (
        <>
          <p className="font-display text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </>
      )}
    </Card>
  );
}

function MetricsPage() {
  const q = useMetrics();
  const filters = useAdminFilters();
  const [viewMode, setViewMode] = useState<"map" | "bars">("map");
  const d = q.data;
  const loading = q.isLoading;
  const devicesWithTraffic = useMemo(() => (d?.devices ?? []).filter((x) => x.accesses > 0), [d]);
  const topStates = useMemo(() => (d?.states ?? []).filter((s) => s.uf).slice(0, 10).map((s) => ({ uf: s.uf as string, reais: s.revenue_cents / 100, sales: s.sales })), [d]);
  const mapStates = useMemo(() => (d?.states ?? []).flatMap((s) => (s.uf ? [{ uf: s.uf, sales: s.sales, revenue_cents: s.revenue_cents, share: s.share }] : [])), [d]);
  const totalSales = d?.states.reduce((a, s) => a + s.sales, 0) ?? 0;

  return (
    <div className="space-y-4">
      <PageTitle title="Métricas e inteligência" subtitle="Aparelhos, estados e conversão. Respeita período, campanha e vendedor do topo." />

      {q.isError && !d ? <Card><ErrorState onRetry={() => q.refetch()} /></Card> : (
        <>
          {d?.truncated && <p className="rounded-md border border-amber-500/50 px-3 py-2 text-xs text-amber-500" role="status">Período com muitos registros: mostrando os {num(MAX_ROWS)} mais recentes de cada tipo. Reduza o período para números completos.</p>}

          {/* Seção 1 — KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi loading={loading} title="Aparelho campeão" value={d?.topDevice ? d.topDevice.device : "—"}
              hint={d?.topDevice ? `${num(d.topDevice.accesses)} acessos · conversão ${pct(d.topDevice.conversion)}` : "Sem acessos no período"} />
            <Kpi loading={loading} title="Estado (UF) campeão" value={d?.topState?.uf ? ufLabel(d.topState.uf) : "—"}
              hint={d?.topState ? `${brl(d.topState.revenue_cents)} · ${num(d.topState.sales)} vendas` : "Sem vendas com telefone válido"} />
            <Kpi loading={loading} title="Conversão global" value={pct(d?.totals.conversion)}
              hint={d ? `${num(d.totals.trackedSales)} vendas rastreadas ÷ ${num(d.totals.accesses)} acessos` : ""} />
            <Kpi loading={loading} title="Faturamento rastreado" value={d ? brl(d.totals.trackedRevenue_cents) : "—"}
              hint="Vendas pagas/renovadas com código de campanha" />
          </div>

          {/* Calendário de performance financeira */}
          <ReturnCalendar campaign={filters.campaign} seller={filters.seller} />

          {/* Seção 2 — Aparelhos */}
          <Card title="Distribuição por tipo de aparelho">
            {loading ? <Skeleton className="h-56" /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !devicesWithTraffic.length ? (
              <Empty msg="Nenhum acesso no período." hint="Os acessos vêm dos links de campanha /r/slug e das landing pages." />
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_1fr]">
                <div className="h-56" aria-hidden>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={devicesWithTraffic} dataKey="accesses" nameKey="device" innerRadius={52} outerRadius={84} paddingAngle={2} stroke="none">
                        {devicesWithTraffic.map((r, i) => <Cell key={r.device} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tipStyle} formatter={(v: number, n: string) => [`${num(v)} acessos`, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr><th className="p-2">Dispositivo</th><th className="p-2 text-right">Acessos</th><th className="p-2 text-right">Vendas</th><th className="p-2 text-right">Conversão</th><th className="p-2 text-right">Faturamento</th></tr>
                    </thead>
                    <tbody>
                      {d!.devices.map((r) => {
                        const Icon = DEVICE_ICON[r.device];
                        return (
                          <tr key={r.device} className="border-t">
                            <td className="p-2"><span className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs"><Icon className="h-3.5 w-3.5" aria-hidden />{r.device}</span></td>
                            <td className="p-2 text-right">{num(r.accesses)}</td>
                            <td className="p-2 text-right">{num(r.sales)}</td>
                            <td className="p-2 text-right">{pct(r.conversion)}</td>
                            <td className="p-2 text-right">{brl(r.revenue_cents)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-muted-foreground">Vendas por aparelho: só as com código de campanha. Uma venda do período pode vir de um acesso anterior, então a conversão é aproximada.</p>
                </div>
              </div>
            )}
          </Card>

          {/* Seção 3 — Estados */}
          <Card title="Ranking de faturamento por estado (UF)">
            {loading ? <Skeleton className="h-72" /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !d!.states.length ? (
              <Empty msg="Nenhuma venda paga no período." hint="Amplie o período ou remova filtros." />
            ) : (
              <div className="space-y-4">
                <div className="flex justify-end gap-1" role="group" aria-label="Tipo de visualização">
                  {([["map", "Mapa", MapIcon], ["bars", "Barras", BarChart3]] as const).map(([v, label, Icon]) => (
                    <button key={v} type="button" aria-pressed={viewMode === v} onClick={() => setViewMode(v)}
                      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors ${viewMode === v ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                      <Icon className="h-4 w-4" aria-hidden />{label}
                    </button>
                  ))}
                </div>
                {viewMode === "map" && (
                  mapStates.length ? (
                    <div className="space-y-2">
                      <BrazilMap states={mapStates} />
                      <div className="mx-auto flex max-w-lg items-center gap-3 text-xs text-muted-foreground">
                        <span>Menor faturamento</span>
                        <span className="h-2 flex-1 rounded-full bg-gradient-to-r from-primary/20 to-primary/95" aria-hidden />
                        <span>Maior faturamento</span>
                      </div>
                    </div>
                  ) : <Empty msg="Nenhuma venda com telefone válido." hint="O mapa usa o DDD do telefone informado na compra." />
                )}
                {viewMode === "bars" && topStates.length > 0 && (
                  <div className="h-72" aria-hidden>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topStates} layout="vertical" margin={{ left: 4, right: 16 }}>
                        <XAxis type="number" tickFormatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                        <YAxis type="category" dataKey="uf" width={36} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                        <Tooltip contentStyle={tipStyle} cursor={{ fill: "var(--muted)", opacity: 0.3 }} formatter={(v: number) => [v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), "Faturamento"]} labelFormatter={(l: string) => ufLabel(l)} />
                        <Bar dataKey="reais" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr><th className="p-2">#</th><th className="p-2">UF / Estado</th><th className="p-2 text-right">Vendas pagas</th><th className="p-2 text-right">Ticket médio</th><th className="p-2 text-right">Faturamento</th><th className="p-2 text-right">% do total</th></tr>
                    </thead>
                    <tbody>
                      {d!.states.map((s, i) => (
                        <tr key={s.uf ?? "nd"} className="border-t">
                          <td className="p-2 text-muted-foreground">{i + 1}</td>
                          <td className="p-2">{ufLabel(s.uf)}</td>
                          <td className="p-2 text-right">{num(s.sales)}</td>
                          <td className="p-2 text-right">{brl(s.ticket_cents)}</td>
                          <td className="p-2 text-right">{brl(s.revenue_cents)}</td>
                          <td className="p-2 text-right">{pct(s.share)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-semibold">
                        <td className="p-2" /><td className="p-2">Total</td>
                        <td className="p-2 text-right">{num(totalSales)}</td>
                        <td className="p-2 text-right">{brl(totalSales ? Math.round(d!.totals.allRevenue_cents / totalSales) : null)}</td>
                        <td className="p-2 text-right">{brl(d!.totals.allRevenue_cents)}</td>
                        <td className="p-2 text-right">{pct(d!.totals.allRevenue_cents ? 100 : null)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <p className="mt-2 text-xs text-muted-foreground">O estado vem do DDD do telefone informado na compra. Inclui todas as vendas pagas ou renovadas do período, rastreadas ou não.</p>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
