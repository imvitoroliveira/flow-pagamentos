import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { retryRenewal } from "@/lib/renewal.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// Legacy admin sections (moved unchanged; to be rewritten in later stages).
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR") : "—");
const statusLabel: Record<string, string> = {
  pending: "Pendente", paid: "Pago", renewed: "Renovado", renewal_failed: "Falha renovação", expired: "Expirado", cancelled: "Cancelado",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-bold">{value}</p>
    </div>
  );
}

export function Orders() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders").select("*, plans(name), sellers(name), campaigns(name)")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
  const paid = data.filter((o) => ["paid", "renewed", "renewal_failed"].includes(o.status));
  const retryFn = useServerFn(retryRenewal);
  const [retrying, setRetrying] = useState<string | null>(null);
  async function retry(id: string) {
    setRetrying(id);
    try {
      const r = await retryFn({ data: { order_id: id } });
      if (r.ok) toast.success("Renovado com sucesso"); else toast.error(r.error ?? "Falha na renovação");
    } catch (e) { toast.error((e as Error).message); }
    finally { setRetrying(null); qc.invalidateQueries({ queryKey: ["orders"] }); }
  }
  async function setStatus(id: string, status: "renewed" | "cancelled") {
    const patch = status === "renewed" ? { status, renewed_at: new Date().toISOString(), renewal_error: null } : { status };
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["orders"] });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Pedidos" value={String(data.length)} />
        <Stat label="Pagos" value={String(paid.length)} />
        <Stat label="Receita" value={brl(paid.reduce((s, o) => s + o.amount_cents, 0))} />
        <Stat label="Falhas renovação" value={String(data.filter((o) => o.status === "renewal_failed").length)} />
      </div>
      <div className="space-y-2">
        {data.map((o) => (
          <div key={o.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="font-semibold">{o.customer_name} <span className="text-muted-foreground">· {o.panel_username}</span></p>
              <p className="text-xs text-muted-foreground">
                {o.plans?.name} · {brl(o.amount_cents)} · {o.customer_phone} · {dt(o.created_at)}
                {o.ref_code && ` · ref ${o.ref_code}`}{o.campaigns?.name && ` · ${o.campaigns.name}`}{o.sellers?.name && ` · ${o.sellers.name}`}
              </p>
              {o.renewal_error && <p className="text-xs text-destructive">{o.renewal_error}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={o.status === "renewed" ? "default" : o.status === "renewal_failed" ? "destructive" : "secondary"}>{statusLabel[o.status]}</Badge>
              {o.status === "renewal_failed" && (
                <Button size="sm" disabled={retrying === o.id} onClick={() => retry(o.id)}>
                  {retrying === o.id ? <Loader2 className="animate-spin" /> : <RefreshCw />} Tentar renovar novamente
                </Button>
              )}
              {(o.status === "paid" || o.status === "renewal_failed") && <Button size="sm" variant="ghost" onClick={() => setStatus(o.id, "renewed")}>Marcar renovado</Button>}
              {o.status === "pending" && <Button size="sm" variant="ghost" onClick={() => setStatus(o.id, "cancelled")}>Cancelar</Button>}
            </div>
          </div>
        ))}
        {data.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p>}
      </div>
    </div>
  );
}

function useSellers() {
  return useQuery({
    queryKey: ["sellers"],
    queryFn: async () => (await supabase.from("sellers").select("*").order("name")).data ?? [],
  });
}

export function Sellers() {
  const qc = useQueryClient();
  const { data = [] } = useSellers();
  const [name, setName] = useState("");
  const [chat, setChat] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("sellers").insert({ name, telegram_chat_id: chat || null });
    if (error) { toast.error(error.message); return; }
    setName(""); setChat("");
    qc.invalidateQueries({ queryKey: ["sellers"] });
  }
  async function toggle(id: string, active: boolean) {
    await supabase.from("sellers").update({ active }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["sellers"] });
  }
  return (
    <div className="space-y-4">
      <form onSubmit={add} className="grid gap-2 rounded-2xl border bg-card p-4 md:grid-cols-[1fr_1fr_auto]">
        <Input placeholder="Nome" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Telegram chat ID" value={chat} onChange={(e) => setChat(e.target.value)} />
        <Button type="submit">Adicionar</Button>
      </form>
      {data.map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded-2xl border bg-card p-4">
          <div><p className="font-semibold">{s.name}</p><p className="text-xs text-muted-foreground">Telegram: {s.telegram_chat_id ?? "—"}</p></div>
          <Button size="sm" variant={s.active ? "secondary" : "default"} onClick={() => toggle(s.id, !s.active)}>{s.active ? "Desativar" : "Ativar"}</Button>
        </div>
      ))}
    </div>
  );
}

