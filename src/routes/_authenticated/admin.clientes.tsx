import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { syncClients } from "@/lib/admin-actions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tone } from "@/components/admin/confirm";
import { ListSkeleton } from "@/components/admin/list-controls";

const meta = (t: string, d: string) => [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }];

export const Route = createFileRoute("/_authenticated/admin/clientes")({
  head: () => ({ meta: meta("Clientes — Admin NATV", "Usuários, senhas e vencimentos dos clientes no painel NATV.") }),
  component: ClientsPage,
});

const fmtDate = (iso: string | null) => iso
  ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
  : "—";

type Filter = "todos" | "ativos" | "vencendo" | "vencidos";
const FILTERS: { v: Filter; l: string }[] = [{ v: "todos", l: "Todos" }, { v: "ativos", l: "Ativos" }, { v: "vencendo", l: "Vencem em 7 dias" }, { v: "vencidos", l: "Vencidos" }];

function expiryTone(iso: string | null) {
  if (!iso) return { tone: "muted" as const, label: "Sem data" };
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return { tone: "bad" as const, label: "Vencido" };
  if (days <= 7) return { tone: "warn" as const, label: `Vence em ${Math.ceil(days)} dia${Math.ceil(days) === 1 ? "" : "s"}` };
  return { tone: "ok" as const, label: `${Math.floor(days)} dias` };
}

function ClientsPage() {
  const qc = useQueryClient();
  const sync = useServerFn(syncClients);
  const [syncing, setSyncing] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const query = useQuery({
    queryKey: ["panel_clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("panel_clients").select("*").order("expires_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  async function doSync() {
    setSyncing(true);
    try {
      const r = await sync();
      if (r.ok) { toast.success(`${r.count} clientes sincronizados`); qc.invalidateQueries({ queryKey: ["panel_clients"] }); }
      else toast.error(r.error);
    } finally { setSyncing(false); }
  }

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const now = Date.now();
    return (query.data ?? []).filter((c) => {
      if (s && !`${c.username} ${c.phone ?? ""} ${c.notes ?? ""}`.toLowerCase().includes(s)) return false;
      const exp = c.expires_at ? new Date(c.expires_at).getTime() : null;
      if (filter === "ativos") return exp !== null && exp > now;
      if (filter === "vencendo") return exp !== null && exp > now && exp - now <= 7 * 86_400_000;
      if (filter === "vencidos") return exp !== null && exp <= now;
      return true;
    });
  }, [query.data, q, filter]);

  const lastSync = query.data?.reduce<string | null>((m, c) => (!m || c.synced_at > m ? c.synced_at : m), null) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Última sincronização com o painel: {fmtDate(lastSync)}</p>
        </div>
        <Button className="h-11" onClick={doSync} disabled={syncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />Sincronizar com painel NATV
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="q">Buscar</Label>
          <Input id="q" className="h-11" placeholder="Usuário, telefone ou observação" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro de vencimento">
          {FILTERS.map((f) => (
            <Button key={f.v} variant={filter === f.v ? "default" : "outline"} className="h-11" onClick={() => setFilter(f.v)} aria-pressed={filter === f.v}>{f.l}</Button>
          ))}
        </div>
      </div>

      {query.isLoading ? <ListSkeleton /> : query.isError ? (
        <Card className="p-6 text-center"><p>Não foi possível carregar os clientes.</p><Button className="mt-3 h-11" onClick={() => query.refetch()}>Tentar novamente</Button></Card>
      ) : !query.data?.length ? (
        <Card className="p-6 text-center"><p className="font-medium">Nenhum cliente sincronizado ainda.</p><p className="text-sm text-muted-foreground">Clique em “Sincronizar com painel NATV” para importar sua base.</p></Card>
      ) : !rows.length ? (
        <Card className="p-6 text-center text-muted-foreground">Nenhum cliente para esse filtro.</Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{rows.length} cliente(s)</p>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr><th className="p-3">Usuário</th><th className="p-3">Senha</th><th className="p-3">Vencimento</th><th className="p-3">Status</th><th className="p-3">Telas</th><th className="p-3">Telefone</th><th className="p-3">Último acesso</th></tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const t = expiryTone(c.expires_at);
                  return (
                    <tr key={c.panel_id} className="border-t">
                      <td className="p-3 font-medium"><CopyText value={c.username} label="usuário" /></td>
                      <td className="p-3"><Secret value={c.password} /></td>
                      <td className="p-3 whitespace-nowrap">{fmtDate(c.expires_at)}</td>
                      <td className="p-3"><div className="flex flex-wrap gap-1"><Tone tone={t.tone}>{t.label}</Tone>{c.blocked && <Tone tone="bad">Bloqueado</Tone>}</div></td>
                      <td className="p-3">{c.connections ?? "—"}</td>
                      <td className="p-3">{c.phone ?? "—"}</td>
                      <td className="p-3 whitespace-nowrap text-muted-foreground">{fmtDate(c.last_seen_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {rows.map((c) => {
              const t = expiryTone(c.expires_at);
              return (
                <Card key={c.panel_id} className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2"><CopyText value={c.username} label="usuário" /><Tone tone={t.tone}>{t.label}</Tone></div>
                  <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Senha</span><Secret value={c.password} /></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Vencimento</span><span>{fmtDate(c.expires_at)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Telas / Telefone</span><span>{c.connections ?? "—"} · {c.phone ?? "—"}</span></div>
                  {c.blocked && <Tone tone="bad">Bloqueado</Tone>}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function CopyText({ value, label }: { value: string; label: string }) {
  return (
    <button type="button" className="inline-flex min-h-11 items-center gap-1 rounded font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Copiar ${label} ${value}`} onClick={() => { navigator.clipboard.writeText(value); toast.success("Copiado"); }}>
      {value}<Copy className="h-3.5 w-3.5 opacity-60" />
    </button>
  );
}

function Secret({ value }: { value: string | null }) {
  const [show, setShow] = useState(false);
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono">{show ? value : "••••••"}</span>
      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={show ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShow(!show)}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Copiar senha" onClick={() => { navigator.clipboard.writeText(value); toast.success("Senha copiada"); }}><Copy className="h-4 w-4" /></Button>
    </span>
  );
}
