import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Archive, ArchiveRestore, BarChart3, Copy, CreditCard, Download, Pencil, Plus, QrCode, Search, Trash2, CopyPlus } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle } from "@/components/admin/coming-soon";
import { Confirm, Tone } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { saveCampaign, setCampaignActive, deleteCampaign } from "@/lib/admin-actions.functions";
import {
  campaignSchema, extractMetaPixel, extractTiktokPixel, normalizeBrPhone, slugify, UTM_SOURCES, type CampaignInput,
} from "@/lib/admin-schemas";
import { useAdminFilters } from "./admin";
import { brl, Card, dtSP, Empty, ErrorState, num, pct, ratio, SP_TZ, STATUS, useRpc, type Breakdown, type Series } from "./admin.index";

export const Route = createFileRoute("/_authenticated/admin/campanhas")({
  head: () => ({ meta: [{ title: "Campanhas — Admin NATV" }, { name: "description", content: "Campanhas, links rastreáveis e QR Codes NATV." }, { property: "og:title", content: "Campanhas — Admin NATV" }, { property: "og:description", content: "Campanhas, links rastreáveis e QR Codes NATV." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: CampaignsPage,
});

type Campaign = {
  id: string; name: string; slug: string; seller_id: string | null; utm_source: string | null; utm_medium: string | null;
  utm_campaign: string | null; utm_term: string | null; utm_content: string | null; destination_whatsapp: string | null;
  prefilled_message: string | null; meta_pixel_id: string | null; tiktok_pixel_id: string | null; active: boolean; created_at: string;
  sellers: { name: string } | null;
};

const origin = () => (typeof window !== "undefined" ? window.location.origin : "");
const linkOf = (slug: string) => `${origin()}/r/${slug}`;
function copy(text: string, msg = "Copiado") { navigator.clipboard.writeText(text).then(() => toast.success(msg), () => toast.error("Não foi possível copiar")); }

function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns-full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*, sellers(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Campaign[];
    },
  });
}
export function useSellerOptions() {
  return useQuery({
    queryKey: ["seller-options"],
    queryFn: async () => (await supabase.from("sellers").select("id, name, active").order("name")).data ?? [],
  });
}

function CampaignsPage() {
  const f = useAdminFilters();
  const q = useCampaigns();
  const bd = useRpc<Breakdown>("admin_breakdown", { p_from: f.from, p_to: f.to, p_campaign: null, p_seller: f.seller, p_dim: "campaign" }, ["campaign", f.from, f.to, f.seller]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<{ mode: "new" | "edit" | "dup"; c?: Campaign } | null>(null);
  const [qr, setQr] = useState<Campaign | null>(null);
  const [payLink, setPayLink] = useState<Campaign | null>(null);
  const [detail, setDetail] = useState<Campaign | null>(null);
  const metrics = useMemo(() => new Map((bd.data ?? []).map((r) => [r.key, r])), [bd.data]);
  const rows = (q.data ?? []).filter((c) => (showArchived || c.active) && (!f.campaign || c.id === f.campaign) &&
    (!search || `${c.name} ${c.slug} ${c.utm_source ?? ""} ${c.sellers?.name ?? ""}`.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Campanhas" subtitle="Links rastreáveis, QR Codes e desempenho no período" />
        <Button className="h-11" onClick={() => setEditing({ mode: "new" })}><Plus aria-hidden /> Nova campanha</Button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Label htmlFor="c-search" className="sr-only">Buscar campanha</Label>
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="c-search" className="h-11 pl-9" placeholder="Buscar por nome, fonte ou vendedor" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" className="h-11" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Ocultar arquivadas" : "Mostrar arquivadas"}</Button>
      </div>
      {q.isError ? <Card><ErrorState onRetry={() => q.refetch()} /></Card> : !q.data ? (
        <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}</div>
      ) : !rows.length ? (
        <Card><Empty msg="Nenhuma campanha encontrada." hint="Crie uma campanha para gerar o link rastreável /r/slug." /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((c) => <CampaignCard key={c.id} c={c} m={metrics.get(c.id)} loadingM={!bd.data}
            onEdit={() => setEditing({ mode: "edit", c })} onDup={() => setEditing({ mode: "dup", c })}
            onQr={() => setQr(c)} onPay={() => setPayLink(c)} onDetail={() => setDetail(c)} />)}
        </div>
      )}
      {editing && <CampaignSheet key={`${editing.mode}-${editing.c?.id ?? "new"}`} state={editing} onClose={() => setEditing(null)} />}
      <QrDialog c={qr} onClose={() => setQr(null)} />
      <PayLinkDialog c={payLink} onClose={() => setPayLink(null)} />
      <DetailSheet c={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function CampaignCard({ c, m, loadingM, onEdit, onDup, onQr, onPay, onDetail }: {
  c: Campaign; m: Breakdown[number] | undefined; loadingM: boolean; onEdit: () => void; onDup: () => void; onQr: () => void; onPay: () => void; onDetail: () => void;
}) {
  const qc = useQueryClient();
  const setActive = useServerFn(setCampaignActive);
  const del = useServerFn(deleteCampaign);
  const clicks = m?.clicks ?? 0, pix = m?.pix ?? 0, paid = m?.paid ?? 0, rev = m?.revenue_cents ?? 0;
  const stats = [
    ["Cliques", num(clicks)], ["PIX gerados", num(pix)], ["Compras", num(paid)],
    ["Conversão", pct(ratio(paid, clicks))], ["Receita", brl(rev)], ["Ticket médio", paid ? brl(Math.round(rev / paid)) : "—"],
  ];
  const refresh = () => qc.invalidateQueries({ queryKey: ["campaigns-full"] });
  return (
    <article className="glass flex min-w-0 flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-display font-semibold">{c.name}</h2>
          <p className="text-xs text-muted-foreground">{c.utm_source ?? "sem fonte"} · {c.sellers?.name ?? "sem vendedor"}</p>
        </div>
        {c.active ? <Tone tone="ok">Ativa</Tone> : <Tone tone="muted">Arquivada</Tone>}
      </div>
      <div className="flex min-w-0 items-center gap-1 rounded-lg bg-muted/50 p-1 pl-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{linkOf(c.slug)}</span>
        <Button size="icon" variant="ghost" className="size-11 shrink-0" aria-label="Copiar link" onClick={() => copy(linkOf(c.slug), "Link copiado")}><Copy aria-hidden /></Button>
        <Button size="icon" variant="ghost" className="size-11 shrink-0" aria-label="QR Code" onClick={onQr}><QrCode aria-hidden /></Button>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {stats.map(([l, v]) => (
          <div key={l} className="rounded-lg bg-muted/30 p-2">
            <dt className="text-[11px] text-muted-foreground">{l}</dt>
            <dd className="text-sm font-semibold">{loadingM ? <Skeleton className="mx-auto h-4 w-10" /> : v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-1">
        <Button variant="outline" className="h-11" onClick={onDetail}><BarChart3 aria-hidden /> Detalhes</Button>
        <Button variant="outline" className="h-11" onClick={onEdit}><Pencil aria-hidden /> Editar</Button>
        <Button variant="outline" className="h-11" onClick={onDup}><CopyPlus aria-hidden /> Duplicar</Button>
        <Button variant="outline" className="h-11" onClick={onPay}><CreditCard aria-hidden /> Link de pagamento</Button>
        <Confirm
          trigger={<Button variant="ghost" className="h-11">{c.active ? <><Archive aria-hidden /> Arquivar</> : <><ArchiveRestore aria-hidden /> Reativar</>}</Button>}
          title={c.active ? "Arquivar campanha?" : "Reativar campanha?"}
          description={c.active ? "O link /r/" + c.slug + " passará a levar direto para a página de pagamento, sem registrar cliques. As vendas antigas continuam." : "O link volta a registrar cliques."}
          onConfirm={async () => { const r = await setActive({ data: { id: c.id, active: !c.active } }); if (r.ok) { toast.success("Campanha atualizada"); refresh(); } else toast.error(r.error); }}
        />
        {clicks === 0 && paid === 0 && pix === 0 && (
          <Confirm
            trigger={<Button variant="ghost" className="h-11 text-destructive"><Trash2 aria-hidden /> Excluir</Button>}
            title="Excluir campanha?" confirmLabel="Excluir"
            description="Só é possível excluir campanhas sem cliques nem pedidos. Esta ação não pode ser desfeita."
            onConfirm={async () => { const r = await del({ data: { id: c.id } }); if (r.ok) { toast.success("Campanha excluída"); refresh(); } else toast.error(r.error); }}
          />
        )}
      </div>
    </article>
  );
}

// ─── form ─────────────────────────────────────────────────────────────────
function CampaignSheet({ state, onClose }: { state: { mode: "new" | "edit" | "dup"; c?: Campaign | undefined }; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveCampaign);
  const sellers = useSellerOptions();
  const c = state.c;
  const isEdit = state.mode === "edit";
  const form = useForm<CampaignInput>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: state.mode === "dup" ? `${c?.name} (cópia)` : c?.name ?? "",
      slug: isEdit ? c!.slug : "",
      seller_id: c?.seller_id ?? "",
      utm_source: (UTM_SOURCES as readonly string[]).includes(c?.utm_source ?? "") ? (c!.utm_source as CampaignInput["utm_source"]) : "facebook",
      utm_medium: c?.utm_medium ?? "cpc",
      utm_campaign: c?.utm_campaign ?? "", utm_term: c?.utm_term ?? "", utm_content: c?.utm_content ?? "",
      destination_whatsapp: c?.destination_whatsapp ?? "", prefilled_message: c?.prefilled_message ?? "",
      meta_pixel_id: c?.meta_pixel_id ?? "", tiktok_pixel_id: c?.tiktok_pixel_id ?? "",
    },
  });
  const { register, setValue, watch, formState: { errors, isSubmitting, dirtyFields } } = form;
  const name = watch("name");
  const [slugTouched, setSlugTouched] = useState(false);
  const [utmTouched, setUtmTouched] = useState(!!c?.utm_campaign && state.mode !== "dup");
  const [phone, setPhone] = useState(c?.destination_whatsapp ?? "");
  useEffect(() => {
    if (!isEdit && !slugTouched) setValue("slug", slugify(name ?? ""));
    if (!utmTouched) setValue("utm_campaign", slugify(name ?? "").replace(/-/g, "_"));
  }, [name, isEdit, slugTouched, utmTouched, setValue]);
  const msg = watch("prefilled_message") ?? "";
  const finalMsg = `${msg || "Olá! Quero assinar o NATV."} [REF]`;
  void dirtyFields;

  const onSubmit = form.handleSubmit(async (v) => {
    const r = await save({ data: { ...v, ...(isEdit ? { id: c!.id, slug: c!.slug } : {}) } });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(isEdit ? "Campanha salva" : "Campanha criada");
    qc.invalidateQueries({ queryKey: ["campaigns-full"] });
    qc.invalidateQueries({ queryKey: ["filter-campaigns"] });
    onClose();
  });
  const Err = ({ k }: { k: keyof CampaignInput }) => errors[k] ? <p className="text-xs text-destructive" role="alert">{String(errors[k]?.message)}</p> : null;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar campanha" : state.mode === "dup" ? "Duplicar campanha" : "Nova campanha"}</SheetTitle>
          <SheetDescription>Campos com * são obrigatórios.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="grid gap-4 px-4 pb-6" noValidate>
          <div className="grid gap-1.5"><Label htmlFor="cf-name">Nome *</Label><Input id="cf-name" className="h-11" {...register("name")} /><Err k="name" /></div>
          <div className="grid gap-1.5">
            <Label htmlFor="cf-slug">Slug *</Label>
            <Input id="cf-slug" className="h-11 font-mono" disabled={isEdit} {...register("slug", { onChange: () => setSlugTouched(true) })} />
            <p className="text-xs text-warning">O slug identifica a campanha em todas as vendas e não pode ser alterado{isEdit ? "." : " depois de criar."}</p>
            <Err k="slug" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cf-seller">Vendedor dono *</Label>
            <Select value={watch("seller_id")} onValueChange={(v) => setValue("seller_id", v, { shouldValidate: true })}>
              <SelectTrigger id="cf-seller" className="h-11"><SelectValue placeholder={sellers.data?.length === 0 ? "Cadastre um vendedor primeiro" : "Escolha"} /></SelectTrigger>
              <SelectContent>{(sellers.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.active ? "" : " (inativo)"}</SelectItem>)}</SelectContent>
            </Select>
            <Err k="seller_id" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cf-src">utm_source</Label>
              <Select value={watch("utm_source")} onValueChange={(v) => setValue("utm_source", v as CampaignInput["utm_source"])}>
                <SelectTrigger id="cf-src" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>{UTM_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="cf-med">utm_medium</Label><Input id="cf-med" className="h-11" {...register("utm_medium")} /></div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="cf-camp">utm_campaign</Label><Input id="cf-camp" className="h-11" {...register("utm_campaign", { onChange: () => setUtmTouched(true) })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="cf-term">utm_term</Label><Input id="cf-term" className="h-11" {...register("utm_term")} /></div>
            <div className="grid gap-1.5"><Label htmlFor="cf-content">utm_content</Label><Input id="cf-content" className="h-11" {...register("utm_content")} /></div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cf-wa">WhatsApp de destino</Label>
            <Input id="cf-wa" className="h-11" inputMode="tel" placeholder="(11) 91234-5678" value={phone}
              onChange={(e) => { setPhone(e.target.value); setValue("destination_whatsapp", e.target.value ? normalizeBrPhone(e.target.value) ?? "x" : "", { shouldValidate: true }); }} />
            <p className="text-xs text-muted-foreground">Salvo como {watch("destination_whatsapp") && watch("destination_whatsapp") !== "x" ? watch("destination_whatsapp") : "55 + DDD + número"}. Sem WhatsApp, o link leva direto ao pagamento.</p>
            <Err k="destination_whatsapp" />
          </div>
          <div className="grid gap-1.5">
            <div className="flex justify-between"><Label htmlFor="cf-msg">Mensagem pré-preenchida</Label><span className="text-xs text-muted-foreground">{msg.length}/300</span></div>
            <Textarea id="cf-msg" maxLength={300} rows={3} {...register("prefilled_message")} />
            <p className="rounded-lg bg-muted/50 p-2 text-xs"><span className="text-muted-foreground">Mensagem final: </span>{finalMsg}</p>
            <p className="text-xs text-muted-foreground">[REF] é trocado pelo código do clique.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cf-meta">Meta Pixel ID</Label>
            <Textarea id="cf-meta" rows={1} placeholder="Cole o ID ou o código completo do pixel" {...register("meta_pixel_id", { onChange: (e) => { const v = e.target.value; if (v.length > 20) setValue("meta_pixel_id", extractMetaPixel(v), { shouldValidate: true }); } })} />
            <Err k="meta_pixel_id" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cf-tt">TikTok Pixel ID</Label>
            <Textarea id="cf-tt" rows={1} placeholder="Cole o ID ou o código completo do pixel" {...register("tiktok_pixel_id", { onChange: (e) => { const v = e.target.value; setValue("tiktok_pixel_id", v.length > 30 ? extractTiktokPixel(v) : v.trim().toUpperCase(), { shouldValidate: true }); } })} />
            <Err k="tiktok_pixel_id" />
          </div>
          <Button type="submit" className="h-11" disabled={isSubmitting}>{isSubmitting ? "Salvando…" : isEdit ? "Salvar alterações" : "Criar campanha"}</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── QR ───────────────────────────────────────────────────────────────────
function QrDialog({ c, onClose }: { c: Campaign | null; onClose: () => void }) {
  const [png, setPng] = useState<string>("");
  const [svg, setSvg] = useState<string>("");
  useEffect(() => {
    if (!c) return;
    const url = linkOf(c.slug);
    const opts = { margin: 2, width: 512, color: { dark: "#0b1517", light: "#ffffff" } };
    QRCode.toDataURL(url, opts).then(setPng).catch(() => setPng(""));
    QRCode.toString(url, { ...opts, type: "svg" }).then(setSvg).catch(() => setSvg(""));
  }, [c]);
  const dl = (href: string, ext: string) => { const a = document.createElement("a"); a.href = href; a.download = `natv-${c?.slug}.${ext}`; a.click(); };
  return (
    <Dialog open={!!c} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>QR Code — {c?.name}</DialogTitle><DialogDescription className="break-all">{c && linkOf(c.slug)}</DialogDescription></DialogHeader>
        {png ? <img src={png} alt={`QR Code do link ${c?.slug}`} className="mx-auto w-56 rounded-xl" /> : <Skeleton className="mx-auto size-56" />}
        <div className="grid grid-cols-2 gap-2">
          <Button className="h-11" disabled={!png} onClick={() => dl(png, "png")}><Download aria-hidden /> PNG</Button>
          <Button className="h-11" variant="outline" disabled={!svg} onClick={() => dl(URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), "svg")}><Download aria-hidden /> SVG</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── payment link generator ───────────────────────────────────────────────
function PayLinkDialog({ c, onClose }: { c: Campaign | null; onClose: () => void }) {
  const [plan, setPlan] = useState("any");
  const plans = useQuery({ queryKey: ["plans-options"], queryFn: async () => (await supabase.from("plans").select("slug, name").eq("active", true).order("months")).data ?? [] });
  const url = c ? `${linkOf(c.slug)}?pagar=1${plan !== "any" ? `&plano=${plan}` : ""}` : "";
  return (
    <Dialog open={!!c} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link de pagamento — {c?.name}</DialogTitle>
          <DialogDescription>Leva direto à página de pagamento, registrando o clique e a atribuição da campanha.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="pl-plan">Plano pré-selecionado</Label>
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger id="pl-plan" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Cliente escolhe</SelectItem>
              {(plans.data ?? []).map((p) => <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="break-all rounded-lg bg-muted/50 p-3 font-mono text-xs">{url}</p>
        <Button className="h-11" onClick={() => copy(url, "Link de pagamento copiado")}><Copy aria-hidden /> Copiar link</Button>
      </DialogContent>
    </Dialog>
  );
}

// ─── detail ───────────────────────────────────────────────────────────────
function DetailSheet({ c, onClose }: { c: Campaign | null; onClose: () => void }) {
  return (
    <Sheet open={!!c} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>{c?.name}</SheetTitle><SheetDescription>Desempenho no período selecionado</SheetDescription></SheetHeader>
        {c && <Detail c={c} />}
      </SheetContent>
    </Sheet>
  );
}
function Detail({ c }: { c: Campaign }) {
  const f = useAdminFilters();
  const day = f.bucket === "hour";
  const ts = useRpc<Series>("admin_timeseries", { p_from: f.from, p_to: f.to, p_campaign: c.id, p_seller: null, p_bucket: f.bucket }, ["c-ts", c.id, f.from, f.to, f.bucket]);
  const mix = useRpc<Breakdown>("admin_breakdown", { p_from: f.from, p_to: f.to, p_campaign: c.id, p_seller: null, p_dim: "plan" }, ["c-mix", c.id, f.from, f.to]);
  const sales = useQuery({
    queryKey: ["c-sales", c.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("id, paid_at, customer_name, panel_username, amount_cents, status, plans(name)")
        .eq("campaign_id", c.id).not("paid_at", "is", null).order("paid_at", { ascending: false }).limit(10);
      if (error) throw error; return data;
    },
  });
  const data = (ts.data ?? []).map((r) => ({ ...r, label: new Date(r.bucket).toLocaleString("pt-BR", day ? { timeZone: SP_TZ, hour: "2-digit" } : { timeZone: SP_TZ, day: "2-digit", month: "2-digit" }) }));
  const mixRows = (mix.data ?? []).filter((r) => r.paid > 0);
  return (
    <div className="grid gap-4 px-4 pb-6">
      <Card title="Cliques e compras">
        {ts.isError ? <ErrorState onRetry={() => ts.refetch()} /> : !ts.data ? <Skeleton className="h-56" /> : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis allowDecimals={false} width={32} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }} formatter={(v: number, n: string) => [num(v), n === "paid" ? "Compras" : "Cliques"]} />
                <Bar dataKey="clicks" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                <Line dataKey="paid" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      <Card title="Mix de planos">
        {mix.isError ? <ErrorState onRetry={() => mix.refetch()} /> : !mix.data ? <Skeleton className="h-20" /> : !mixRows.length ? (
          <Empty msg="Nenhuma venda no período." hint="Divulgue o link da campanha." />
        ) : (
          <ul className="space-y-1 text-sm">{mixRows.map((r) => <li key={r.key} className="flex justify-between"><span>{r.label}</span><span className="text-muted-foreground">{num(r.paid)} · {brl(r.revenue_cents)}</span></li>)}</ul>
        )}
      </Card>
      <Card title="Últimas vendas">
        {sales.isError ? <ErrorState onRetry={() => sales.refetch()} /> : !sales.data ? <Skeleton className="h-32" /> : !sales.data.length ? (
          <Empty msg="Ainda sem vendas." hint="As vendas pagas desta campanha aparecem aqui." />
        ) : (
          <ul className="divide-y divide-border text-sm">
            {sales.data.map((o) => (
              <li key={o.id} className="py-2">
                <Link to="/admin/pedidos" search={(s: Record<string, unknown>) => ({ ...s, order: o.id }) as never} className="flex flex-col rounded focus-visible:outline-2 focus-visible:outline-ring">
                  <span className="flex justify-between gap-2"><span className="truncate">{o.customer_name} · {o.panel_username}</span><span>{brl(o.amount_cents)}</span></span>
                  <span className="text-xs text-muted-foreground">{dtSP(o.paid_at!)} · {o.plans?.name} · {STATUS[o.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
