import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Loader2, MessageCircle, PlusCircle, TimerReset } from "lucide-react";
import { createTestFn, extendTestFn, listTestsFn, type TestRow } from "@/lib/tests.functions";
import {
  durationLabel, formatTestMessage, type CreatedTest, isTestActive, maskPhoneBR, suggestUsername, testWhatsappUrl, UI_DURATIONS, DEFAULT_TEST_MINUTES,
} from "@/lib/test-accounts";
import { PUBLIC_SITE_URL } from "@/lib/site-url";
import { PageTitle } from "@/components/admin/coming-soon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, dtSP, Empty, ErrorState } from "./admin.index";

export const Route = createFileRoute("/_authenticated/admin/testes")({
  head: () => ({ meta: [{ title: "Testes Rápidos — Admin NATV" }, { name: "robots", content: "noindex" }] }),
  component: TestesPage,
});

async function copy(text: string, ok = "Mensagem copiada.") {
  try { await navigator.clipboard.writeText(text); toast.success(ok); } catch { toast.error("Não foi possível copiar. Selecione o texto e copie manualmente."); }
}

function TestesPage() {
  const qc = useQueryClient();
  const create = useServerFn(createTestFn);
  const list = useServerFn(listTestsFn);
  const extend = useServerFn(extendTestFn);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [minutes, setMinutes] = useState<number>(DEFAULT_TEST_MINUTES);
  const [custom, setCustom] = useState("");
  const [userEdited, setUserEdited] = useState(false);
  const suggested = suggestUsername(name);
  const username = userEdited ? custom : suggested;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CreatedTest | null>(null);
  const [extending, setExtending] = useState<string | null>(null);

  const tests = useQuery({
    queryKey: ["admin-tests"], staleTime: 15_000,
    queryFn: async () => {
      const r = await list();
      if (!r.ok) throw new Error(r.error);
      return r.tests;
    },
  });

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = await create({ data: { durationMinutes: minutes, customerName: name || undefined, customerPhone: phone || undefined, customUsername: username.length >= 3 ? username : undefined } });
      if (!r.ok) { toast.error(r.error); return; }
      setDone(r.test);
      if (!r.test.saved) toast.warning("Teste criado no painel, mas não entrou no histórico. Copie os dados agora.");
      setName(""); setPhone(""); setCustom(""); setUserEdited(false);
      await qc.invalidateQueries({ queryKey: ["admin-tests"] });
    } catch { toast.error("Não foi possível gerar o teste. Tente novamente."); }
    finally { setBusy(false); }
  }

  async function doExtend(username: string) {
    setExtending(username);
    try {
      const r = await extend({ data: { username } });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("Teste estendido.");
      await qc.invalidateQueries({ queryKey: ["admin-tests"] });
    } catch { toast.error("Não foi possível estender."); }
    finally { setExtending(null); }
  }

  const msgFor = (t: TestRow) => formatTestMessage({ username: t.username, password: t.password, domain: t.domain ?? "natv.pm", minutes: t.duration_minutes, customerName: t.customer_name }, PUBLIC_SITE_URL);

  return (
    <div className="space-y-4">
      <PageTitle title="Testes rápidos" subtitle="Gere uma conta de teste no painel em 1 clique e envie a mensagem de conversão pelo WhatsApp." />

      <Card title="Gerar teste">
        <form onSubmit={generate} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Nome do cliente (opcional)</Label>
              <Input id="t-name" className="h-11" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-phone">WhatsApp do cliente (opcional)</Label>
              <Input id="t-phone" className="h-11" inputMode="tel" placeholder="(99) 99999-9999" value={phone} onChange={(e) => setPhone(maskPhoneBR(e.target.value))} autoComplete="off" />
            </div>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Duração</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Duração do teste">
              {UI_DURATIONS.map((m) => (
                <Button key={m} type="button" role="radio" aria-checked={minutes === m} variant={minutes === m ? "default" : "outline"} className="h-11 min-w-24" onClick={() => setMinutes(m)}>
                  {durationLabel(m)}
                </Button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="t-user">Usuário do teste</Label>
              {userEdited && suggested && custom !== suggested && (
                <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => { setUserEdited(false); setCustom(""); }}>Restaurar sugestão</Button>
              )}
            </div>
            <Input id="t-user" className="h-11 sm:max-w-sm" value={username} maxLength={32} placeholder="Preencha o nome para sugerir" onChange={(e) => { const v = e.target.value.replace(/[^A-Za-z0-9._-]/g, ""); setCustom(v); setUserEdited(v !== ""); }} autoComplete="off" />
            <p className="text-xs text-muted-foreground">Sugerido pelo nome (primeiro + último sobrenome). Edite se quiser. Vazio = o painel gera automaticamente.</p>
          </div>

          <Button type="submit" className="h-11 w-full sm:w-auto" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <PlusCircle aria-hidden />} Gerar Teste Gratuito
          </Button>
        </form>
      </Card>

      <Card title="Testes recentes">
        {tests.isLoading ? <Skeleton className="h-40" /> : tests.isError ? <ErrorState onRetry={() => tests.refetch()} /> : !tests.data?.length ? (
          <Empty msg="Nenhum teste gerado ainda." hint="Os testes criados aqui aparecem nesta lista." />
        ) : (
          <>
            {/* desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="py-2 pr-3">Cliente</th><th className="pr-3">Usuário</th><th className="pr-3">Duração</th><th className="pr-3">Criado</th><th className="pr-3">Expira</th><th className="pr-3">Status</th><th><span className="sr-only">Ações</span></th></tr>
                </thead>
                <tbody>
                  {tests.data.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="py-2 pr-3"><div>{t.customer_name ?? "—"}</div><div className="text-xs text-muted-foreground">{t.customer_phone ? maskPhoneBR(t.customer_phone.replace(/^55/, "")) : "—"}</div></td>
                      <td className="pr-3 font-mono text-xs">{t.username}</td>
                      <td className="pr-3">{durationLabel(t.duration_minutes)}</td>
                      <td className="pr-3">{dtSP(t.created_at)}</td>
                      <td className="pr-3">{dtSP(t.expires_at)}</td>
                      <td className="pr-3"><StatusBadge t={t} /></td>
                      <td><RowActions t={t} msg={msgFor(t)} extending={extending === t.username} onExtend={() => doExtend(t.username)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* mobile */}
            <ul className="space-y-3 md:hidden">
              {tests.data.map((t) => (
                <li key={t.id} className="space-y-2 rounded-xl border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="truncate font-medium">{t.customer_name ?? "Sem nome"}</p><p className="font-mono text-xs text-muted-foreground">{t.username}</p></div>
                    <StatusBadge t={t} />
                  </div>
                  <p className="text-xs text-muted-foreground">{durationLabel(t.duration_minutes)} · criado {dtSP(t.created_at)} · expira {dtSP(t.expires_at)}</p>
                  <RowActions t={t} msg={msgFor(t)} extending={extending === t.username} onExtend={() => doExtend(t.username)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {done && <SuccessDialog t={done} onClose={() => setDone(null)} />}
    </div>
  );
}

function StatusBadge({ t }: { t: TestRow }) {
  return isTestActive(t.expires_at) ? <Badge>Ativo</Badge> : <Badge variant="secondary">Expirado</Badge>;
}

function RowActions({ t, msg, extending, onExtend }: { t: TestRow; msg: string; extending: boolean; onExtend: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="h-11" onClick={() => copy(msg)}><Copy aria-hidden /> Copiar mensagem</Button>
      <Button variant="outline" className="h-11" disabled={extending} onClick={onExtend}>
        {extending ? <Loader2 className="animate-spin" aria-hidden /> : <TimerReset aria-hidden />} Estender
      </Button>
      <span className="sr-only">{t.username}</span>
    </div>
  );
}

function SuccessDialog({ t, onClose }: { t: CreatedTest; onClose: () => void }) {
  const wa = testWhatsappUrl(t.customer_phone, t.message);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Teste criado</DialogTitle>
          <DialogDescription>Válido por {durationLabel(t.minutes)} · limite {dtSP(t.expires_at)}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border bg-muted/10 p-3 text-sm">
          <dt className="text-muted-foreground">Usuário</dt><dd className="font-mono font-semibold">{t.username}</dd>
          <dt className="text-muted-foreground">Senha</dt><dd className="font-mono font-semibold">{t.password}</dd>
          <dt className="text-muted-foreground">Servidor</dt><dd className="font-mono font-semibold">{t.domain}</dd>
          <dt className="text-muted-foreground">Expira</dt><dd>{dtSP(t.expires_at)}</dd>
        </dl>
        <div className="space-y-1.5">
          <Label htmlFor="t-msg">Mensagem</Label>
          <textarea id="t-msg" readOnly value={t.message} rows={10} className="w-full rounded-md border bg-background p-2 text-sm" />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-11" onClick={() => copy(t.message)}><Copy aria-hidden /> Copiar Mensagem</Button>
          {wa
            ? <Button asChild className="h-11"><a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden /> Enviar no WhatsApp</a></Button>
            : <Button className="h-11" disabled title="Preencha o WhatsApp do cliente para enviar direto"><MessageCircle aria-hidden /> Enviar no WhatsApp</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
