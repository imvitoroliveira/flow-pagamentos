import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ListSkeleton, Pager, PAGE_SIZE } from "@/components/admin/list-controls";
import { dtSP, Empty, ErrorState } from "@/routes/_authenticated/admin.index";

const ACTION_LABEL: Record<string, string> = {
  "campaign.create": "Campanha criada",
  "campaign.update": "Campanha editada",
  "campaign.activate": "Campanha reativada",
  "campaign.archive": "Campanha arquivada",
  "campaign.delete": "Campanha excluída",
  "seller.create": "Vendedor criado",
  "seller.update": "Vendedor editado",
  "seller.delete": "Vendedor excluído",
  "seller.telegram_test": "Teste de Telegram (vendedor)",
  "plan.update": "Plano editado",
  "settings.telegram_test": "Teste de Telegram (admin)",
  "settings.panel_test": "Teste do painel de renovação",
  "admin.invite": "Administrador convidado",
  "admin.revoke": "Acesso de administrador removido",
  retry_renewal: "Renovação reenviada",
  manual_schedule_created: "Venda Manual / Espécie registrada",
  "credit_schedule.run": "Renovação Futura adiantada manualmente",
  "credit_schedule.run_now": "Renovação Futura adiantada manualmente",
  "credit_schedule.pause": "Renovação Futura pausada",
  "credit_schedule.resume": "Renovação Futura retomada",
  "credit_schedule.cancel": "Renovação Futura cancelada",
  "credit_schedule.auto_applied": "Renovação Futura aplicada pelo Robô",
  "drip.executed": "Ciclo diário do Robô de Renovações",
  "client.sync": "Sincronização com Painel NATV",
  "settings.integration_set": "Integração configurada",
  "settings.integration_clear": "Integração removida",
  "settings.meta_test": "Teste de CAPI / Pixel Meta",
  "seller.access": "Credenciais de vendedor geradas",
};

const FILTERS = [
  { v: "all", l: "Todas as ações", or: null },
  { v: "manual_sales", l: "Vendas Manuais & Futuros", or: "action.eq.manual_schedule_created,action.eq.drip.executed,action.like.credit_schedule.*" },
  { v: "team", l: "Equipe & Campanhas", or: "action.like.campaign.*,action.like.seller.*,action.like.admin.*" },
  { v: "settings", l: "Integrações & Sistema", or: "action.like.settings.*,action.eq.client.sync,action.eq.retry_renewal" },
] as const;

type Details = {
  total_months?: number | string;
  username?: string;
  amount_reais?: number | string;
  activated_now?: boolean;
  month_applied?: number | string;
  remaining?: number | string;
  failed?: number | string;
  applied?: number | string;
  [key: string]: unknown;
};

const brl = (v: unknown) => typeof v === "number" ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v ?? "—");

/** Executive one-liner for the actions that matter to the business; null = nothing to add. */
function Summary({ action, d }: { action: string; d: Details }) {
  const chip = "rounded-full border px-2 py-0.5 text-xs";
  if (action === "manual_schedule_created") {
    const n = Number(d.total_months);
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={chip}>Usuário: {String(d.username ?? "—")}</span>
        <span className={chip}>{n} {n === 1 ? "mês" : "meses"}</span>
        <span className={chip}>R$ {brl(d.amount_reais)}</span>
        <span className={chip}>{d.activated_now ? "1º mês ativado agora" : "Agendado para o vencimento"}</span>
      </div>
    );
  }
  if (action === "credit_schedule.auto_applied") {
    return <p className="mt-2 text-xs">Usuário: {String(d.username ?? "—")} · Mês {String(d.month_applied)} de {String(d.total_months)} aplicado · Restam {String(d.remaining)} {Number(d.remaining) === 1 ? "mês" : "meses"}</p>;
  }
  if (action === "drip.executed") {
    const failed = Number(d.failed) > 0;
    return (
      <p className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-xs ${failed ? "border-amber-500/50 text-amber-500" : "border-emerald-500/50 text-emerald-500"}`}>
        {String(d.applied ?? 0)} renovações aplicadas com sucesso · {String(d.failed ?? 0)} falhas
      </p>
    );
  }
  return null;
}

export function AuditLog() {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["v"]>("all");
  const q = useQuery({
    queryKey: ["logs-audit", page, filter],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const or = FILTERS.find((f) => f.v === filter)?.or;
      let query = supabase
        .from("admin_audit_log")
        .select("id, admin_email, action, entity, entity_id, details, created_at", { count: "exact" })
        .order("created_at", { ascending: false });
      if (or) query = query.or(or);
      const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data, total: count ?? 0 };
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro de categoria">
        {FILTERS.map((f) => (
          <button key={f.v} type="button" aria-pressed={filter === f.v} onClick={() => { setFilter(f.v); setPage(0); }}
            className={`min-h-11 rounded-full border px-4 text-sm ${filter === f.v ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground"}`}>{f.l}</button>
        ))}
      </div>
      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <ListSkeleton />
      ) : !q.data.rows.length ? (
        <div className="glass rounded-2xl border">
          <Empty msg="Nenhuma ação registrada." hint="Alterações feitas no painel aparecem aqui." />
        </div>
      ) : (
        <ul className="space-y-2">
          {q.data.rows.map((a) => {
            const hasDetails = !!a.details && typeof a.details === "object" && Object.keys(a.details).length > 0;
            return (
              <li key={a.id} className="glass rounded-2xl border p-4 text-sm">
                <p className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</p>
                <p className="text-xs text-muted-foreground">
                  {dtSP(a.created_at)} · {a.admin_email ?? "Sistema"}
                  {a.entity ? ` · ${a.entity}` : ""}
                  {a.entity_id ? ` ${a.entity_id.slice(0, 8)}` : ""}
                </p>
                {hasDetails && <Summary action={a.action} d={a.details as Details} />}
                {hasDetails && (
                  <details className="mt-2">
                    <summary className="min-h-11 cursor-pointer py-2 text-xs text-muted-foreground">Ver detalhes</summary>
                    <pre className="max-h-60 overflow-auto rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                      {JSON.stringify(a.details, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={page} total={q.data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
