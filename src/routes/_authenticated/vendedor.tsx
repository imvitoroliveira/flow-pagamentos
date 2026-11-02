import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { LogOut, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CampaignLinks } from "@/components/campaign-links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/vendedor")({
  beforeLoad: async ({ context }) => {
    const { data } = await supabase.rpc("has_role", { _user_id: context.user.id, _role: "seller" });
    if (!data) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
  },
  head: () => ({
    meta: [
      { title: "Área do vendedor — NATV" },
      { name: "description", content: "Campanhas, links de pagamento, vendas e comissões do vendedor NATV." },
      { property: "og:title", content: "Área do vendedor — NATV" },
      { property: "og:description", content: "Campanhas, links de pagamento, vendas e comissões do vendedor NATV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerPortal,
});

const PERIODS = { "7": "Últimos 7 dias", "30": "Últimos 30 dias", "90": "Últimos 90 dias", all: "Todo o período" } as const;
type P = keyof typeof PERIODS;
const PAID = new Set(["paid", "renewed", "renewal_failed"]);
const STATUS: Record<string, string> = { pending: "Aguardando PIX", paid: "Pago", renewed: "Renovado", renewal_failed: "Pago (renovação falhou)", expired: "Expirado", cancelled: "Cancelado" };

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1).replace(".", ",")}%` : "—");
const dt = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const slugify = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

function SellerPortal() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [period, setPeriod] = useState<P>("30");
  const from = period === "all" ? null : new Date(Date.now() - Number(period) * 86400000).toISOString();

  const me = useQuery({
    queryKey: ["me-seller"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sellers").select("id, name, commission_bps").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const data = useQuery({
    queryKey: ["seller-data", from],
    enabled: !!me.data,
    queryFn: async () => {
      let cq = supabase.from("clicks").select("campaign_id, link_id, created_at").limit(10000);
      let oq = supabase.from("orders").select("id, created_at, customer_name, customer_phone, panel_username, amount_cents, status, campaign_id, paid_at, plans(name)").order("created_at", { ascending: false }).limit(5000);
      if (from) { cq = cq.gte("created_at", from); oq = oq.gte("created_at", from); }
      const [c, cl, o] = await Promise.all([
        supabase.from("campaigns").select("id, name, slug, utm_source, active, created_at").order("created_at", { ascending: false }),
        cq, oq,
      ]);
      if (c.error || cl.error || o.error) throw c.error ?? cl.error ?? o.error;
      return { campaigns: c.data, clicks: cl.data, orders: o.data };
    },
  });

  async function signOut() {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const bps = me.data?.commission_bps ?? 0;
  const commission = (cents: number) => Math.round((cents * bps) / 10000);

  const agg = useMemo(() => {
    if (!data.data) return null;
    const { clicks, orders } = data.data;
    const paid = orders.filter((o) => PAID.has(o.status));
    const revenue = paid.reduce((s, o) => s + o.amount_cents, 0);
    const byCamp = new Map<string, { clicks: number; pix: number; paid: number; revenue: number }>();
    const get = (id: string) => byCamp.get(id) ?? (byCamp.set(id, { clicks: 0, pix: 0, paid: 0, revenue: 0 }), byCamp.get(id)!);
    const byLink = new Map<string, number>();
    clicks.forEach((c) => { if (c.campaign_id) get(c.campaign_id).clicks++; if (c.link_id) byLink.set(c.link_id, (byLink.get(c.link_id) ?? 0) + 1); });
    orders.forEach((o) => { if (!o.campaign_id) return; const m = get(o.campaign_id); m.pix++; if (PAID.has(o.status)) { m.paid++; m.revenue += o.amount_cents; } });
    const customers = new Map<string, { name: string; phone: string; user: string; count: number; total: number; last: string }>();
    paid.forEach((o) => {
      const k = o.panel_username.toLowerCase();
      const cur = customers.get(k);
      if (cur) { cur.count++; cur.total += o.amount_cents; if (o.created_at > cur.last) cur.last = o.created_at; }
      else customers.set(k, { name: o.customer_name, phone: o.customer_phone, user: o.panel_username, count: 1, total: o.amount_cents, last: o.created_at });
    });
    return { clicks: clicks.length, pix: orders.length, paid: paid.length, revenue, byCamp, byLink, customers: [...customers.values()].sort((a, b) => b.last.localeCompare(a.last)) };
  }, [data.data]);

  if (me.isError || data.isError) {
    return <Shell onSignOut={signOut}><div className="rounded-2xl border p-6 text-center"><p>Não foi possível carregar seus dados.</p><Button className="mt-3 h-11" onClick={() => { me.refetch(); data.refetch(); }}>Tentar novamente</Button></div></Shell>;
  }
  if (me.data === null) {
    return <Shell onSignOut={signOut}><div className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">Sua conta de vendedor está inativa ou não foi vinculada. Fale com o administrador.</div></Shell>;
  }

  return (
    <Shell name={me.data?.name} onSignOut={signOut}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Olá{me.data ? `, ${me.data.name}` : ""}</h1>
          <p className="text-sm text-muted-foreground">Sua comissão: {(bps / 100).toFixed(1).replace(".", ",")}% sobre vendas pagas</p>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="sp-period" className="text-xs text-muted-foreground">Período</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as P)}>
            <SelectTrigger id="sp-period" className="h-11 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(PERIODS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6" aria-label="Métricas">
        {([
          ["Cliques", agg?.clicks.toLocaleString("pt-BR")],
          ["PIX gerados", agg?.pix.toLocaleString("pt-BR")],
          ["Vendas pagas", agg?.paid.toLocaleString("pt-BR")],
          ["Conversão", agg && pct(agg.paid, agg.clicks)],
          ["Receita", agg && brl(agg.revenue)],
          ["Sua comissão", agg && brl(commission(agg.revenue))],
        ] as const).map(([l, v]) => (
          <div key={l} className="glass rounded-2xl border p-3">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="mt-1 font-display text-lg font-semibold">{v ?? <Skeleton className="h-6 w-16" />}</p>
          </div>
        ))}
      </section>

      <Tabs defaultValue="campanhas">
        <TabsList className="h-11 w-full justify-start overflow-x-auto">
          <TabsTrigger value="campanhas" className="min-h-9">Campanhas</TabsTrigger>
          <TabsTrigger value="vendas" className="min-h-9">Vendas</TabsTrigger>
          <TabsTrigger value="clientes" className="min-h-9">Clientes</TabsTrigger>
        </TabsList>

        <TabsContent value="campanhas" className="space-y-3">
          <NewCampaign sellerId={me.data?.id} />
          {!data.data || !agg ? <Skeleton className="h-40 rounded-2xl" /> : !data.data.campaigns.length ? (
            <Empty msg="Você ainda não tem campanhas." hint="Crie uma campanha acima e depois gere links de pagamento com apelidos." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {data.data.campaigns.map((c) => {
                const m = agg.byCamp.get(c.id) ?? { clicks: 0, pix: 0, paid: 0, revenue: 0 };
                return (
                  <article key={c.id} className="glass grid min-w-0 gap-3 rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><h2 className="truncate font-display font-semibold">{c.name}</h2><p className="text-xs text-muted-foreground">{c.utm_source ?? "sem fonte"}</p></div>
                      <span className="rounded-full border px-2 py-0.5 text-xs">{c.active ? "Ativa" : "Arquivada"}</span>
                    </div>
                    <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
                      {([["Cliques", m.clicks], ["PIX", m.pix], ["Pagas", m.paid], ["Conversão", pct(m.paid, m.clicks)], ["Receita", brl(m.revenue)]] as const).map(([l, v]) => (
                        <div key={l} className="rounded-lg bg-muted/30 p-2"><dt className="text-[11px] text-muted-foreground">{l}</dt><dd className="text-sm font-semibold">{v}</dd></div>
                      ))}
                    </dl>
                    <CampaignLinks campaignId={c.id} slug={c.slug} clicksByLink={agg.byLink} />
                  </article>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="vendas">
          {!data.data ? <Skeleton className="h-40 rounded-2xl" /> : !data.data.orders.length ? (
            <Empty msg="Nenhuma venda no período." hint="Compartilhe seus links de pagamento para começar a vender." />
          ) : (
            <ul className="grid gap-2">
              {data.data.orders.map((o) => (
                <li key={o.id} className="glass flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{o.customer_name} <span className="text-muted-foreground">· {o.panel_username}</span></p>
                    <p className="text-xs text-muted-foreground">{dt(o.created_at)} · {o.plans?.name ?? "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{brl(o.amount_cents)}</p>
                    <p className="text-xs text-muted-foreground">{STATUS[o.status] ?? o.status}{PAID.has(o.status) && ` · comissão ${brl(commission(o.amount_cents))}`}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="clientes">
          {!agg ? <Skeleton className="h-40 rounded-2xl" /> : !agg.customers.length ? (
            <Empty msg="Nenhum cliente com compra paga no período." hint="Os clientes aparecem aqui depois que o PIX é pago." />
          ) : (
            <ul className="grid gap-2">
              {agg.customers.map((c) => (
                <li key={c.user} className="glass flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium">{c.name}</p><p className="text-xs text-muted-foreground">Usuário {c.user} · WhatsApp {c.phone}</p></div>
                  <div className="text-right"><p className="font-semibold">{brl(c.total)}</p><p className="text-xs text-muted-foreground">{c.count} compra(s) · última {dt(c.last)}</p></div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </Shell>
  );
}

function Shell({ name, onSignOut, children }: { name?: string | undefined; onSignOut: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-md">
        <span className="font-display font-bold">NATV <span className="text-primary">Vendedor</span></span>
        <div className="flex items-center gap-2">
          {name && <span className="hidden text-sm text-muted-foreground sm:inline">{name}</span>}
          <Button variant="ghost" className="h-11" onClick={onSignOut}><LogOut aria-hidden /> Sair</Button>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-6xl gap-4 p-4 md:p-6">{children}</main>
    </div>
  );
}

function Empty({ msg, hint }: { msg: string; hint: string }) {
  return <div className="rounded-2xl border p-6 text-center"><p className="font-medium">{msg}</p><p className="mt-1 text-sm text-muted-foreground">{hint}</p></div>;
}

function NewCampaign({ sellerId }: { sellerId?: string | undefined }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!sellerId) return;
    if (n.length < 2) { toast.error("Informe o nome da campanha"); return; }
    setBusy(true);
    const slug = `${slugify(n) || "campanha"}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase.from("campaigns").insert({ name: n.slice(0, 80), slug, seller_id: sellerId, utm_source: source.trim().slice(0, 60) || null });
    setBusy(false);
    if (error) { toast.error("Não foi possível criar a campanha"); return; }
    toast.success("Campanha criada");
    setName(""); setSource("");
    qc.invalidateQueries({ queryKey: ["seller-data"] });
  }
  return (
    <form onSubmit={submit} className="glass grid gap-2 rounded-2xl border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div className="grid gap-1"><Label htmlFor="nc-name">Nome da campanha *</Label><Input id="nc-name" className="h-11" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="grid gap-1"><Label htmlFor="nc-src">Fonte (ex.: instagram)</Label><Input id="nc-src" className="h-11" maxLength={60} value={source} onChange={(e) => setSource(e.target.value)} /></div>
      <Button type="submit" className="h-11" disabled={busy || !sellerId}><Plus aria-hidden /> Nova campanha</Button>
    </form>
  );
}