const emptyCampaign = { name: "", slug: "", seller_id: "", destination_whatsapp: "", prefilled_message: "", utm_source: "", utm_medium: "", utm_campaign: "", utm_term: "", utm_content: "", meta_pixel_id: "", tiktok_pixel_id: "" };

export function Campaigns() {
  const qc = useQueryClient();
  const { data: sellers = [] } = useSellers();
  const { data = [] } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => (await supabase.from("campaigns").select("*, sellers(name), clicks(count), orders(count)").order("created_at", { ascending: false })).data ?? [],
  });
  const [f, setF] = useState(emptyCampaign);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const row = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === "" ? null : v])) as typeof f;
    const { error } = await supabase.from("campaigns").insert({ ...row, name: f.name, slug: f.slug.toLowerCase() });
    if (error) { toast.error(error.code === "23505" ? "Slug já existe" : error.message); return; }
    setF(emptyCampaign);
    qc.invalidateQueries({ queryKey: ["campaigns"] });
  }
  const fields: [keyof typeof f, string][] = [
    ["name", "Nome *"], ["slug", "Slug * (imutável)"], ["destination_whatsapp", "WhatsApp destino"], ["prefilled_message", "Mensagem pré-preenchida"],
    ["utm_source", "utm_source"], ["utm_medium", "utm_medium"], ["utm_campaign", "utm_campaign"], ["utm_term", "utm_term"], ["utm_content", "utm_content"],
    ["meta_pixel_id", "Meta Pixel ID"], ["tiktok_pixel_id", "TikTok Pixel ID"],
  ];
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="space-y-4">
      <form onSubmit={add} className="grid gap-2 rounded-2xl border bg-card p-4 md:grid-cols-3">
        {fields.map(([k, label]) => (
          <Input key={k} placeholder={label} required={k === "name" || k === "slug"} pattern={k === "slug" ? "[a-z0-9-]+" : undefined}
            value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        ))}
        <select className="h-9 rounded-md border bg-transparent px-3 text-sm" value={f.seller_id} onChange={(e) => setF({ ...f, seller_id: e.target.value })}>
          <option value="">Sem vendedor</option>
          {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <Button type="submit" className="md:col-span-3">Criar campanha</Button>
      </form>
      {data.map((c) => (
        <div key={c.id} className="rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{c.name} <span className="text-muted-foreground">· {c.sellers?.name ?? "sem vendedor"}</span></p>
            <p className="text-xs text-muted-foreground">
              {(c.clicks as unknown as { count: number }[])[0]?.count ?? 0} cliques · {(c.orders as unknown as { count: number }[])[0]?.count ?? 0} pedidos
            </p>
          </div>
          <button className="mt-1 text-xs text-primary" onClick={() => { navigator.clipboard.writeText(`${origin}/r/${c.slug}`); toast.success("Link copiado"); }}>
            {origin}/r/{c.slug}
          </button>
        </div>
      ))}
    </div>
  );
}

export function Webhooks() {
  const { data = [] } = useQuery({
    queryKey: ["webhooks"],
    queryFn: async () => (await supabase.from("webhook_logs").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  return (
    <div className="space-y-2">
      {data.map((w) => (
        <details key={w.id} className="rounded-2xl border bg-card p-4">
          <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm">
            <span>{w.provider} · {w.event ?? "—"} · {dt(w.created_at)}</span>
            <Badge variant={w.processed ? "default" : "destructive"}>{w.processed ? "ok" : w.error ?? "erro"}</Badge>
          </summary>
          <pre className="mt-3 overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(w.payload, null, 2)}</pre>
        </details>
      ))}
      {data.length === 0 && <p className="text-sm text-muted-foreground">Nenhum webhook recebido.</p>}
    </div>
  );
}
