import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleHelp, Copy, Download, Loader2, MessageCircle, RefreshCw, Square, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { syncClients } from "@/lib/admin-actions.functions";
import { publicUrl } from "@/lib/site-url";
import { buildQueue, DEFAULT_TEMPLATES, formatBatch, fmtVencimento, REGUA_LABEL, waLink, type QueueItem, type Regua, type Templates } from "@/lib/cobranca";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ListSkeleton } from "@/components/admin/list-controls";

const meta = (t: string, d: string) => [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }];

export const Route = createFileRoute("/_authenticated/admin/cobranca")({
  head: () => ({ meta: meta("Cobrança — Admin NATV", "Régua de vencimentos e envio de cobranças pelo WhatsApp Web.") }),
  component: CobrancaPage,
});

type Tab = "todos" | Regua;
const TABS: { v: Tab; l: string }[] = [
  { v: "todos", l: "Todos na Fila" }, { v: "d3", l: "Vencem em 3 dias (D-3)" }, { v: "d1", l: "Vencem amanhã (D-1)" },
  { v: "d0", l: "Vencem hoje (D-0)" }, { v: "vencido", l: "Vencidos recentes (1 a 7 dias)" },
];
const DELAYS = [{ v: "10-15", l: "10 a 15 segundos" }, { v: "15-25", l: "15 a 25 segundos - Recomendado" }, { v: "25-40", l: "25 a 40 segundos (mais seguro)" }];
const TPL_KEY = "natv_cobranca_templates";

type RowStatus = "pending" | "sending" | "sent" | "no_whatsapp" | "failed";
const STATUS_LABEL: Record<RowStatus, string> = { pending: "Pendente", sending: "Enviando...", sent: "Enviado com Sucesso", no_whatsapp: "Sem WhatsApp", failed: "Falhou" };
const STATUS_CLS: Record<RowStatus, string> = {
  pending: "border-border text-muted-foreground", sending: "border-primary/40 bg-primary/10 text-primary", sent: "border-emerald-500/50 text-emerald-500",
  no_whatsapp: "border-amber-500/50 text-amber-500", failed: "border-destructive/50 text-destructive",
};

function loadTemplates(): Templates {
  try { const raw = localStorage.getItem(TPL_KEY); if (raw) return { ...DEFAULT_TEMPLATES, ...(JSON.parse(raw) as Partial<Templates>) }; } catch { /* sem storage */ }
  return DEFAULT_TEMPLATES;
}

async function copy(text: string, ok: string) {
  try { await navigator.clipboard.writeText(text); toast.success(ok); } catch { toast.error("Não foi possível copiar"); }
}

const RECENT_DAYS = 25;

