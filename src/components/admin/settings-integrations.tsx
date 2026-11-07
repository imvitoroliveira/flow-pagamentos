import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Tone } from "@/components/admin/confirm";
import { ListSkeleton } from "@/components/admin/list-controls";
import { MetaSettings } from "@/components/admin/settings-meta";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/routes/_authenticated/admin.index";
import { getIntegrationDetails, testAdminTelegram, testPanelConnection } from "@/lib/admin-actions.functions";

type Item = { key: string; label: string; ok: boolean; optional?: boolean };

export function useIntegrations() {
  const fetchDetails = useServerFn(getIntegrationDetails);
  return useQuery({
    queryKey: ["settings-integrations"],
    queryFn: async () => fetchDetails(),
  });
}

export function IntegrationsSettings() {
  const q = useIntegrations();
  const testTelegram = useServerFn(testAdminTelegram);
  const testPanel = useServerFn(testPanelConnection);
  const [busy, setBusy] = useState<"telegram" | "panel" | null>(null);

  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <ListSkeleton />;

  const run = async (kind: "telegram" | "panel") => {
    setBusy(kind);
    try {
      const r = kind === "telegram" ? await testTelegram() : await testPanel();
      if (r.ok) toast.success("Conexão funcionando");
      else toast.error(r.error);
    } catch {
      toast.error("Não foi possível executar o teste");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <MetaSettings />
      <ul className="space-y-2">
        {q.data.items.map((i: Item) => (
          <li key={i.key} className="glass flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-4 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{i.label}{i.optional ? " (opcional)" : ""}</p>
              <p className="text-xs text-muted-foreground">Configurado no servidor</p>
            </div>
            {i.ok ? <Tone tone="ok">Configurado</Tone> : <Tone tone={i.optional ? "muted" : "warn"}>Não configurado</Tone>}
          </li>
        ))}
      </ul>
      <div className="glass flex flex-wrap gap-2 rounded-2xl border p-4">
        <Button variant="outline" className="h-11" disabled={busy !== null} onClick={() => run("telegram")}>
          {busy === "telegram" ? "Enviando..." : "Testar Telegram"}
        </Button>
        <Button variant="outline" className="h-11" disabled={busy !== null} onClick={() => run("panel")}>
          {busy === "panel" ? "Testando..." : "Testar painel de renovação"}
        </Button>
      </div>
    </div>
  );
}
