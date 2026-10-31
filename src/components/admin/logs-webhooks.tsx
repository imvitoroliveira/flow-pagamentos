import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tone } from "@/components/admin/confirm";
import { ListSkeleton, Pager, PAGE_SIZE } from "@/components/admin/list-controls";
import { dtSP, Empty, ErrorState } from "@/routes/_authenticated/admin.index";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function WebhookLogs() {
  const [filter, setFilter] = useState<"all" | "errors">("all");
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["logs-webhooks", filter, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      let r = supabase
        .from("webhook_logs")
        .select("id, provider, event, payload, processed, error, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (filter === "errors") r = r.eq("processed", false);
      const { data, error, count } = await r;
      if (error) throw error;
      return { rows: data, total: count ?? 0 };
    },
  });

  return (
    <div className="space-y-3">
      <ToggleGroup
        type="single"
        value={filter}
        onValueChange={(v) => {
          if (!v) return;
          setFilter(v as "all" | "errors");
          setPage(0);
        }}
        aria-label="Filtrar webhooks"
      >
        <ToggleGroupItem value="all" className="h-11 px-3">Todos</ToggleGroupItem>
        <ToggleGroupItem value="errors" className="h-11 px-3">Com erro</ToggleGroupItem>
      </ToggleGroup>

      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <ListSkeleton />
      ) : !q.data.rows.length ? (
        <div className="glass rounded-2xl border">
          <Empty msg="Nenhum webhook recebido." hint="Os pagamentos confirmados pela AbacatePay aparecem aqui." />
        </div>
      ) : (
        <ul className="space-y-2">
          {q.data.rows.map((r) => (
            <li key={r.id}>
              <details className="glass rounded-2xl border p-4">
                <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 break-words">
                    {r.provider} · {r.event ?? "sem evento"} · {dtSP(r.created_at)}
                  </span>
                  {r.processed ? <Tone tone="ok">Processado</Tone> : <Tone tone="bad">Erro</Tone>}
                </summary>
                {r.error && <p className="mt-2 break-words text-xs text-destructive">{r.error}</p>}
                <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                  {JSON.stringify(r.payload, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      )}

      <Pager page={page} total={q.data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
