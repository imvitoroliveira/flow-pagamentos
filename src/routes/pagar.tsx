import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Check, Copy, Loader2, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrder, getOrderStatus, getPlans, trackEvent } from "@/lib/checkout.functions";
import { cn } from "@/lib/utils";

const plansQuery = queryOptions({ queryKey: ["plans"], queryFn: () => getPlans() });
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const Route = createFileRoute("/pagar")({
  validateSearch: z.object({ ref: z.string().optional(), plano: z.string().optional() }),
  loader: ({ context }) => context.queryClient.ensureQueryData(plansQuery),
  head: () => ({
    meta: [
      { title: "Pagar assinatura NATV via PIX" },
      { name: "description", content: "Escolha seu plano NATV e pague com PIX. Renovação automática após o pagamento." },
      { property: "og:title", content: "Pagar assinatura NATV via PIX" },
      { property: "og:description", content: "Escolha seu plano NATV e pague com PIX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: () => <p className="p-8 text-center">Erro ao carregar planos.</p>,
  notFoundComponent: () => <p className="p-8 text-center">Não encontrado.</p>,
  component: PagarPage,
});

function sessionId() {
  let s = localStorage.getItem("natv_sid");
  if (!s) {
    s = crypto.randomUUID();
    localStorage.setItem("natv_sid", s);
  }
  return s;
}

type Pix = { order_id: string; brcode: string; qr: string; amount_cents: number };

function PagarPage() {
  const { data: plans } = useSuspenseQuery(plansQuery);
  const search = Route.useSearch();
  const [planId, setPlanId] = useState(
    plans.find((p) => p.slug === search.plano)?.id ?? plans.find((p) => p.slug === "trimestral")?.id ?? plans[0]?.id,
  );
  const [form, setForm] = useState({ name: "", phone: "", email: "", user: "" });
  const [loading, setLoading] = useState(false);
  const [pix, setPix] = useState<Pix | null>(null);
  const [started, setStarted] = useState(false);
  const track = useServerFn(trackEvent);
  const create = useServerFn(createOrder);

  useEffect(() => {
    track({ data: { session_id: sessionId(), ref_code: search.ref ?? null, type: "page_view" } }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onFocus = () => {
    if (started) return;
    setStarted(true);
    track({ data: { session_id: sessionId(), ref_code: search.ref ?? null, type: "checkout_started" } }).catch(() => {});
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!planId) return;
    setLoading(true);
    try {
      const r = await create({
        data: {
          plan_id: planId,
          customer_name: form.name,
          customer_phone: form.phone.replace(/\D/g, ""),
          customer_email: form.email,
          panel_username: form.user,
          ref_code: search.ref ?? null,
          session_id: sessionId(),
        },
      });
      setPix(r);
    } catch (err) {
      toast.error((err as Error).message || "Erro ao gerar PIX");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-16 pt-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
          <Tv className="size-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">NATV</h1>
          <p className="text-sm text-muted-foreground">Assine ou renove com PIX</p>
        </div>
      </header>

      {pix ? (
        <PixView pix={pix} />
      ) : (
        <form onSubmit={submit} className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Plano</h2>
            {plans.map((p) => {
              const sel = p.id === planId;
              const perMonth = p.price_cents / p.months;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPlanId(p.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-2xl border bg-card p-4 text-left transition",
                    sel ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/40",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn("flex size-5 items-center justify-center rounded-full border", sel && "border-primary bg-primary")}>
                      {sel && <Check className="size-3 text-primary-foreground" />}
                    </span>
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.months} {p.months > 1 ? "meses" : "mês"} · {brl(perMonth)}/mês
                      </p>
                    </div>
                  </div>
                  <span className="font-display text-lg font-bold text-primary">{brl(p.price_cents)}</span>
                </button>
              );
            })}
          </section>

          <section className="space-y-4 rounded-2xl border bg-card p-5">
            <Field label="Nome completo" value={form.name} onFocus={onFocus} onChange={(v) => setForm({ ...form, name: v })} required />
            <Field label="WhatsApp (com DDD)" inputMode="tel" placeholder="11999999999" value={form.phone} onFocus={onFocus} onChange={(v) => setForm({ ...form, phone: v })} required />
            <Field label="E-mail (opcional)" type="email" value={form.email} onFocus={onFocus} onChange={(v) => setForm({ ...form, email: v })} />
            <Field label="Usuário do painel" value={form.user} onFocus={onFocus} onChange={(v) => setForm({ ...form, user: v })} required />
          </section>

          <Button type="submit" size="lg" disabled={loading} className="h-14 w-full rounded-2xl bg-gradient-primary text-base font-semibold shadow-glow">
            {loading ? <Loader2 className="animate-spin" /> : "Gerar PIX"}
          </Button>
        </form>
      )}
    </main>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  inputMode?: "tel";
}) {
  const id = props.label.replace(/\W/g, "");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        id={id}
        type={props.type ?? "text"}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        required={props.required}
        value={props.value}
        onFocus={props.onFocus}
        onChange={(e) => props.onChange(e.target.value)}
        className="h-12 rounded-xl"
      />
    </div>
  );
}

function PixView({ pix }: { pix: Pix }) {
  const fetchStatus = useServerFn(getOrderStatus);
  const { data } = useQuery({
    queryKey: ["order", pix.order_id],
    queryFn: () => fetchStatus({ data: { id: pix.order_id } }),
    refetchInterval: (q) => (q.state.data?.status && q.state.data.status !== "pending" ? false : 4000),
  });
  const status = data?.status ?? "pending";
  const qrSrc = pix.qr.startsWith("data:") ? pix.qr : `data:image/png;base64,${pix.qr}`;

  if (status !== "pending") {
    const ok = status === "renewed";
    return (
      <div className="rounded-2xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-gradient-primary shadow-glow">
          <Check className="size-8 text-primary-foreground" />
        </div>
        <h2 className="text-2xl font-bold">Pagamento confirmado!</h2>
        <p className="mt-2 text-muted-foreground">
          {ok ? "Sua assinatura já foi renovada. Bom streaming!" : "Recebemos seu pagamento. Sua renovação será concluída em instantes pela nossa equipe."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border bg-card p-6 text-center">
      <p className="text-sm text-muted-foreground">Total</p>
      <p className="font-display text-4xl font-bold text-primary">{brl(pix.amount_cents)}</p>
      <img src={qrSrc} alt="QR Code PIX" className="mx-auto size-60 rounded-xl bg-foreground p-2" />
      <Button
        variant="secondary"
        className="h-12 w-full rounded-xl"
        onClick={() => {
          navigator.clipboard.writeText(pix.brcode);
          toast.success("Código PIX copiado");
        }}
      >
        <Copy /> Copiar código PIX
      </Button>
      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Aguardando pagamento…
      </p>
    </div>
  );
}
