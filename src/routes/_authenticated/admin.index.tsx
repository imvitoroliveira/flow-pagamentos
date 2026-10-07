import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, LineChart, Pie, PieChart, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { getIntegrationStatus } from "@/lib/admin.functions";
import { useAdminFilters } from "./admin";
import { PageTitle } from "@/components/admin/coming-soon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Visão geral — Admin NATV" },
      { name: "description", content: "KPIs de vendas, funil e renovações NATV." },
      { property: "og:title", content: "Visão geral — Admin NATV" },
      { property: "og:description", content: "KPIs de vendas, funil e renovações NATV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Overview,
});

// ─── formatting (cents in, display only) ──────────────────────────────────
export const brl = (c: number | null | undefined) => (c == null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
export const pct = (n: number | null | undefined) => (n == null || !isFinite(n) ? "—" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
export const ratio = (a: number, b: number) => (b ? (100 * a) / b : null);
export const SP_TZ = "America/Sao_Paulo";
export const dtSP = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: SP_TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dur = (s: number | null | undefined) => (s == null ? "—" : s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const STATUS: Record<string, string> = { pending: "Pendente", paid: "Pago", renewed: "Renovado", renewal_failed: "Falha renovação", expired: "Expirado", cancelled: "Cancelado" };

export type Overview = {
  clicks: number; page_sessions: number; checkout_sessions: number; pix_generated: number; paid_count: number;
  renewed_count: number; renewal_failed_count: number; revenue_cents: number; avg_ticket_cents: number | null;
  abandoned_count: number; abandoned_cents: number; renewal_success_rate: number | null; renewal_avg_seconds: number | null;
};
export type Series = { bucket: string; clicks: number; pix: number; paid: number; revenue_cents: number }[];
export type Breakdown = { key: string; label: string | null; clicks: number; pix: number; paid: number; revenue_cents: number }[];

export function useRpc<T>(name: string, args: Record<string, unknown>, key: unknown[]) {
  return useQuery({
    queryKey: ["rpc", name, ...key],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(name as never, args as never);
      if (error) throw error;
      return data as T;
    },
  });
}

function Overview() {
  const f = useAdminFilters();
  const base = { p_campaign: f.campaign, p_seller: f.seller };
  const k = [f.from, f.to, f.campaign, f.seller];
  const cur = useRpc<Overview>("admin_overview", { p_from: f.from, p_to: f.to, ...base }, k);
  const prev = useRpc<Overview>("admin_overview", { p_from: f.prevFrom, p_to: f.prevTo, ...base }, ["prev", ...k]);
  const ts = useRpc<Series>("admin_timeseries", { p_from: f.from, p_to: f.to, ...base, p_bucket: f.bucket }, [...k, f.bucket]);
  const qs = [cur, prev, ts];
  const updatedAt = Math.max(...qs.map((q) => q.dataUpdatedAt));
  const fetching = qs.some((q) => q.isFetching);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Visão geral" subtitle={`${f.startDate.split("-").reverse().join("/")} – ${f.endDate.split("-").reverse().join("/")}`} />
        <RefreshButton updatedAt={updatedAt} fetching={fetching} onClick={() => qs.forEach((q) => q.refetch())} />
      </div>
      <Alerts />
      <Kpis cur={cur} prev={prev.data} series={ts.data} />
      <FunnelBlock q={cur} />
      <TimeChart q={ts} hourly={f.bucket === "hour"} />
      <div className="grid gap-4 lg:grid-cols-3">
        <PlanMix />
        <Ranking dim="campaign" title="Ranking de campanhas" />
        <Ranking dim="seller" title="Ranking de vendedores" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <States />
        <LatestSales />
      </div>
    </div>
  );
}

export function RefreshButton({ updatedAt, fetching, onClick }: { updatedAt: number; fetching: boolean; onClick: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 15_000); return () => clearInterval(t); }, []);
  const ago = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt) / 60_000)) : null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {ago != null && <span>atualizado {ago === 0 ? "agora" : `há ${ago} min`}</span>}
      <Button variant="outline" className="h-11" onClick={onClick} disabled={fetching}>
        <RefreshCw className={fetching ? "animate-spin" : ""} aria-hidden /> Atualizar
      </Button>
    </div>
  );
}

// ─── shared states ────────────────────────────────────────────────────────
export function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`glass rounded-2xl border p-4 ${className}`}>
      {title && <h2 className="mb-3 font-display text-sm font-semibold text-muted-foreground">{title}</h2>}
      {children}
    </section>
  );
}
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 text-sm">
      <p className="text-destructive">Não foi possível carregar estes dados.</p>
      <Button variant="outline" className="h-11" onClick={onRetry}>Tentar novamente</Button>
    </div>
  );
}
export function Empty({ msg, hint }: { msg: string; hint: string }) {
  return <div className="py-6 text-center text-sm"><p>{msg}</p><p className="text-muted-foreground">{hint}</p></div>;
}

