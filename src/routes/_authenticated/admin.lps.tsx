import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, CopyPlus, ExternalLink, Loader2, Pencil, Plus, Power, Sparkles, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { publicUrl } from "@/lib/site-url";
import { BENEFIT_ICONS, conversionRate, LP_TEMPLATE, type Benefit, type FaqItem, type LandingPageRow } from "@/lib/landing";
import { landingPageSchema, extractMetaPixel, slugify } from "@/lib/admin-schemas";
import { deleteLandingPage, duplicateLandingPage, saveLandingPage, setLandingPageActive } from "@/lib/admin-actions.functions";
import { Confirm } from "@/components/admin/confirm";
import { ListSkeleton } from "@/components/admin/list-controls";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const meta = (t: string, d: string) => [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }];

export const Route = createFileRoute("/_authenticated/admin/lps")({
  head: () => ({ meta: meta("Landing Pages — Admin NATV", "Crie e gerencie landing pages com rastreamento Meta.") }),
  component: LpsPage,
});

type Form = {
  id?: string; campaign_id: string; title: string; slug: string; headline: string; subheadline: string; cta_text: string; cta_subtext: string;
  badge_top: string; whatsapp_number: string; whatsapp_message: string; meta_pixel_id: string; benefits: Benefit[]; faq: FaqItem[]; active: boolean;
};
const EMPTY: Form = { campaign_id: "", title: "", slug: "", headline: "", subheadline: "", cta_text: "Quero Meu Teste Grátis no WhatsApp", cta_subtext: "Ativação imediata em menos de 2 minutos", badge_top: "", whatsapp_number: "", whatsapp_message: "", meta_pixel_id: "", benefits: [], faq: [], active: true };
const ICON_LABEL: Record<string, string> = { tv: "TV", zap: "Raio", headset: "Suporte", shield: "Escudo", wrench: "Instalação", smartphone: "Celular", check: "Check", star: "Estrela" };
const selectCls = "h-11 w-full rounded-md border bg-background px-3 text-sm";

function toForm(r: LandingPageRow): Form {
  return {
    id: r.id, campaign_id: r.campaign_id ?? "", title: r.title, slug: r.slug, headline: r.headline, subheadline: r.subheadline ?? "", cta_text: r.cta_text,
    cta_subtext: r.cta_subtext ?? "", badge_top: r.badge_top ?? "", whatsapp_number: r.whatsapp_number ?? "", whatsapp_message: r.whatsapp_message ?? "",
    meta_pixel_id: r.meta_pixel_id ?? "", benefits: r.benefits ?? [], faq: r.faq ?? [], active: r.active,
  };
}

