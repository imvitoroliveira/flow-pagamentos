import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle } from "@/components/admin/coming-soon";
import { Tone } from "@/components/admin/confirm";
import { Pager, PAGE_SIZE, ListSkeleton } from "@/components/admin/list-controls";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAdminFilters } from "./admin";
import { brl, Card, dtSP, Empty, ErrorState, num } from "./admin.index";

export const Route = createFileRoute("/_authenticated/admin/funil")({
  head: () => ({ meta: [{ title: "Funil e sessões — Admin NATV" }, { name: "description", content: "Funil e sessões no painel NATV." }, { property: "og:title", content: "Funil e sessões — Admin NATV" }, { property: "og:description", content: "Funil e sessões no painel NATV." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: FunnelPage,
});

const STAGES = [
  { value: "all", label: "Todas" },
  { value: "pagina", label: "Página" },
  { value: "checkout", label: "Checkout" },
  { value: "pix", label: "PIX gerado" },
  { value: "abandonou", label: "Abandonou" },
  { value: "pago", label: "Pago" },
  { value: "falha_renovacao", label: "Falha na renovação" },
] as const;
type Stage = (typeof STAGES)[number]["value"];

type ToneValue = Parameters<typeof Tone>[0]["tone"];

const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.value, s.label]));
const STAGE_TONE: Record<string, ToneValue> = {
  pagina: "muted",
  checkout: "info",
  pix: "warn",
  abandonou: "bad",
  pago: "ok",
  falha_renovacao: "bad",
};
const PATH_LABEL: Record<string, string> = {
  clique: "Clique",
  pagina: "Página",
  checkout: "Checkout",
  pix: "PIX",
  pago: "Pago",
  renovado: "Renovado",
};

type SessionRow = {
  session_id: string;
  started_at: string;
  ref_code: string | null;
  stage: string;
  order_status: string | null;
  amount_cents: number | null;
  campaign_name: string | null;
  visitor: string;
  path: string[];
};
type SessionsPayload = { total: number; all: number; counts: Record<string, number>; rows: SessionRow[] };

function FunnelPage() {
  const f = useAdminFilters();
  const [stage, setStage] = useState<Stage>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [f.from, f.to, f.campaign, f.seller]);

  const sessions = useQuery({
    queryKey: ["funnel-sessions", f.from, f.to, f.campaign, f.seller, stage, query, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const args = {
        p_from: f.from,
        p_to: f.to,
        p_campaign: f.campaign,
        p_seller: f.seller,
        p_stage: stage,
        p_search: query || null,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      };
      const { data, error } = await supabase.rpc("admin_sessions", args as never);
      if (error) throw error;
      return data as unknown as SessionsPayload;
    },
  });

  const data = sessions.data;

  return (
    <div className="space-y-4">
      <PageTitle title="Funil e sessões" subtitle="Jornada de cada visitante, da página ao pagamento" />

      <div role="group" aria-label="Filtrar por etapa" className="flex flex-wrap gap-2">
        {STAGES.map((s) => {
          const n = s.value === "all" ? data?.all : (data?.counts[s.value] ?? 0);
          const active = stage === s.value;
          return (
            <button
              key={s.value}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setStage(s.value);
                setPage(0);
              }}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                active ? "border-primary bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
              {n !== undefined && <span className="text-xs tabular-nums">{num(n)}</span>}
            </button>
          );
        })}
      </div>

      <div className="grid gap-1 md:max-w-sm">
        <Label htmlFor="funnel-search">Buscar sessão</Label>
        <Input
          id="funnel-search"
          className="h-11"
          placeholder="E-mail, usuário, código ou sessão"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {sessions.isError ? (
        <Card><ErrorState onRetry={() => sessions.refetch()} /></Card>
      ) : !data ? (
        <ListSkeleton />
      ) : !data.rows.length ? (
        <Card><Empty msg="Nenhuma sessão neste filtro." hint="Ajuste o período, a busca ou a etapa." /></Card>
      ) : (
        <ul className="space-y-2">
          {data.rows.map((row) => (
            <li key={row.session_id} className="glass rounded-2xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.visitor}</p>
                  <p className="text-xs text-muted-foreground">
                    {dtSP(row.started_at)} · {row.campaign_name ?? "Sem campanha"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Tone tone={STAGE_TONE[row.stage] ?? "muted"}>{STAGE_LABEL[row.stage] ?? row.stage}</Tone>
                  {row.amount_cents ? <span className="text-sm font-semibold">{brl(row.amount_cents)}</span> : null}
                </div>
              </div>
              <ol aria-label="Etapas percorridas" className="mt-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                {row.path.map((p, i) => (
                  <li key={`${p}-${i}`} className="rounded-full bg-muted px-2 py-0.5">
                    {PATH_LABEL[p] ?? p}
                  </li>
                ))}
              </ol>
              {row.ref_code && <p className="mt-2 text-xs text-muted-foreground">Código {row.ref_code}</p>}
            </li>
          ))}
        </ul>
      )}

      <Pager page={page} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