// ─── alerts ───────────────────────────────────────────────────────────────
function Alerts() {
  const integ = useServerFn(getIntegrationStatus);
  const q = useQuery({
    queryKey: ["admin-alerts"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const tenMin = new Date(Date.now() - 10 * 60_000).toISOString();
      const day = new Date(Date.now() - 86_400_000).toISOString();
      const [failed, stuck, hooks, status] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "renewal_failed"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "paid").is("renewed_at", null).lt("paid_at", tenMin),
        supabase.from("webhook_logs").select("id", { count: "exact", head: true }).eq("processed", false).gte("created_at", day),
        integ(),
      ]);
      return { failed: failed.count ?? 0, stuck: stuck.count ?? 0, hooks: hooks.count ?? 0, missing: Object.entries(status).filter(([, v]) => !v).map(([k]) => k) };
    },
  });
  if (!q.data) return null;
  const items: { text: string; to: string; search?: Record<string, string> }[] = [];
  if (q.data.failed) items.push({ text: `${q.data.failed} pedido(s) com falha na renovação`, to: "/admin/pedidos", search: { status: "renewal_failed" } });
  if (q.data.stuck) items.push({ text: `${q.data.stuck} pedido(s) pagos sem renovação há mais de 10 min`, to: "/admin/pedidos" });
  if (q.data.hooks) items.push({ text: `${q.data.hooks} webhook(s) com erro nas últimas 24h`, to: "/admin/logs" });
  if (q.data.missing.length) items.push({ text: `Integrações não configuradas: ${q.data.missing.join(", ")}`, to: "/admin/configuracoes" });
  if (!items.length) return null;
  return (
    <div role="status" className="space-y-2 rounded-2xl border border-warning/40 bg-warning/10 p-3">
      {items.map((i) => (
        <Link key={i.text} to={i.to as "/admin"} search={(s: Record<string, unknown>) => ({ ...s, ...i.search }) as never}
          className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-warning/10 focus-visible:outline-2 focus-visible:outline-ring">
          <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden /> <span>{i.text}</span>
          <span className="ml-auto text-xs text-warning">Ver</span>
        </Link>
      ))}
    </div>
  );
}

// ─── KPIs ─────────────────────────────────────────────────────────────────
function Delta({ cur, prev, invert }: { cur: number | null; prev: number | null; invert?: boolean | undefined }) {
  if (cur == null || prev == null || prev === 0) return <span className="text-xs text-muted-foreground">— vs. anterior</span>;
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(d) < 0.05) return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Minus className="size-3" aria-hidden /> 0,0%</span>;
  const good = invert ? d < 0 : d > 0;
  const Icon = d > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`flex items-center gap-1 text-xs ${good ? "text-success" : "text-destructive"}`}>
      <Icon className="size-3" aria-hidden /> {d > 0 ? "+" : ""}{pct(d)} <span className="sr-only">{good ? "melhorou" : "piorou"}</span>
    </span>
  );
}

function Spark({ data, k }: { data: Series | undefined; k: "clicks" | "pix" | "paid" | "revenue_cents" }) {
  if (!data?.length) return <div className="h-8" />;
  return (
    <div className="h-8" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}><Line type="monotone" dataKey={k} stroke="var(--chart-1)" strokeWidth={1.5} dot={false} isAnimationActive={false} /></LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Kpis({ cur, prev, series }: { cur: ReturnType<typeof useRpc<Overview>>; prev: Overview | undefined; series: Series | undefined }) {
  if (cur.isError) return <Card><ErrorState onRetry={() => cur.refetch()} /></Card>;
  if (!cur.data) return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>;
  const c = cur.data, p = prev;
  const conv = ratio(c.paid_count, c.clicks), pconv = p ? ratio(p.paid_count, p.clicks) : null;
  const cards: { label: string; value: string; sub?: string; cur: number | null; prev: number | null; invert?: boolean; spark?: "clicks" | "pix" | "paid" | "revenue_cents" }[] = [
    { label: "Cliques", value: num(c.clicks), cur: c.clicks, prev: p?.clicks ?? null, spark: "clicks" },
    { label: "Pagamentos iniciados", value: num(c.pix_generated), sub: "PIX gerados", cur: c.pix_generated, prev: p?.pix_generated ?? null, spark: "pix" },
    { label: "Compras", value: num(c.paid_count), cur: c.paid_count, prev: p?.paid_count ?? null, spark: "paid" },
    { label: "Receita", value: brl(c.revenue_cents), cur: c.revenue_cents, prev: p?.revenue_cents ?? null, spark: "revenue_cents" },
    { label: "Ticket médio", value: brl(c.avg_ticket_cents), cur: c.avg_ticket_cents, prev: p?.avg_ticket_cents ?? null },
    { label: "Taxa de conversão", value: pct(conv), sub: "compras / cliques", cur: conv, prev: pconv },
    { label: "Abandonos", value: num(c.abandoned_count), sub: `${brl(c.abandoned_cents)} potencial perdido`, cur: c.abandoned_count, prev: p?.abandoned_count ?? null, invert: true },
    { label: "Renovações com sucesso", value: pct(c.renewal_success_rate), sub: `tempo médio ${dur(c.renewal_avg_seconds)}`, cur: c.renewal_success_rate, prev: p?.renewal_success_rate ?? null },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((x) => (
        <div key={x.label} className="glass flex flex-col gap-1 rounded-2xl border p-4">
          <p className="text-xs text-muted-foreground">{x.label}</p>
          <p className="font-display text-xl font-bold md:text-2xl">{x.value}</p>
          {x.sub && <p className="text-xs text-muted-foreground">{x.sub}</p>}
          <Delta cur={x.cur} prev={x.prev} invert={x.invert} />
          {x.spark && <Spark data={series} k={x.spark} />}
        </div>
      ))}
    </div>
  );
}

