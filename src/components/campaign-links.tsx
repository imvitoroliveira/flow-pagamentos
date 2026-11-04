import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Link2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { publicUrl } from "@/lib/site-url";

/** Payment link for a named link inside a campaign: registers the click, then opens /pagar. */
export function paymentLinkOf(slug: string, code: string) {
  return publicUrl(`/r/${slug}?l=${code}&pagar=1`);
}

function makeCode() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(7)), (b) => a[b % a.length]).join("");
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast.success("Link copiado"); } catch { toast.error("Não foi possível copiar"); }
}

type LinkRow = { id: string; label: string; code: string; created_at: string };

/** Named payment links of one campaign. Access is enforced by RLS (admin or the campaign's seller). */
export function CampaignLinks({ campaignId, slug, clicksByLink }: { campaignId: string; slug: string; clicksByLink?: Map<string, number> }) {
  const qc = useQueryClient();
  const key = ["campaign-links", campaignId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("campaign_links").select("id, label, code, created_at").eq("campaign_id", campaignId).order("created_at");
      if (error) throw error;
      return data as LinkRow[];
    },
  });
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const l = label.trim();
    if (l.length < 2 || l.length > 40) { toast.error("O apelido precisa ter de 2 a 40 caracteres"); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("campaign_links").insert({ campaign_id: campaignId, label: l, code: makeCode(), created_by: u.user?.id ?? null });
    setBusy(false);
    if (error) { toast.error("Não foi possível criar o link"); return; }
    setLabel("");
    toast.success("Link criado");
    qc.invalidateQueries({ queryKey: key });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("campaign_links").delete().eq("id", id);
    if (error) { toast.error("Não foi possível remover"); return; }
    qc.invalidateQueries({ queryKey: key });
  }

  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-1.5 text-sm font-medium"><Link2 className="size-4 text-primary" aria-hidden /> Links de pagamento</p>
      {q.isError ? (
        <div className="text-xs text-destructive">Erro ao carregar. <button className="underline" onClick={() => q.refetch()}>Tentar novamente</button></div>
      ) : !q.data ? <Skeleton className="h-11" /> : !q.data.length ? (
        <p className="text-xs text-muted-foreground">Nenhum link ainda. Crie um com um apelido (ex.: "grupo-whats", "story") para saber de onde veio cada venda.</p>
      ) : (
        <ul className="grid gap-1">
          {q.data.map((l) => (
            <li key={l.id} className="flex min-w-0 items-center gap-1 rounded-lg bg-muted/40 p-1 pl-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.label}{clicksByLink && <span className="ml-2 text-xs text-muted-foreground">{clicksByLink.get(l.id) ?? 0} cliques</span>}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{paymentLinkOf(slug, l.code)}</p>
              </div>
              <Button size="icon" variant="ghost" className="size-11 shrink-0" aria-label={`Copiar link ${l.label}`} onClick={() => copy(paymentLinkOf(slug, l.code))}><Copy aria-hidden /></Button>
              <Button size="icon" variant="ghost" className="size-11 shrink-0 text-destructive" aria-label={`Remover link ${l.label}`} onClick={() => remove(l.id)}><Trash2 aria-hidden /></Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex items-end gap-2">
        <div className="grid flex-1 gap-1">
          <Label htmlFor={`nl-${campaignId}`} className="text-xs text-muted-foreground">Apelido do novo link</Label>
          <Input id={`nl-${campaignId}`} className="h-11" maxLength={40} placeholder="ex.: grupo-whats" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <Button type="submit" className="h-11" disabled={busy}><Plus aria-hidden /> Criar</Button>
      </form>
    </div>
  );
}
