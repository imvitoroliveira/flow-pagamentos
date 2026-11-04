import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getPanelCredits, scheduleAction } from "@/lib/admin-actions.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Confirm, Tone } from "@/components/admin/confirm";
import { ListSkeleton } from "@/components/admin/list-controls";

const T = "Futuros — Admin NATV";
const D = "Renovações mensais agendadas e créditos comprometidos no painel NATV.";
export const Route = createFileRoute("/_authenticated/admin/futuros")({
  head: () => ({ meta: [{ title: T }, { name: "description", content: D }, { property: "og:title", content: T }, { property: "og:description", content: D }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: FuturesPage,
});

const fmt = (iso: string | null) => iso
  ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
  : "—";
const STATUS: Record<string, { tone: "ok" | "warn" | "bad" | "muted" | "info"; label: string }> = {
  active: { tone: "info", label: "Agendado" }, running: { tone: "info", label: "Processando" }, paused: { tone: "warn", label: "Pausado" },
  done: { tone: "ok", label: "Concluído" }, cancelled: { tone: "muted", label: "Cancelado" },
};
type Act = "run" | "pause" | "resume" | "cancel";

function FuturesPage() {
  const qc = useQueryClient();
  const credits = useServerFn(getPanelCredits);
  const act = useServerFn(scheduleAction);
  const creditsQ = useQuery({ queryKey: ["panel_credits"], queryFn: () => credits(), staleTime: 60_000 });
  const q = useQuery({
    queryKey: ["credit_schedules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_schedules").select("*").order("next_run_at", { ascending: true, nullsFirst: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });
  const rows = q.data ?? [];
  const open = rows.filter((r) => ["active", "running", "paused"].includes(r.status));
  const committed = open.reduce((s, r) => s + (r.total_months - r.months_applied), 0);
  const in30 = open.filter((r) => r.status !== "paused" && r.next_run_at && new Date(r.next_run_at).getTime() - Date.now() <= 30 * 86_400_000).length;
  const free = creditsQ.data?.credits ?? null;

  async function run(id: string, action: Act) {
    const r = await act({ data: { id, action } });
    if (r.ok) toast.success(action === "run" ? "1 mês renovado agora" : "Agendamento atualizado");
    else toast.error(r.error);
    qc.invalidateQueries({ queryKey: ["credit_schedules"] });
    qc.invalidateQueries({ queryKey: ["panel_credits"] });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Futuros</h1>
        <p className="text-sm text-muted-foreground">Planos de 3 e 6 meses renovam 1 mês por vez, 2 dias antes de cada vencimento. Os créditos restantes ficam livres no seu painel até lá.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Créditos livres no painel" value={creditsQ.isLoading ? null : free === null ? "—" : String(free)} hint={free === null && !creditsQ.isLoading ? "Não foi possível consultar" : undefined} />
        <Kpi label="Créditos comprometidos" value={q.isLoading ? null : String(committed)} hint={`${open.length} agendamento(s) em aberto`} />
        <Kpi label="Consumo previsto (30 dias)" value={q.isLoading ? null : String(in30)} hint={free !== null && in30 > free ? "Atenção: créditos insuficientes" : undefined} warn={free !== null && in30 > free} />
      </div>

      {q.isLoading ? <ListSkeleton /> : q.isError ? (
        <Card className="p-6 text-center"><p>Não foi possível carregar os agendamentos.</p><Button className="mt-3 h-11" onClick={() => q.refetch()}>Tentar novamente</Button></Card>
      ) : !rows.length ? (
        <Card className="p-6 text-center"><p className="font-medium">Nenhum agendamento ainda.</p><p className="text-sm text-muted-foreground">Ao vender um plano trimestral ou semestral, os meses restantes aparecem aqui.</p></Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const st = STATUS[r.status] ?? { tone: "muted" as const, label: r.status };
            const openRow = ["active", "paused"].includes(r.status);
            return (
              <Card key={r.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{r.panel_username}</div>
                  <div className="flex gap-1"><Tone tone={st.tone}>{st.label}</Tone>{r.last_error && openRow && <Tone tone="bad">Falhou</Tone>}</div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm"><span>Mês {r.months_applied} de {r.total_months}</span><span className="text-muted-foreground">Restam {r.total_months - r.months_applied}</span></div>
                  <Progress value={(r.months_applied / r.total_months) * 100} aria-label={`Mês ${r.months_applied} de ${r.total_months}`} />
                </div>
                <div className="grid gap-1 text-sm sm:grid-cols-2">
                  <div><span className="text-muted-foreground">Vencimento atual: </span>{fmt(r.last_exp_date)}</div>
                  <div><span className="text-muted-foreground">Próxima renovação: </span>{r.status === "paused" ? "Pausado" : fmt(r.next_run_at)}</div>
                </div>
                {r.last_error && openRow && <p className="text-sm text-destructive">Último erro: {r.last_error}</p>}
                {openRow && (
                  <div className="flex flex-wrap gap-2">
                    <Confirm trigger={<Button className="h-11">Adiantar 1 mês agora</Button>} title="Renovar 1 mês agora?" description={`Isso consome 1 crédito do painel e adiciona 1 mês ao usuário ${r.panel_username}.`} confirmLabel="Renovar agora" onConfirm={() => run(r.id, "run")} />
                    {r.status === "active"
                      ? <Button variant="outline" className="h-11" onClick={() => run(r.id, "pause")}>Pausar</Button>
                      : <Button variant="outline" className="h-11" onClick={() => run(r.id, "resume")}>Retomar</Button>}
                    <Confirm trigger={<Button variant="outline" className="h-11 text-destructive">Cancelar</Button>} title="Cancelar agendamento?" description={`Os ${r.total_months - r.months_applied} mês(es) restantes de ${r.panel_username} não serão mais renovados automaticamente.`} confirmLabel="Cancelar agendamento" onConfirm={() => run(r.id, "cancel")} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, warn }: { label: string; value: string | null; hint?: string | undefined; warn?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      {value === null ? <Skeleton className="mt-2 h-8 w-16" /> : <div className="mt-1 font-display text-3xl font-semibold">{value}</div>}
      {hint && <div className={`text-xs ${warn ? "text-warning" : "text-muted-foreground"}`}>{hint}</div>}
    </Card>
  );
}
