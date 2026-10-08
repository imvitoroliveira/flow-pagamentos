import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil, Plus, Send, Trash2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle } from "@/components/admin/coming-soon";
import { Confirm, Tone } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { deleteSeller, saveSeller, testSellerTelegram } from "@/lib/admin-actions.functions";
import { sellerSchema, type SellerInput } from "@/lib/admin-schemas";
import { useAdminFilters } from "./admin";
import { brl, Card, dtSP, Empty, ErrorState, num, pct, ratio, useRpc, type Breakdown } from "./admin.index";

export const Route = createFileRoute("/_authenticated/admin/vendedores")({
  head: () => ({ meta: [{ title: "Vendedores — Admin NATV" }, { name: "description", content: "Vendedores, Telegram e desempenho NATV." }, { property: "og:title", content: "Vendedores — Admin NATV" }, { property: "og:description", content: "Vendedores, Telegram e desempenho NATV." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: SellersPage,
});

type Seller = { id: string; name: string; telegram_chat_id: string | null; active: boolean; telegram_tested_at: string | null };

function SellersPage() {
  const f = useAdminFilters();
  const q = useQuery({
    queryKey: ["sellers-full"],
    queryFn: async () => {
      const [s, c, o] = await Promise.all([
        supabase.from("sellers").select("*").order("name"),
        supabase.from("campaigns").select("seller_id, active"),
        supabase.from("orders").select("seller_id").not("seller_id", "is", null),
      ]);
      if (s.error) throw s.error;
      const activeCamps = new Map<string, number>(), orders = new Map<string, number>();
      (c.data ?? []).forEach((x) => x.active && x.seller_id && activeCamps.set(x.seller_id, (activeCamps.get(x.seller_id) ?? 0) + 1));
      (o.data ?? []).forEach((x) => x.seller_id && orders.set(x.seller_id, (orders.get(x.seller_id) ?? 0) + 1));
      return { sellers: s.data as Seller[], activeCamps, orders };
    },
  });
  const bd = useRpc<Breakdown>("admin_breakdown", { p_from: f.from, p_to: f.to, p_campaign: f.campaign, p_seller: null, p_dim: "seller" }, ["seller", f.from, f.to, f.campaign]);
  const m = useMemo(() => new Map((bd.data ?? []).map((r) => [r.key, r])), [bd.data]);
  const [editing, setEditing] = useState<Seller | "new" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Vendedores" subtitle="Quem recebe as notificações de venda no Telegram" />
        <Button className="h-11" onClick={() => setEditing("new")}><Plus aria-hidden /> Novo vendedor</Button>
      </div>
      <section className="glass flex gap-3 rounded-2xl border p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">Como obter o chat ID</p>
          <ol className="list-decimal space-y-0.5 pl-4 text-muted-foreground">
            <li>O vendedor abre o bot da NATV no Telegram e envia <b>/start</b> (sem isso o bot não consegue escrever).</li>
            <li>Depois conversa com um bot utilitário como <b>@userinfobot</b>, que responde com o ID numérico.</li>
            <li>Cole o número aqui e use "Enviar mensagem de teste". Grupos têm IDs que começam com "-".</li>
          </ol>
        </div>
      </section>
      {q.isError ? <Card><ErrorState onRetry={() => q.refetch()} /></Card> : !q.data ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
      ) : !q.data.sellers.length ? (
        <Card><Empty msg="Nenhum vendedor cadastrado." hint="Cadastre um vendedor para vinculá-lo às campanhas." /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {q.data.sellers.map((s) => (
            <SellerCard key={s.id} s={s} m={m.get(s.id)} loadingM={!bd.data} camps={q.data.activeCamps.get(s.id) ?? 0}
              hasOrders={(q.data.orders.get(s.id) ?? 0) > 0} onEdit={() => setEditing(s)} />
          ))}
        </div>
      )}
      {editing && <SellerSheet key={editing === "new" ? "new" : editing.id} s={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SellerCard({ s, m, loadingM, camps, hasOrders, onEdit }: { s: Seller; m: Breakdown[number] | undefined; loadingM: boolean; camps: number; hasOrders: boolean; onEdit: () => void }) {
  const qc = useQueryClient();
  const test = useServerFn(testSellerTelegram);
  const save = useServerFn(saveSeller);
  const del = useServerFn(deleteSeller);
  const [testing, setTesting] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["sellers-full"] }); qc.invalidateQueries({ queryKey: ["filter-sellers"] }); qc.invalidateQueries({ queryKey: ["seller-options"] }); };
  const stats = [["Campanhas ativas", num(camps)], ["Compras", loadingM ? null : num(m?.paid ?? 0)], ["Receita", loadingM ? null : brl(m?.revenue_cents ?? 0)], ["Conversão", loadingM ? null : pct(ratio(m?.paid ?? 0, m?.clicks ?? 0))]];
  return (
    <article className="glass flex min-w-0 flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-display font-semibold">{s.name}</h2>
          <p className="text-xs text-muted-foreground">Telegram: {s.telegram_chat_id ?? "não informado"}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {s.active ? <Tone tone="ok">Ativo</Tone> : <Tone tone="muted">Inativo</Tone>}
          {s.telegram_tested_at ? <Tone tone="info">Testado</Tone> : <Tone tone="warn">Não testado</Tone>}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2">
        {stats.map(([l, v]) => <div key={l} className="rounded-lg bg-muted/30 p-2"><dt className="text-[11px] text-muted-foreground">{l}</dt><dd className="text-sm font-semibold">{v ?? <Skeleton className="h-4 w-12" />}</dd></div>)}
      </dl>
      {s.telegram_tested_at && <p className="text-xs text-muted-foreground">Último teste OK: {dtSP(s.telegram_tested_at)}</p>}
      <div className="flex flex-wrap gap-1">
        <Button variant="outline" className="h-11" disabled={!s.telegram_chat_id || testing} onClick={async () => {
          setTesting(true);
          try { const r = await test({ data: { id: s.id } }); if (r.ok) { toast.success("Mensagem de teste enviada"); refresh(); } else toast.error(r.error); }
          catch { toast.error("Falha ao enviar o teste"); } finally { setTesting(false); }
        }}><Send aria-hidden /> {testing ? "Enviando…" : "Enviar mensagem de teste"}</Button>
        <Button variant="outline" className="h-11" onClick={onEdit}><Pencil aria-hidden /> Editar</Button>
        {hasOrders || camps > 0 ? (
          <Confirm trigger={<Button variant="ghost" className="h-11">{s.active ? "Desativar" : "Reativar"}</Button>}
            title={s.active ? "Desativar vendedor?" : "Reativar vendedor?"}
            description={s.active ? "Este vendedor tem pedidos ou campanhas, então será desativado em vez de excluído. O histórico continua." : "O vendedor volta a aparecer nas opções."}
            onConfirm={async () => { const r = await save({ data: { name: s.name, telegram_chat_id: s.telegram_chat_id ?? "", active: !s.active, id: s.id } }); if (r.ok) refresh(); else toast.error(r.error); }} />
        ) : (
          <Confirm trigger={<Button variant="ghost" className="h-11 text-destructive"><Trash2 aria-hidden /> Excluir</Button>}
            title="Excluir vendedor?" confirmLabel="Excluir" description="Este vendedor não tem pedidos nem campanhas. A exclusão não pode ser desfeita."
            onConfirm={async () => { const r = await del({ data: { id: s.id } }); if (r.ok) { toast.success("Vendedor excluído"); refresh(); } else toast.error(r.error); }} />
        )}
      </div>
    </article>
  );
}

function SellerSheet({ s, onClose }: { s: Seller | null; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveSeller);
  const form = useForm<SellerInput>({ resolver: zodResolver(sellerSchema), defaultValues: { name: s?.name ?? "", telegram_chat_id: s?.telegram_chat_id ?? "", active: s?.active ?? true } });
  const { register, watch, setValue, formState: { errors, isSubmitting } } = form;
  const submit = form.handleSubmit(async (v) => {
    const r = await save({ data: { ...v, ...(s ? { id: s.id } : {}) } });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Vendedor salvo");
    ["sellers-full", "filter-sellers", "seller-options"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    onClose();
  });
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>{s ? "Editar vendedor" : "Novo vendedor"}</SheetTitle><SheetDescription>Campos com * são obrigatórios.</SheetDescription></SheetHeader>
        <form onSubmit={submit} className="grid gap-4 px-4" noValidate>
          <div className="grid gap-1.5"><Label htmlFor="sf-name">Nome *</Label><Input id="sf-name" className="h-11" {...register("name")} />{errors.name && <p role="alert" className="text-xs text-destructive">{errors.name.message}</p>}</div>
          <div className="grid gap-1.5"><Label htmlFor="sf-chat">Telegram chat ID</Label><Input id="sf-chat" className="h-11 font-mono" inputMode="numeric" placeholder="123456789" {...register("telegram_chat_id")} />{errors.telegram_chat_id && <p role="alert" className="text-xs text-destructive">{errors.telegram_chat_id.message}</p>}</div>
          <div className="flex min-h-11 items-center justify-between"><Label htmlFor="sf-active">Ativo</Label><Switch id="sf-active" checked={watch("active")} onCheckedChange={(v) => setValue("active", v)} /></div>
          <Button type="submit" className="h-11" disabled={isSubmitting}>{isSubmitting ? "Salvando…" : "Salvar"}</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