function CobrancaPage() {
  const qc = useQueryClient();
  const sync = useServerFn(syncClients);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<Tab>("todos");
  const [templates, setTemplates] = useState<Templates>(DEFAULT_TEMPLATES);
  const [campaignSlug, setCampaignSlug] = useState("");
  const [off, setOff] = useState<Set<string>>(new Set()); // desmarcados
  const [delay, setDelay] = useState("15-25");
  const [extOk, setExtOk] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; username: string } | null>(null);
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const runningRef = useRef(false);

  useEffect(() => { setTemplates(loadTemplates()); }, []);

  const clients = useQuery({
    queryKey: ["cobranca_clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("panel_clients").select("username, phone, expires_at, blocked").not("expires_at", "is", null);
      if (error) throw error;
      return data;
    },
  });
  const schedules = useQuery({
    queryKey: ["credit_schedules_open"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_schedules").select("panel_username, months_applied, total_months").in("status", ["active", "paused"]);
      if (error) throw error;
      return data;
    },
  });
  const names = useQuery({
    queryKey: ["cobranca_names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("panel_username, customer_name, created_at").order("created_at", { ascending: false }).limit(3000);
      if (error) throw error;
      const m = new Map<string, string>();
      for (const o of data) { const k = o.panel_username.toLowerCase(); if (!m.has(k) && o.customer_name?.trim()) m.set(k, o.customer_name.trim()); }
      return m;
    },
  });
  // Quem pagou/renovou há pouco nunca recebe cobrança (o vencimento local pode estar defasado até a próxima sincronização).
  const recent = useQuery({
    queryKey: ["cobranca_recent_paid"],
    queryFn: async () => {
      const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();
      const [o, s] = await Promise.all([
        supabase.from("orders").select("panel_username").in("status", ["paid", "renewed", "renewal_failed"]).or(`paid_at.gte.${since},created_at.gte.${since}`).limit(5000),
        supabase.from("credit_schedules").select("panel_username").gte("created_at", since).limit(5000),
      ]);
      if (o.error) throw o.error;
      if (s.error) throw s.error;
      return [...o.data, ...s.data].map((r) => r.panel_username);
    },
  });
  const campaigns = useQuery({
    queryKey: ["cobranca_campaigns"],
    queryFn: async () => {
      const [c, l] = await Promise.all([
        supabase.from("campaigns").select("id, name, slug, active").eq("active", true).order("created_at", { ascending: true }),
        supabase.from("campaign_links").select("campaign_id, code, created_at").order("created_at", { ascending: true }),
      ]);
      if (c.error) throw c.error;
      return { campaigns: c.data, links: l.data ?? [] };
    },
  });

  // Campanha padrão: a de renovação, senão a primeira ativa.
  useEffect(() => {
    const list = campaigns.data?.campaigns;
    if (!campaignSlug && list?.length) setCampaignSlug((list.find((c) => /renov/i.test(`${c.slug} ${c.name}`)) ?? list[0])!.slug);
  }, [campaigns.data, campaignSlug]);

  const link = useMemo(() => {
    const c = campaigns.data?.campaigns.find((x) => x.slug === campaignSlug);
    if (!c) return publicUrl("/pagar");
    const code = campaigns.data?.links.find((l) => l.campaign_id === c.id)?.code;
    return publicUrl(`/r/${c.slug}?pagar=1${code ? `&l=${code}` : ""}`);
  }, [campaigns.data, campaignSlug]);

  const queue = useMemo<QueueItem[]>(() => buildQueue({
    clients: clients.data ?? [], scheduledUsernames: (schedules.data ?? []).map((s) => s.panel_username), recentlyPaidUsernames: recent.data, names: names.data, templates, link,
  }), [clients.data, schedules.data, recent.data, names.data, templates, link]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { todos: queue.length, d3: 0, d1: 0, d0: 0, vencido: 0 };
    for (const i of queue) c[i.regua]++;
    return c;
  }, [queue]);
  const rows = useMemo(() => (tab === "todos" ? queue : queue.filter((i) => i.regua === tab)), [queue, tab]);
  const sendable = rows.filter((i) => i.phone && !off.has(i.username));

  // ── Extensão ──────────────────────────────────────────────────────────────
  const ping = useCallback(() => {
    // Várias tentativas: a extensão pode ainda não estar escutando (Brave/Chrome injetam em momentos diferentes).
    for (const ms of [0, 500, 1500]) setTimeout(() => window.postMessage({ source: "toptv-panel", type: "TOPTV_PING" }, "*"), ms);
  }, []);
  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const d = ev.data as { source?: string; type?: string; username?: string; status?: string; current?: number; total?: number; message?: string; stopped?: boolean } | null;
      if (!d || d.source !== "toptv-extension") return;
      if (d.type === "TOPTV_PONG") setExtOk(true);
      else if (d.type === "TOPTV_PROGRESS" && d.username) {
        setProgress({ current: d.current ?? 0, total: d.total ?? 0, username: d.username });
        const s: RowStatus = d.status === "sending" ? "sending" : d.status === "sent" ? "sent" : d.status === "no_whatsapp" ? "no_whatsapp" : "failed";
        setStatus((p) => ({ ...p, [d.username!]: s }));
      } else if (d.type === "TOPTV_DONE") { runningRef.current = false; setRunning(false); toast.success(d.stopped ? "Fila pausada" : "Fila concluída"); }
      else if (d.type === "TOPTV_ERROR") { runningRef.current = false; setRunning(false); toast.error(d.message ?? "Erro na extensão"); }
    }
    window.addEventListener("message", onMsg);
    ping();
    return () => { window.removeEventListener("message", onMsg); };
  }, [ping]);

  function start() {
    if (!sendable.length || runningRef.current) return;
    const [min, max] = delay.split("-").map(Number) as [number, number];
    runningRef.current = true; setRunning(true);
    setStatus(Object.fromEntries(sendable.map((i) => [i.username, "pending" as RowStatus])));
    setProgress({ current: 0, total: sendable.length, username: "" });
    window.postMessage({
      source: "toptv-panel", type: "TOPTV_START_QUEUE",
      payload: { delayMin: min, delayMax: max, items: sendable.map((i) => ({ username: i.username, name: i.name, phone: i.phone, text: i.text })) },
    }, "*");
  }
  function stop() { window.postMessage({ source: "toptv-panel", type: "TOPTV_STOP_QUEUE" }, "*"); }

  function saveTemplate(r: Regua, v: string) {
    const next = { ...templates, [r]: v };
    setTemplates(next);
    try { localStorage.setItem(TPL_KEY, JSON.stringify(next)); } catch { /* sem storage */ }
  }
  function resetTemplates() {
    setTemplates(DEFAULT_TEMPLATES);
    try { localStorage.removeItem(TPL_KEY); } catch { /* sem storage */ }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await sync();
      if (r && "ok" in r && r.ok === false) { toast.error(r.error); return; }
      toast.success("Vencimentos atualizados com o painel NATV");
      await qc.invalidateQueries({ queryKey: ["cobranca_clients"] });
      void qc.invalidateQueries({ queryKey: ["panel_clients"] });
    } catch { toast.error("Não foi possível sincronizar. Tente de novo."); } finally { setSyncing(false); }
  }

  const loading = clients.isLoading || schedules.isLoading || recent.isLoading;
  const failed = clients.isError || schedules.isError || recent.isError;
  const allOn = rows.length > 0 && rows.filter((i) => i.phone).every((i) => !off.has(i.username));
  const toggleAll = (on: boolean) => setOff((p) => { const n = new Set(p); for (const i of rows) { if (on) n.delete(i.username); else n.add(i.username); } return n; });
  const toggle = (u: string, on: boolean) => setOff((p) => { const n = new Set(p); if (on) n.delete(u); else n.add(u); return n; });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Cobrança &amp; Régua de Vencimentos</h1>
          <p className="text-sm text-muted-foreground">Quem vence em 3 dias, amanhã, hoje ou venceu na última semana. Quem tem créditos futuros agendados ou pagou nos últimos 25 dias não entra.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {extOk ? (
            <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-500/50 px-4 text-sm text-emerald-500"><Check className="h-4 w-4" />Extensão Conectada</span>
          ) : (
            <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-500/50 px-4 text-sm text-amber-500"><TriangleAlert className="h-4 w-4" />Extensão não detectada</span>
          )}
          <Button variant="outline" className="h-11" onClick={syncNow} disabled={syncing}>
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Sincronizar com Painel
          </Button>
          {!extOk && <Button variant="outline" className="h-11" onClick={ping}>Verificar de novo</Button>}
          <HelpDialog />
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro da régua">
        {TABS.map((t) => (
          <Button key={t.v} variant={tab === t.v ? "default" : "outline"} className="h-11" aria-pressed={tab === t.v} onClick={() => setTab(t.v)}>
            {t.l} <span className="ml-2 rounded-full bg-background/20 px-2 text-xs">{counts[t.v]}</span>
          </Button>
        ))}
      </div>

      <details className="rounded-lg border p-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Modelos de mensagem e link</summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">Variáveis: {"{nome}"}, {"{usuario}"}, {"{vencimento}"}, {"{dias}"}, {"{link}"}. Salvo neste navegador.</p>
          <div className="space-y-1">
            <Label htmlFor="cb-camp">Campanha do link de renovação</Label>
            <select id="cb-camp" className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={campaignSlug} onChange={(e) => setCampaignSlug(e.target.value)}>
              {!campaigns.data?.campaigns.length && <option value="">Sem campanha ativa (usa /pagar)</option>}
              {campaigns.data?.campaigns.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select>
            <p className="break-all text-xs text-muted-foreground">Link usado: {link}</p>
          </div>
          {(Object.keys(REGUA_LABEL) as Regua[]).map((r) => (
            <div key={r} className="space-y-1">
              <Label htmlFor={`tpl-${r}`}>{REGUA_LABEL[r]}</Label>
              <Textarea id={`tpl-${r}`} rows={3} value={templates[r]} onChange={(e) => saveTemplate(r, e.target.value)} />
            </div>
          ))}
          <Button variant="outline" className="h-11" onClick={resetTemplates}>Restaurar modelos padrão</Button>
        </div>
      </details>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="cb-delay">Intervalo entre mensagens</Label>
            <select id="cb-delay" className="h-11 rounded-md border bg-background px-3 text-sm" value={delay} onChange={(e) => setDelay(e.target.value)} disabled={running}>
              {DELAYS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
            </select>
          </div>
          {running ? (
            <Button variant="destructive" className="h-11" onClick={stop}><Square className="mr-2 h-4 w-4" />Pausar / Cancelar Fila</Button>
          ) : (
            <Button className="h-11" disabled={!extOk || !sendable.length} onClick={start}>
              <MessageCircle className="mr-2 h-4 w-4" />Iniciar Envios Automáticos ({sendable.length})
            </Button>
          )}
          <Button variant="outline" className="h-11" disabled={!rows.length} onClick={() => copy(formatBatch(rows), "Lista copiada")}>
            <Copy className="mr-2 h-4 w-4" />Copiar Todos em Texto
          </Button>
        </div>
        {!extOk && <p className="text-xs text-muted-foreground">Sem a extensão, use os botões de cada linha: abrir a conversa no WhatsApp Web ou copiar a mensagem.</p>}
        {progress && (
          <div className="space-y-1" aria-live="polite">
            <Progress value={progress.total ? (Math.max(0, progress.current - (running ? 1 : 0)) / progress.total) * 100 : 0} />
            <p className="text-sm">
              {running ? <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Enviando para {names.data?.get(progress.username.toLowerCase()) ?? progress.username} ({progress.current} de {progress.total})...</> : `Último envio: ${progress.current} de ${progress.total}`}
            </p>
          </div>
        )}
      </Card>

      {loading ? <ListSkeleton /> : failed ? (
        <Card className="p-6 text-center"><p>Não foi possível carregar a fila.</p><Button className="mt-3 h-11" onClick={() => { void clients.refetch(); void schedules.refetch(); void recent.refetch(); }}>Tentar novamente</Button></Card>
      ) : !clients.data?.length ? (
        <Card className="p-6 text-center"><p className="font-medium">Nenhum cliente sincronizado.</p><p className="text-sm text-muted-foreground">Sincronize a base em Clientes → “Sincronizar com painel NATV”.</p></Card>
      ) : !rows.length ? (
        <Card className="p-6 text-center text-muted-foreground">Ninguém para avisar nesse filtro hoje.</Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="p-3"><Checkbox aria-label="Marcar todos" checked={allOn} onCheckedChange={(v) => toggleAll(v === true)} /></th>
                <th className="p-3">Cliente</th><th className="p-3">Vencimento</th><th className="p-3">Régua</th><th className="p-3">Telefone</th><th className="p-3">Envio</th><th className="p-3"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const st: RowStatus = status[i.username] ?? "pending";
                return (
                  <tr key={i.username} className="border-t align-top">
                    <td className="p-3"><Checkbox aria-label={`Marcar ${i.username}`} disabled={!i.phone || running} checked={!!i.phone && !off.has(i.username)} onCheckedChange={(v) => toggle(i.username, v === true)} /></td>
                    <td className="p-3"><div className="font-medium">{i.name}</div><div className="text-xs text-muted-foreground">{i.username}</div></td>
                    <td className="whitespace-nowrap p-3">{fmtVencimento(i.expires_at)}</td>
                    <td className="p-3">{REGUA_LABEL[i.regua]}</td>
                    <td className="whitespace-nowrap p-3">{i.phone ? `+${i.phone}` : <span className="rounded-full border border-amber-500/50 px-2 py-0.5 text-xs text-amber-500">Sem número</span>}</td>
                    <td className="p-3"><span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${STATUS_CLS[st]}`}>{i.phone ? STATUS_LABEL[st] : "—"}</span></td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        {i.phone && <Button asChild variant="outline" size="icon" className="h-11 w-11" aria-label={`Abrir conversa com ${i.name}`}><a href={waLink(i.phone, i.text)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /></a></Button>}
                        <Button variant="outline" className="h-11" onClick={() => copy(i.text, "Mensagem copiada")}><Copy className="mr-2 h-4 w-4" />Copiar</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" className="h-11"><CircleHelp className="mr-2 h-4 w-4" />Como Instalar</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Instalar a extensão (Chrome ou Edge)</DialogTitle>
          <DialogDescription>Ela envia a fila pela aba do WhatsApp Web que você já mantém aberta.</DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Baixe o arquivo abaixo e extraia o .zip em uma pasta fixa.</li>
          <li>Abra <code>chrome://extensions</code> (Edge: <code>edge://extensions</code>).</li>
          <li>Ative o <strong>Modo do desenvolvedor</strong>.</li>
          <li>Clique em <strong>Carregar sem compactação</strong> e escolha a pasta extraída.</li>
          <li>Abra o WhatsApp Web (conectado) em outra aba, volte aqui e atualize a página. O selo ficará verde.</li>
        </ol>
        <Button asChild className="h-11"><a href="/toptv-whatsapp-bridge.zip" download><Download className="mr-2 h-4 w-4" />Baixar Extensão</a></Button>
        <p className="text-xs text-muted-foreground">Envio automático em massa pode levar o WhatsApp a limitar o número. Prefira o intervalo recomendado ou maior.</p>
      </DialogContent>
    </Dialog>
  );
}
