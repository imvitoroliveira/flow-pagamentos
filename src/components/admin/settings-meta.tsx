import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Confirm, Tone } from "@/components/admin/confirm";
import { ListSkeleton } from "@/components/admin/list-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/routes/_authenticated/admin.index";
import { getIntegrationSettings, saveIntegrationSetting, testMetaConnection } from "@/lib/admin-actions.functions";
import type { SettingKey } from "@/lib/integration-settings";

type Item = { key: SettingKey; secret: boolean; configured: boolean; source: "painel" | "servidor" | null; updatedAt: string | null; value: string | null };

const FIELDS: { key: SettingKey; label: string; help: string; placeholder: string }[] = [
  { key: "META_CAPI_TOKEN", label: "Token da API de Conversões (Meta)", help: "Gerenciador de Eventos → seu Pixel → Configurações → API de Conversões → Gerar token de acesso. Por segurança, depois de salvo ele não é mais exibido.", placeholder: "Cole o token aqui" },
  { key: "META_PIXEL_ID", label: "Pixel ID padrão", help: "Usado nas campanhas que não têm Pixel ID próprio. Aceita só o número ou o código completo do pixel.", placeholder: "Ex.: 123456789012345" },
  { key: "META_TEST_EVENT_CODE", label: "Código de teste (opcional)", help: "Gerenciador de Eventos → Testar eventos. Enquanto estiver preenchido, as vendas vão SÓ para a aba de teste da Meta. Apague para valer de verdade.", placeholder: "Ex.: TEST12345" },
];

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : null);

export function MetaSettings() {
  const fetchSettings = useServerFn(getIntegrationSettings);
  const save = useServerFn(saveIntegrationSetting);
  const test = useServerFn(testMetaConnection);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings-meta"], queryFn: () => fetchSettings() });
  const [drafts, setDrafts] = useState<Partial<Record<SettingKey, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <ListSkeleton />;
  const { tableReady, testMode } = q.data;
  const items = q.data.items as Item[];

  const refresh = () => { void qc.invalidateQueries({ queryKey: ["settings-meta"] }); void qc.invalidateQueries({ queryKey: ["settings-integrations"] }); };
  const persist = async (key: SettingKey, value: string, okMsg: string) => {
    setBusy(key);
    try {
      const r = await save({ data: { key, value } });
      if (r.ok) { toast.success(okMsg); setDrafts((d) => ({ ...d, [key]: undefined })); refresh(); }
      else toast.error(r.error);
    } catch { toast.error("Não foi possível salvar agora."); }
    finally { setBusy(null); }
  };
  const runTest = async () => {
    setBusy("test");
    try {
      const r = await test();
      if (r.ok) toast.success("Evento de teste enviado. Confira em Gerenciador de Eventos → Testar eventos.");
      else toast.error(r.error);
    } catch { toast.error("Não foi possível executar o teste."); }
    finally { setBusy(null); }
  };

  return (
    <section className="glass space-y-4 rounded-2xl border p-4" aria-labelledby="meta-title">
      <div className="space-y-1">
        <h2 id="meta-title" className="text-base font-semibold">Meta (Facebook Ads) — enviar vendas para otimizar anúncios</h2>
        <p className="text-sm text-muted-foreground">Preencha aqui e vale na hora, sem mexer no código. O Pixel ID de cada campanha continua na própria campanha.</p>
      </div>

      {!tableReady && (
        <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          A tabela que guarda estas configurações ainda não existe no banco. Peça ao Lovable para aplicar a migração <code>0008_integration_settings</code> e recarregue esta página. Enquanto isso, valem as variáveis configuradas no servidor.
        </p>
      )}
      {testMode && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <span><b>Modo de teste ligado:</b> as vendas reais NÃO estão sendo contabilizadas na Meta, só aparecem em “Testar eventos”.</span>
          {items.find((i) => i.key === "META_TEST_EVENT_CODE")?.source === "painel" ? (
            <Confirm
              trigger={<Button variant="outline" className="h-11">Sair do modo de teste</Button>}
              title="Sair do modo de teste?" confirmLabel="Sair do modo de teste"
              description="O código de teste será apagado e as próximas vendas de anúncios da Meta passarão a valer de verdade."
              onConfirm={() => persist("META_TEST_EVENT_CODE", "", "Modo de teste desligado")}
            />
          ) : (
            <span className="text-xs text-muted-foreground">O código está definido no servidor (variável META_TEST_EVENT_CODE): remova-o lá para sair do teste.</span>
          )}
        </div>
      )}

      <div className="space-y-5">
        {FIELDS.map((f) => {
          const it = items.find((i) => i.key === f.key);
          const draft = drafts[f.key];
          const shown = draft ?? (it?.secret ? "" : (it?.value ?? ""));
          const dirty = draft !== undefined && draft.trim() !== "" && draft.trim() !== (it?.value ?? "");
          const id = `meta-${f.key}`;
          return (
            <div key={f.key} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={id}>{f.label}</Label>
                {it?.configured
                  ? <Tone tone="ok">{it.source === "painel" ? `Salvo no painel${it.updatedAt ? ` · ${fmt(it.updatedAt)}` : ""}` : "Configurado no servidor"}</Tone>
                  : <Tone tone="muted">Não configurado</Tone>}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id={id} className="h-11" autoComplete="off" spellCheck={false}
                  type={it?.secret ? "password" : "text"}
                  placeholder={it?.secret && it.configured ? "Cole um novo token para trocar" : f.placeholder}
                  value={shown} disabled={!tableReady}
                  onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))} />
                <Button className="h-11" disabled={!tableReady || !dirty || busy !== null}
                  onClick={() => persist(f.key, draft ?? "", "Salvo")}>
                  {busy === f.key ? "Salvando..." : "Salvar"}
                </Button>
                {it?.source === "painel" && (
                  <Confirm
                    trigger={<Button variant="outline" className="h-11" disabled={busy !== null}>Remover</Button>}
                    title={`Remover ${f.label}?`} confirmLabel="Remover"
                    description={it.secret ? "O token salvo no painel será apagado. Sem token (e sem variável no servidor), nenhuma venda é enviada à Meta." : "O valor salvo no painel será apagado."}
                    onConfirm={() => persist(f.key, "", "Removido")}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">{f.help}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button variant="outline" className="h-11" disabled={busy !== null} onClick={runTest}>
          {busy === "test" ? "Enviando..." : "Enviar evento de teste"}
        </Button>
        <p className="text-xs text-muted-foreground">Precisa de token, Pixel ID padrão e código de teste salvos. Vai só para “Testar eventos”, sem afetar dados reais.</p>
      </div>
    </section>
  );
}