// ─── funnel ───────────────────────────────────────────────────────────────
export function FunnelBlock({ q }: { q: ReturnType<typeof useRpc<Overview>> }) {
  return (
    <Card title="Funil de conversão">
      {q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data ? <Skeleton className="h-56" /> : (() => {
        const d = q.data;
        const steps = [
          ["Cliques", d.clicks], ["Abriram a página de pagamento", d.page_sessions], ["Iniciaram checkout", d.checkout_sessions],
          ["PIX gerado", d.pix_generated], ["Pago", d.paid_count], ["Renovado", d.renewed_count],
        ] as const;
        const first = d.clicks;
        const max = Math.max(...steps.map((s) => s[1]), 1);
        return (
          <>
            <ol className="space-y-2">
              {steps.map(([label, n], i) => (
                <li key={label}>
                  <div className="mb-1 flex flex-wrap justify-between gap-x-3 text-sm">
                    <span>{label}</span>
                    <span className="text-muted-foreground">
                      <b className="text-foreground">{num(n)}</b>
                      {i > 0 && <> · {pct(ratio(n, steps[i - 1]?.[1] ?? 0))} do anterior · {pct(ratio(n, first))} do total</>}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${(100 * n) / (first || max)}%`, maxWidth: "100%" }} />
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">Visitas sem campanha (acesso direto ao /pagar) entram nas etapas de página e checkout, por isso podem superar os cliques.</p>
          </>
        );
      })()}
    </Card>
  );
}

// ─── time chart ───────────────────────────────────────────────────────────
function TimeChart({ q, hourly }: { q: ReturnType<typeof useRpc<Series>>; hourly: boolean }) {
  const [mode, setMode] = useState<"revenue" | "paid" | "clicks">("revenue");
  const label = (b: string) => new Date(b).toLocaleString("pt-BR", hourly ? { timeZone: SP_TZ, hour: "2-digit", minute: "2-digit" } : { timeZone: SP_TZ, day: "2-digit", month: "2-digit" });
  const data = (q.data ?? []).map((r) => ({ ...r, label: label(r.bucket), revenue: r.revenue_cents / 100 }));
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold text-muted-foreground">Receita e vendas ao longo do tempo</h2>
        <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as typeof mode)} aria-label="Métrica do gráfico">
          <ToggleGroupItem value="revenue" className="h-11 px-3">Receita</ToggleGroupItem>
          <ToggleGroupItem value="paid" className="h-11 px-3">Compras</ToggleGroupItem>
          <ToggleGroupItem value="clicks" className="h-11 px-3">Cliques</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data ? <Skeleton className="h-64" /> : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} width={48} allowDecimals={mode === "revenue"} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }}
                formatter={(v: number, n: string) => (n === "revenue" ? [brl(Math.round(v * 100)), "Receita"] : [num(v), n === "paid" ? "Compras" : "Cliques"])} />
              {mode === "revenue" && <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.2} />}
              {mode === "revenue" && <Bar dataKey="paid" fill="var(--chart-2)" opacity={0} />}
              {mode === "paid" && <Bar dataKey="paid" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />}
              {mode === "clicks" && <Bar dataKey="clicks" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

// ─── breakdowns ───────────────────────────────────────────────────────────
export function useBreakdown(dim: "plan" | "campaign" | "seller" | "state") {
  const f = useAdminFilters();
  return useRpc<Breakdown>("admin_breakdown", { p_from: f.from, p_to: f.to, p_campaign: f.campaign, p_seller: f.seller, p_dim: dim }, [dim, f.from, f.to, f.campaign, f.seller]);
}

export const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function PlanMix() {
  const q = useBreakdown("plan");
  const rows = (q.data ?? []).filter((r) => r.paid > 0);
  return (
    <Card title="Mix de planos">
      {q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data ? <Skeleton className="h-48" /> : !rows.length ? (
        <Empty msg="Nenhuma venda no período." hint="Amplie o período ou remova filtros." />
      ) : (
        <>
          <div className="h-40" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="revenue_cents" nameKey="label" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="none">
                  {rows.map((r, i) => <Cell key={r.key} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-1 text-sm">
            {rows.map((r, i) => (
              <li key={r.key} className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} aria-hidden />
                <span>{r.label}</span>
                <span className="ml-auto text-muted-foreground">{num(r.paid)} · {brl(r.revenue_cents)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Ranking({ dim, title }: { dim: "campaign" | "seller"; title: string }) {
  const q = useBreakdown(dim);
  const rows = (q.data ?? []).slice(0, 8);
  return (
    <Card title={title}>
      {q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data ? <Skeleton className="h-48" /> : !rows.length ? (
        <Empty msg="Sem dados no período." hint={dim === "campaign" ? "Crie campanhas e divulgue os links /r/slug." : "Vincule vendedores às campanhas."} />
      ) : (
        <ul className="divide-y divide-border text-sm">
          {rows.map((r) => (
            <li key={r.key} className="py-2">
              <div className="flex justify-between gap-2"><span className="truncate font-medium">{r.label}</span><span>{brl(r.revenue_cents)}</span></div>
              <p className="text-xs text-muted-foreground">{num(r.clicks)} cliques · {num(r.paid)} compras · conv. {pct(ratio(r.paid, r.clicks))}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function States() {
  const q = useBreakdown("state");
  const all = (q.data ?? []).filter((r) => r.clicks > 0).sort((a, b) => b.clicks - a.clicks);
  const top = all.slice(0, 8);
  const rest = all.slice(8).reduce((s, r) => s + r.clicks, 0);
  const rows = rest ? [...top, { key: "outros", label: "Outros", clicks: rest }] : top;
  const max = Math.max(...rows.map((r) => r.clicks), 1);
  const allUnknown = all.length > 0 && all.every((r) => r.key === "Desconhecido");
  return (
    <Card title="Localização dos cliques">
      {q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data ? <Skeleton className="h-48" /> : !rows.length ? (
        <Empty msg="Nenhum clique no período." hint="Os cliques vêm dos links de campanha /r/slug." />
      ) : (
        <>
          {allUnknown && <p className="mb-2 text-xs text-warning">UF depende do cabeçalho de região da hospedagem; pode não estar disponível.</p>}
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.key} className="text-sm">
                <div className="mb-1 flex justify-between"><span>{r.label}</span><span className="text-muted-foreground">{num(r.clicks)}</span></div>
                <div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-chart-2" style={{ width: `${(100 * r.clicks) / max}%` }} /></div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function LatestSales() {
  const f = useAdminFilters();
  const q = useQuery({
    queryKey: ["latest-sales", f.from, f.to, f.campaign, f.seller],
    refetchInterval: 60_000,
    queryFn: async () => {
      let r = supabase.from("orders").select("id, paid_at, customer_name, panel_username, amount_cents, status, plans(name), campaigns(name)")
        .not("paid_at", "is", null).gte("paid_at", f.from).lte("paid_at", f.to).order("paid_at", { ascending: false }).limit(10);
      if (f.campaign) r = r.eq("campaign_id", f.campaign);
      if (f.seller) r = r.eq("seller_id", f.seller);
      const { data, error } = await r;
      if (error) throw error;
      return data;
    },
  });
  return (
    <Card title="Últimas vendas">
      {q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data ? <Skeleton className="h-48" /> : !q.data.length ? (
        <Empty msg="Nenhuma venda no período." hint="As vendas aparecem aqui assim que o PIX é pago." />
      ) : (
        <ul className="divide-y divide-border">
          {q.data.map((o) => (
            <li key={o.id}>
              <Link to="/admin/pedidos" search={(s: Record<string, unknown>) => ({ ...s, order: o.id }) as never}
                className="flex min-h-11 flex-col gap-0.5 rounded-lg px-1 py-2 text-sm hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{o.customer_name} <span className="text-muted-foreground">· {o.panel_username}</span></span>
                  <Badge variant={o.status === "renewed" ? "default" : o.status === "renewal_failed" ? "destructive" : "secondary"}>{STATUS[o.status]}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {dtSP(o.paid_at!)} · {o.plans?.name} · {brl(o.amount_cents)}{o.campaigns?.name ? ` · ${o.campaigns.name}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