function LpsPage() {
  const qc = useQueryClient();
  const save = useServerFn(saveLandingPage);
  const toggle = useServerFn(setLandingPageActive);
  const dup = useServerFn(duplicateLandingPage);
  const del = useServerFn(deleteLandingPage);
  const [edit, setEdit] = useState<Form | null>(null);

  const list = useQuery({
    queryKey: ["landing_pages"],
    queryFn: async () => {
      // landing_pages is newer than the generated Supabase types
      const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (c: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: LandingPageRow[] | null; error: Error | null }> } } })
        .from("landing_pages").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const campaigns = useQuery({
    queryKey: ["lp_campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("id, name, destination_whatsapp").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["landing_pages"] });

  async function run(p: Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    const r = await p;
    if (!r.ok) { toast.error(r.error ?? "Não foi possível concluir."); return; }
    toast.success(okMsg); void refresh();
  }
  const copyUrl = async (slug: string) => { try { await navigator.clipboard.writeText(publicUrl(`/lp/${slug}`)); toast.success("Link copiado"); } catch { toast.error("Não foi possível copiar"); } };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Landing Pages</h1>
          <p className="text-sm text-muted-foreground">Páginas para anúncios: Meta Ads → LP → WhatsApp, com rastreamento Pixel e API de Conversões.</p>
        </div>
        <Button className="h-11 shrink-0" onClick={() => setEdit({ ...EMPTY })}><Plus className="mr-2 h-4 w-4" />Nova Landing Page</Button>
      </div>

      {list.isLoading ? <ListSkeleton /> : list.isError ? (
        <Card className="p-6 text-center">
          <p>Não foi possível carregar as LPs.</p>
          <p className="text-xs text-muted-foreground">Se a tabela ainda não existe, aplique a migração 0010 (landing_pages).</p>
          <Button className="mt-3 h-11" onClick={() => void list.refetch()}>Tentar novamente</Button>
        </Card>
      ) : !list.data?.length ? (
        <Card className="p-6 text-center"><p className="font-medium">Nenhuma landing page ainda.</p><p className="text-sm text-muted-foreground">Clique em “Nova Landing Page” e use o modelo padrão para começar.</p></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.data.map((lp) => {
            const rate = conversionRate(lp.leads_count, lp.views_count);
            return (
              <Card key={lp.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{lp.title}</p>
                    <p className="truncate text-xs text-muted-foreground">/lp/{lp.slug}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${lp.active ? "border-emerald-500/50 text-emerald-500" : "border-border text-muted-foreground"}`}>{lp.active ? "Ativa" : "Desativada"}</span>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div><dt className="text-xs text-muted-foreground">Visitas</dt><dd className="font-semibold">{lp.views_count}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Leads</dt><dd className="font-semibold">{lp.leads_count}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Conversão</dt><dd className="font-semibold">{rate === null ? "—" : `${rate.toFixed(1).replace(".", ",")}%`}</dd></div>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="h-11" onClick={() => copyUrl(lp.slug)}><Copy className="mr-2 h-4 w-4" />Copiar link</Button>
                  <Button asChild variant="outline" className="h-11"><a href={publicUrl(`/lp/${lp.slug}`)} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Visualizar</a></Button>
                  <Button variant="outline" className="h-11" onClick={() => setEdit(toForm(lp))}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
                  <Button variant="outline" className="h-11" onClick={() => run(dup({ data: { id: lp.id } }), "LP duplicada (desativada)")}><CopyPlus className="mr-2 h-4 w-4" />Duplicar</Button>
                  <Button variant="outline" className="h-11" onClick={() => run(toggle({ data: { id: lp.id, active: !lp.active } }), lp.active ? "LP desativada" : "LP ativada")}><Power className="mr-2 h-4 w-4" />{lp.active ? "Desativar" : "Ativar"}</Button>
                  <Confirm
                    trigger={<Button variant="outline" className="h-11 text-destructive" aria-label={`Excluir ${lp.title}`}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>}
                    title="Excluir landing page?" description={<>O link <code>/lp/{lp.slug}</code> deixará de funcionar. Os cliques já registrados nas campanhas continuam.</>}
                    confirmLabel="Excluir" onConfirm={async () => { await run(del({ data: { id: lp.id } }), "LP excluída"); }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <LpSheet form={edit} campaigns={campaigns.data ?? []} onClose={() => setEdit(null)} onSave={async (f) => {
        const parsed = landingPageSchema.extend({}).safeParse({ ...f, campaign_id: f.campaign_id || null });
        if (!parsed.success) return { ok: false as const, errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
        const r = await save({ data: { ...parsed.data, ...(f.id ? { id: f.id } : {}) } });
        if (!r.ok) return { ok: false as const, errors: { slug: r.error } };
        toast.success(f.id ? "LP salva" : "LP criada"); void refresh(); setEdit(null);
        return { ok: true as const };
      }} />
    </div>
  );
}

function LpSheet({ form, campaigns, onClose, onSave }: {
  form: Form | null; campaigns: { id: string; name: string; destination_whatsapp: string | null }[]; onClose: () => void;
  onSave: (f: Form) => Promise<{ ok: true } | { ok: false; errors: Record<string, string> }>;
}) {
  return (
    <Sheet open={!!form} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {form && <LpForm key={form.id ?? "new"} initial={form} campaigns={campaigns} onSave={onSave} />}
      </SheetContent>
    </Sheet>
  );
}

function LpForm({ initial, campaigns, onSave }: { initial: Form; campaigns: { id: string; name: string; destination_whatsapp: string | null }[]; onSave: (f: Form) => Promise<{ ok: true } | { ok: false; errors: Record<string, string> }> }) {
  const [f, setF] = useState<Form>(initial);
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const err = (k: string) => errors[k] ? <p className="text-sm text-destructive" role="alert">{errors[k]}</p> : null;
  const camp = campaigns.find((c) => c.id === f.campaign_id);

  async function submit() {
    setSaving(true);
    try { const r = await onSave(f); if (!r.ok) setErrors(r.errors); } finally { setSaving(false); }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{f.id ? "Editar landing page" : "Nova landing page"}</SheetTitle>
        <SheetDescription>Textos, botão de WhatsApp e rastreamento. Campos vazios herdam da campanha.</SheetDescription>
      </SheetHeader>
      <div className="mt-4 space-y-4">
        {!f.id && (
          <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setF((p) => ({
            ...p, headline: LP_TEMPLATE.headline, subheadline: LP_TEMPLATE.subheadline, cta_text: LP_TEMPLATE.cta_text, cta_subtext: LP_TEMPLATE.cta_subtext,
            badge_top: LP_TEMPLATE.badge_top, whatsapp_message: LP_TEMPLATE.whatsapp_message, benefits: LP_TEMPLATE.benefits.map((b) => ({ ...b })), faq: LP_TEMPLATE.faq.map((q) => ({ ...q })),
          }))}><Sparkles className="mr-2 h-4 w-4" />Criar com Modelo Padrão</Button>
        )}

        <div className="space-y-1">
          <Label htmlFor="lp-camp">Campanha associada</Label>
          <select id="lp-camp" className={selectCls} value={f.campaign_id} onChange={(e) => set("campaign_id", e.target.value)}>
            <option value="">Nenhuma (usa Pixel e WhatsApp globais)</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">Os cliques entram nas métricas desta campanha; Pixel e WhatsApp vazios abaixo vêm dela.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="lp-title">Título interno</Label>
            <Input id="lp-title" className="h-11" value={f.title} onChange={(e) => { set("title", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} />
            {err("title")}
          </div>
          <div className="space-y-1">
            <Label htmlFor="lp-slug">Slug da URL</Label>
            <Input id="lp-slug" className="h-11" value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value)); }} />
            {err("slug")}
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="lp-head">Headline</Label>
          <Textarea id="lp-head" rows={2} value={f.headline} onChange={(e) => set("headline", e.target.value)} />
          {err("headline")}
        </div>
        <div className="space-y-1">
          <Label htmlFor="lp-sub">Subtítulo</Label>
          <Textarea id="lp-sub" rows={2} value={f.subheadline} onChange={(e) => set("subheadline", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lp-badge">Selo no topo</Label>
          <Input id="lp-badge" className="h-11" value={f.badge_top} onChange={(e) => set("badge_top", e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="lp-cta">Texto do botão</Label>
            <Input id="lp-cta" className="h-11" value={f.cta_text} onChange={(e) => set("cta_text", e.target.value)} />
            {err("cta_text")}
          </div>
          <div className="space-y-1">
            <Label htmlFor="lp-cta2">Texto abaixo do botão</Label>
            <Input id="lp-cta2" className="h-11" value={f.cta_subtext} onChange={(e) => set("cta_subtext", e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="lp-wa">WhatsApp (DDD + número)</Label>
            <Input id="lp-wa" className="h-11" inputMode="tel" placeholder={camp?.destination_whatsapp ? `Vazio usa ${camp.destination_whatsapp}` : "11999998888"} value={f.whatsapp_number} onChange={(e) => set("whatsapp_number", e.target.value)} />
            {err("whatsapp_number")}
          </div>
          <div className="space-y-1">
            <Label htmlFor="lp-px">Pixel da Meta (opcional)</Label>
            <Input id="lp-px" className="h-11" inputMode="numeric" value={f.meta_pixel_id} onChange={(e) => set("meta_pixel_id", extractMetaPixel(e.target.value))} />
            {err("meta_pixel_id")}
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="lp-msg">Mensagem do WhatsApp</Label>
          <Textarea id="lp-msg" rows={2} placeholder="Olá! Vim pelo anúncio e quero meu teste grátis." value={f.whatsapp_message} onChange={(e) => set("whatsapp_message", e.target.value)} />
          <p className="text-xs text-muted-foreground">O código de rastreio [ABC123] é acrescentado ao final automaticamente.</p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Benefícios (vazio usa os padrões)</legend>
          {f.benefits.map((b, i) => (
            <div key={i} className="flex gap-2">
              <select aria-label="Ícone" className="h-11 w-28 shrink-0 rounded-md border bg-background px-2 text-sm" value={b.icon} onChange={(e) => set("benefits", f.benefits.map((x, j) => j === i ? { ...x, icon: e.target.value } : x))}>
                {BENEFIT_ICONS.map((ic) => <option key={ic} value={ic}>{ICON_LABEL[ic]}</option>)}
              </select>
              <Input aria-label="Texto do benefício" className="h-11" value={b.text} onChange={(e) => set("benefits", f.benefits.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
              <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="Remover benefício" onClick={() => set("benefits", f.benefits.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          {err("benefits")}
          <Button type="button" variant="outline" className="h-11" disabled={f.benefits.length >= 8} onClick={() => set("benefits", [...f.benefits, { icon: "check", text: "" }])}><Plus className="mr-2 h-4 w-4" />Adicionar benefício</Button>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Perguntas frequentes (vazio usa as padrões)</legend>
          {f.faq.map((q, i) => (
            <div key={i} className="space-y-2 rounded-md border p-2">
              <div className="flex gap-2">
                <Input aria-label="Pergunta" className="h-11" placeholder="Pergunta" value={q.question} onChange={(e) => set("faq", f.faq.map((x, j) => j === i ? { ...x, question: e.target.value } : x))} />
                <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="Remover pergunta" onClick={() => set("faq", f.faq.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
              </div>
              <Textarea aria-label="Resposta" rows={2} placeholder="Resposta" value={q.answer} onChange={(e) => set("faq", f.faq.map((x, j) => j === i ? { ...x, answer: e.target.value } : x))} />
            </div>
          ))}
          {err("faq")}
          <Button type="button" variant="outline" className="h-11" disabled={f.faq.length >= 8} onClick={() => set("faq", [...f.faq, { question: "", answer: "" }])}><Plus className="mr-2 h-4 w-4" />Adicionar pergunta</Button>
        </fieldset>

        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.active} onChange={(e) => set("active", e.target.checked)} />Página ativa (visível ao público)</label>

        <Button className="h-12 w-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Salvando…" : "Salvar landing page"}</Button>
      </div>
    </>
  );
}
