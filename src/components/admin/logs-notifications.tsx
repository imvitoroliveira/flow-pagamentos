import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tone } from "@/components/admin/confirm";
import { ListSkeleton, Pager, PAGE_SIZE } from "@/components/admin/list-controls";
import { dtSP, Empty, ErrorState } from "@/routes/_authenticated/admin.index";

const CHANNEL: Record<string, string> = {
  telegram_admin: "Telegram (admin)",
  telegram_seller: "Telegram (vendedor)",
};
const STATUS: Record<string, string> = { sent: "Enviado", failed: "Falhou" };

export function NotificationLogs() {
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["logs-notifications", page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const { data, error, count } = await supabase
        .from("notifications_log")
        .select("id, channel, status, created_at, orders(panel_username)", { count: "exact" })
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
          <Empty msg="Nenhuma notificação enviada." hint="Avisos de venda e de falha de renovação aparecem aqui." />
        </div>
      ) : (
        <ul className="space-y-2">
          {q.data.rows.map((n) => (
            <li key={n.id} className="glass flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-4 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{CHANNEL[n.channel] ?? n.channel}</p>
                <p className="text-xs text-muted-foreground">
                  {dtSP(n.created_at)}
                  {n.orders?.panel_username ? ` · usuário ${n.orders.panel_username}` : ""}
                </p>
              </div>
              {n.status === "sent" ? (
                <Tone tone="ok">{STATUS[n.status]}</Tone>
              ) : n.status === "failed" ? (
                <Tone tone="bad">{STATUS[n.status]}</Tone>
              ) : (
                <Tone tone="muted">{n.status}</Tone>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} total={q.data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
