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
};

export function AuditLog() {
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["logs-audit", page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const { data, error, count } = await supabase
        .from("admin_audit_log")
        .select("id, admin_email, action, entity, entity_id, details, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data, total: count ?? 0 };
    },
  });

  return (
    <div className="space-y-3">
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
