import { useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  aggregateDays, buildMonthGrid, dayTone, MONTHS_PT, maskReais, monthBounds, monthKey, monthTotals, parseReaisToCents, centsToInput,
  shiftMonth, signedBrl, WEEKDAYS, spDayKey, type DayStat, type DayTone,
} from "@/lib/return-calendar";
import { brl, Card, ErrorState } from "@/routes/_authenticated/admin.index";

type SaleRow = { id: string; paid_at: string | null; amount_cents: number; customer_name: string; campaign_id: string | null };
type SpendRow = { id: string; date: string; campaign_id: string | null; spend_cents: number };

// daily_ad_spend is newer than the generated Supabase types
type Res = { data: unknown; error: Error | null };
type Q = PromiseLike<Res> & Record<"select" | "gte" | "lt" | "in" | "eq" | "is" | "order" | "range" | "insert" | "update" | "delete" | "maybeSingle", (...a: unknown[]) => Q>;
const spendTable = () => (supabase as unknown as { from: (t: string) => Q }).from("daily_ad_spend");

const PAGE = 1000;
const MAX_ROWS = 20_000;
const EMPTY: DayStat = { sales: 0, revenue_cents: 0, spend_cents: 0, pnl_cents: 0 };

const TONE_CLASS: Record<DayTone, string> = {
  profit: "text-emerald-400 bg-emerald-950/20 border-emerald-500/30",
  loss: "text-rose-400 bg-rose-950/20 border-rose-500/30",
  neutral: "text-muted-foreground bg-muted/10 border-border/40",
};

const longDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return `${d} de ${MONTHS_PT[m - 1]} de ${y}`;
};
const roasText = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`);

function useMonthData(year: number, month0: number, campaign: string | null, seller: string | null) {
  return useQuery({
    queryKey: ["return-calendar", monthKey(year, month0), campaign, seller],
    staleTime: 30_000, placeholderData: keepPreviousData,
    queryFn: async () => {
      let ids: string[] | null = campaign ? [campaign] : null;
      if (seller) {
        const { data, error } = await supabase.from("campaigns").select("id").eq("seller_id", seller);
        if (error) throw error;
        const mine = (data ?? []).map((c) => c.id);
        ids = ids ? ids.filter((id) => mine.includes(id)) : mine;
      }
      if (ids && !ids.length) return { sales: [] as SaleRow[], spend: [] as SpendRow[], truncated: false };
      const b = monthBounds(year, month0);

      const sales: SaleRow[] = [];
      let truncated = false;
      for (let from = 0; ; from += PAGE) {
        if (from >= MAX_ROWS) { truncated = true; break; }
        let q = supabase.from("orders").select("id, paid_at, amount_cents, customer_name, campaign_id")
          .in("status", ["paid", "renewed"]).gte("paid_at", b.from).lt("paid_at", b.to).order("paid_at", { ascending: true });
        if (ids) q = q.in("campaign_id", ids);
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) throw error;
        sales.push(...(data ?? []));
        if ((data?.length ?? 0) < PAGE) break;
      }

      let sq = spendTable().select("id, date, campaign_id, spend_cents").gte("date", b.fromDate).lt("date", b.toDate);
      if (ids) sq = sq.in("campaign_id", ids);
      const { data: spend, error } = await sq;
      if (error) throw error;
      return { sales, spend: (spend ?? []) as SpendRow[], truncated };
    },
  });
}

export function ReturnCalendar({ campaign, seller }: { campaign: string | null; seller: string | null }) {
  const today = spDayKey(new Date().toISOString());
  const [ym, setYm] = useState(() => ({ year: Number(today.slice(0, 4)), month0: Number(today.slice(5, 7)) - 1 }));
  const [open, setOpen] = useState<string | null>(null);
  const q = useMonthData(ym.year, ym.month0, campaign, seller);
  const d = q.data;

  const grid = useMemo(() => buildMonthGrid(ym.year, ym.month0), [ym]);
  const days = useMemo(() => aggregateDays(d?.sales ?? [], d?.spend ?? []), [d]);
  const totals = useMemo(() => monthTotals(days.values()), [days]);

  const monthOptions = useMemo(() => {
    const base = { year: Number(today.slice(0, 4)), month0: Number(today.slice(5, 7)) - 1 };
    const opts = Array.from({ length: 24 }, (_, i) => shiftMonth(base.year, base.month0, -i));
    if (!opts.some((o) => o.year === ym.year && o.month0 === ym.month0)) opts.push(ym);
    return opts.sort((a, b) => b.year * 12 + b.month0 - (a.year * 12 + a.month0));
  }, [today, ym]);

  const go = (delta: number) => setYm((c) => shiftMonth(c.year, c.month0, delta));
  const loading = q.isLoading;
  const pnlClass = totals.pnl_cents > 0 ? "text-emerald-400" : totals.pnl_cents < 0 ? "text-rose-400" : "";

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold">Calendário de Performance Financeira (Lucro Real)</h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-11" aria-label="Mês anterior" onClick={() => go(-1)}><ChevronLeft aria-hidden /></Button>
          <Select value={monthKey(ym.year, ym.month0)} onValueChange={(v) => setYm({ year: Number(v.slice(0, 4)), month0: Number(v.slice(5, 7)) - 1 })}>
            <SelectTrigger className="h-11 w-44" aria-label="Mês e ano"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map((o) => <SelectItem key={monthKey(o.year, o.month0)} value={monthKey(o.year, o.month0)}>{MONTHS_PT[o.month0]} {o.year}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="size-11" aria-label="Próximo mês" onClick={() => go(1)}><ChevronRight aria-hidden /></Button>
        </div>
      </div>

      {q.isError && !d ? <div className="mt-4"><ErrorState onRetry={() => q.refetch()} /></div> : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Total label="Faturamento Bruto" loading={loading} value={brl(totals.revenue_cents)} hint={`${totals.sales} ${totals.sales === 1 ? "venda" : "vendas"}`} />
            <Total label="Gasto em Anúncios" loading={loading} value={brl(totals.spend_cents)} hint="Soma dos lançamentos do mês" />
            <Total label="Resultado Líquido (PnL)" loading={loading} value={signedBrl(totals.pnl_cents)} className={`${pnlClass} ${totals.pnl_cents > 0 ? "drop-shadow-[0_0_8px_rgba(52,211,153,0.45)]" : ""}`} hint="Faturamento − gastos" />
            <Total label="ROI / ROAS do Mês" loading={loading} value={roasText(totals.roas)} hint={totals.roas == null ? "Sem gasto lançado" : "Faturamento ÷ gastos"} />
          </div>

          {d?.truncated && <p className="mt-3 rounded-md border border-amber-500/50 px-3 py-2 text-xs text-amber-500" role="status">Mês com muitas vendas: exibindo as {MAX_ROWS.toLocaleString("pt-BR")} primeiras.</p>}

          <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label={`Calendário de ${MONTHS_PT[ym.month0]} ${ym.year}`}>
            {WEEKDAYS.map((w) => <div key={w} className="pb-1 text-center text-[11px] font-medium text-muted-foreground sm:text-xs" role="columnheader">{w}</div>)}
            {loading
              ? Array.from({ length: 35 }, (_, i) => <Skeleton key={i} className="h-16 sm:h-20" />)
              : grid.map((c) => {
                const s = c.inMonth ? days.get(c.key) ?? EMPTY : EMPTY;
                const tone = dayTone(s.pnl_cents);
                const cls = `relative flex h-16 min-w-0 flex-col items-stretch justify-between rounded-md border p-1 text-left sm:h-20 sm:p-1.5 ${TONE_CLASS[tone]}`;
                if (!c.inMonth) return <div key={c.key} className={`${cls} opacity-25`} role="gridcell" aria-hidden><span className="text-[11px] sm:text-xs">{c.day}</span></div>;
                return (
                  <button key={c.key} type="button" role="gridcell" onClick={() => setOpen(c.key)}
                    aria-label={`${longDate(c.key)}: resultado ${signedBrl(s.pnl_cents)}, ${s.sales} vendas`}
                    className={`${cls} transition-colors hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${c.key === today ? "ring-1 ring-primary" : ""}`}>
                    <span className="text-[11px] font-medium text-foreground/80 sm:text-xs">{c.day}</span>
                    <span className="truncate text-center text-[10px] font-semibold leading-tight sm:text-sm">{signedBrl(s.pnl_cents).replace("R$ ", "")}</span>
                    <span className="truncate text-center text-[9px] leading-tight text-muted-foreground sm:text-[11px]">
                      {s.sales ? `${s.sales} ${s.sales === 1 ? "venda" : "vendas"}` : " "}{s.spend_cents ? <span className="hidden sm:inline"> · Ads: {brl(s.spend_cents).replace(",00", "")}</span> : null}
                    </span>
                  </button>
                );
              })}
          </div>
        </>
      )}

      {open && <DayDialog dayKey={open} sales={(d?.sales ?? []).filter((s) => s.paid_at && spDayKey(s.paid_at) === open)}
        spend={(d?.spend ?? []).filter((s) => s.date === open)} campaign={campaign} seller={seller} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function Total({ label, value, hint, loading, className = "" }: { label: string; value: string; hint: string; loading: boolean; className?: string }) {
  return (
    <div className="rounded-xl border bg-muted/10 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? <Skeleton className="mt-1 h-8" /> : <p className={`font-display text-xl font-bold sm:text-2xl ${className}`}>{value}</p>}
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function DayDialog({ dayKey, sales, spend, campaign, seller, onClose }: {
  dayKey: string; sales: SaleRow[]; spend: SpendRow[]; campaign: string | null; seller: string | null; onClose: () => void;
}) {
  const qc = useQueryClient();
  // The editable entry is the one for the selected campaign (or the "geral" one); other campaigns' spend is read-only.
  const mine = spend.find((s) => (s.campaign_id ?? null) === campaign);
  const others = spend.reduce((a, s) => a + (s === mine ? 0 : s.spend_cents), 0);
  const canEdit = !(seller && !campaign);
  const [text, setText] = useState(mine ? centsToInput(mine.spend_cents) : "");
  const [saving, setSaving] = useState(false);
  const revenue = sales.reduce((a, s) => a + s.amount_cents, 0);
  const typed = parseReaisToCents(text) ?? 0;
  const pnl = revenue - others - typed;
  const tone = dayTone(pnl);

  async function save() {
    const cents = parseReaisToCents(text) ?? 0;
    if (cents > 2_000_000_000) { toast.error("Valor alto demais."); return; }
    setSaving(true);
    try {
      let find = spendTable().select("id").eq("date", dayKey);
      find = campaign ? find.eq("campaign_id", campaign) : find.is("campaign_id", null);
      const { data: ex, error: e1 } = await find.maybeSingle();
      if (e1) throw e1;
      const id = (ex as { id: string } | null)?.id;
      const now = new Date().toISOString();
      const res = id
        ? cents > 0 ? await spendTable().update({ spend_cents: cents, updated_at: now }).eq("id", id) : await spendTable().delete().eq("id", id)
        : cents > 0 ? await spendTable().insert({ date: dayKey, campaign_id: campaign, spend_cents: cents }) : { error: null };
      if (res.error) throw res.error;
      toast.success("Investimento salvo.");
      await qc.invalidateQueries({ queryKey: ["return-calendar"] });
      onClose();
    } catch {
      toast.error("Não foi possível salvar. A migração 0012 (daily_ad_spend) está aplicada?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{longDate(dayKey)}</DialogTitle>
          <DialogDescription>Vendas do dia e investimento em anúncios{campaign ? " da campanha filtrada" : ""}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-baseline justify-between"><span className="text-muted-foreground">Faturado ({sales.length} {sales.length === 1 ? "venda" : "vendas"})</span><span className="font-semibold">{brl(revenue)}</span></div>
          {sales.length > 0 && (
            <ul className="max-h-40 divide-y overflow-y-auto rounded-md border text-xs">
              {sales.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="min-w-0 truncate">{s.paid_at ? new Date(s.paid_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "—"} · {s.customer_name}</span>
                  <span className="shrink-0 font-medium">{brl(s.amount_cents)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ad-spend">Investimento em Anúncios (R$)</Label>
            <Input id="ad-spend" inputMode="numeric" placeholder="0,00" className="h-11" value={text} disabled={!canEdit || saving}
              onChange={(e) => setText(maskReais(e.target.value))} />
            {!canEdit && <p className="text-xs text-muted-foreground">Selecione uma campanha (ou remova o filtro de vendedor) para lançar gastos.</p>}
            {others > 0 && <p className="text-xs text-muted-foreground">Outras campanhas neste dia: {brl(others)} (somado no cálculo).</p>}
          </div>

          <div className={`flex items-baseline justify-between rounded-md border px-3 py-2 ${TONE_CLASS[tone]}`}>
            <span>{pnl < 0 ? "Prejuízo estimado" : "Lucro estimado"}</span>
            <span className="text-base font-bold">{signedBrl(pnl)}</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={saving}>Fechar</Button>
          <Button className="h-11" onClick={save} disabled={!canEdit || saving}>{saving && <Loader2 className="animate-spin" aria-hidden />} Salvar Investimento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
