import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, Loader2, MessageCircle, Sparkles, Timer, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrder, getOrderStatus, getPlans, trackEvent } from "@/lib/checkout.functions";
import { validateUsername } from "@/lib/renewal.functions";
import { cn } from "@/lib/utils";

const plansQuery = queryOptions({ queryKey: ["plans"], queryFn: () => getPlans() });
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Slug = "mensal" | "trimestral" | "semestral";

export const Route = createFileRoute("/pagar")({
  validateSearch: z.object({
    ref: z.string().max(16).optional().catch(undefined),
    plano: z.enum(["mensal", "trimestral", "semestral"]).optional().catch(undefined),
  }),
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
  errorComponent: () => <p className="p-8 text-center">Erro ao carregar planos. Recarregue a página.</p>,
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

const formSchema = z.object({
  user: z.string().trim().min(2, "Informe o usuário do aplicativo").max(64).regex(/^\S+$/, "O usuário não pode conter espaços"),
  name: z.string().trim().min(2, "Informe seu nome").max(100),
  phone: z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().regex(/^\d{10,13}$/, "WhatsApp inválido (DDD + número)")),
  email: z.string().trim().max(255).email("E-mail inválido").or(z.literal("")),
});
type FormState = { user: string; name: string; phone: string; email: string };
type Pix = { order_id: string; brcode: string; qr: string; amount_cents: number; expires_at: string };

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function PagarPage() {
  const { data: plans } = useSuspenseQuery(plansQuery);
  const search = Route.useSearch();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [slug, setSlug] = useState<Slug>(search.plano ?? "semestral");
  const [form, setForm] = useState<FormState>({ user: "", name: "", phone: "", email: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(false);
  const [pix, setPix] = useState<Pix | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const startedRef = useRef(false);
  const track = useServerFn(trackEvent);
  const create = useServerFn(createOrder);
  const validate = useServerFn(validateUsername);

  const mensal = plans.find((p) => p.slug === "mensal");
  const plan = plans.find((p) => p.slug === slug) ?? plans[0];

  useEffect(() => {
    const r = search.ref?.toUpperCase() || localStorage.getItem("natv_ref");
    if (search.ref) localStorage.setItem("natv_ref", search.ref.toUpperCase());
    setRef(r || null);
    track({ data: { session_id: sessionId(), ref_code: r || null, type: "page_view", metadata: { plano: search.plano ?? null } } }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function goToData() {
    setStep(2);
    if (!startedRef.current) {
      startedRef.current = true;
      track({ data: { session_id: sessionId(), ref_code: ref, type: "checkout_started", metadata: { plano: slug } } }).catch(() => {});
    }
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      const errs: typeof errors = {};
      for (const i of parsed.error.issues) errs[i.path[0] as keyof FormState] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const v = await validate({ data: { username: parsed.data.user } });
      if (!v.exists) {
        setErrors({ user: "Usuário não encontrado. Confira o usuário do aplicativo." });
        return;
      }
      const r = await create({
        data: {
          plan_slug: slug,
          panel_username: parsed.data.user,
          customer_name: parsed.data.name,
          customer_phone: parsed.data.phone,
          customer_email: parsed.data.email,
          ref_code: ref,
          session_id: sessionId(),
        },
      });
      setPix(r);
      setStep(3);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível gerar o PIX. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
          <Tv className="size-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">NATV</h1>
          <p className="text-sm text-muted-foreground">Renove em menos de 1 minuto</p>
        </div>
      </header>

      {step < 3 && <Steps step={step} />}

      {step === 1 && (
        <section className="space-y-3">
          <h2 className="mb-1 text-lg font-semibold">Escolha seu plano</h2>
          {plans.map((p) => {
            const sel = p.slug === slug;
            const perMonth = p.price_cents / p.months;
            const saving = mensal ? mensal.price_cents * p.months - p.price_cents : 0;
            const best = p.slug === "semestral";
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => setSlug(p.slug as Slug)}
                className={cn(
                  "relative w-full rounded-2xl border bg-card p-4 text-left transition active:scale-[0.99]",
                  sel ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/40",
                  best && "pt-6",
                )}
              >
                {best && (
                  <span className="absolute -top-3 left-4 inline-flex items-center gap-1 rounded-full bg-gradient-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-glow">
                    <Sparkles className="size-3" /> Melhor custo-benefício
                  </span>
                )}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", sel && "border-primary bg-primary")}>
                      {sel && <Check className="size-3 text-primary-foreground" />}
                    </span>
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.months} {p.months > 1 ? "meses" : "mês"} · {brl(perMonth)}/mês
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl font-bold text-primary">{brl(p.price_cents)}</p>
                    {saving > 0 && <p className="text-xs font-medium text-success">Economize {brl(saving)}</p>}
                  </div>
                </div>
              </button>
            );
          })}
          <CTA onClick={goToData}>Continuar com {plan?.name}</CTA>
        </section>
      )}

      {step === 2 && plan && (
        <form onSubmit={pay} noValidate className="space-y-5">
          <BackBtn onClick={() => setStep(1)} />
          <div className="space-y-4 rounded-2xl border bg-card p-5">
            <Field label="Usuário do aplicativo *" value={form.user} error={errors.user} autoComplete="off"
              onChange={(v) => setForm({ ...form, user: v.replace(/\s/g, "") })} />
            <Field label="Nome *" value={form.name} error={errors.name} autoComplete="name"
              onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="WhatsApp *" inputMode="tel" placeholder="(11) 99999-9999" value={form.phone} error={errors.phone} autoComplete="tel"
              onChange={(v) => setForm({ ...form, phone: maskPhone(v) })} />
            <Field label="E-mail" type="email" value={form.email} error={errors.email} autoComplete="email"
              onChange={(v) => setForm({ ...form, email: v })} />
          </div>
          <div className="rounded-2xl border border-primary/30 bg-accent/40 p-4 text-sm">
            Você está renovando o usuário <b className="text-primary">{form.user.trim() || "—"}</b> com o plano{" "}
            <b className="text-primary">{plan.name}</b> por <b className="text-primary">{brl(plan.price_cents)}</b>.
          </div>
          <CTA type="submit" disabled={loading}>
            {loading ? <><Loader2 className="animate-spin" /> Gerando PIX…</> : `Pagar ${brl(plan.price_cents)} com PIX`}
          </CTA>
        </form>
      )}

      {step === 3 && pix && <PixStep pix={pix} user={form.user} onRestart={() => { setPix(null); setStep(1); }} />}
    </main>
  );
}

function Steps({ step }: { step: number }) {
  const labels = ["Plano", "Dados", "PIX"];
  return (
    <ol className="mb-6 flex gap-2">
      {labels.map((l, i) => (
        <li key={l} className="flex-1">
          <div className={cn("h-1.5 rounded-full", i < step ? "bg-gradient-primary" : "bg-muted")} />
          <p className={cn("mt-1.5 text-xs", i < step ? "text-foreground" : "text-muted-foreground")}>{l}</p>
        </li>
      ))}
    </ol>
  );
}

function CTA(props: React.ComponentProps<typeof Button>) {
  return <Button size="lg" {...props} className="h-14 w-full rounded-2xl bg-gradient-primary text-base font-semibold shadow-glow" />;
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
      <ArrowLeft className="size-4" /> Trocar plano
    </button>
  );
}

function Field(props: {
  label: string; value: string; onChange: (v: string) => void; error?: string | undefined;
  type?: string; placeholder?: string; inputMode?: "tel"; autoComplete?: string;
}) {
  const id = props.label.replace(/\W/g, "");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{props.label}</Label>
      <Input id={id} type={props.type ?? "text"} inputMode={props.inputMode} placeholder={props.placeholder}
        autoComplete={props.autoComplete} value={props.value} aria-invalid={!!props.error}
        onChange={(e) => props.onChange(e.target.value)}
        className={cn("h-12 rounded-xl", props.error && "border-destructive")} />
      {props.error && <p className="text-xs text-destructive">{props.error}</p>}
    </div>
  );
}

function useCountdown(iso: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, new Date(iso).getTime() - now);
  return { left, label: `${String(Math.floor(left / 60000)).padStart(2, "0")}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}` };
}

function PixStep({ pix, user, onRestart }: { pix: Pix; user: string; onRestart: () => void }) {
  const fetchStatus = useServerFn(getOrderStatus);
  const { left, label } = useCountdown(pix.expires_at);
  const { data, isError } = useQuery({
    queryKey: ["order", pix.order_id],
    queryFn: () => fetchStatus({ data: { id: pix.order_id } }),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "paid" || s === "renewed" || s === "renewal_failed" || left === 0 ? false : 4000;
    },
  });
  const qrSrc = useMemo(() => (pix.qr.startsWith("data:") ? pix.qr : `data:image/png;base64,${pix.qr}`), [pix.qr]);
  const status = data?.status;

  if (status === "paid" || status === "renewed" || status === "renewal_failed") {
    const until = data?.valid_until ? new Date(data.valid_until).toLocaleDateString("pt-BR") : null;
    const wa = data?.whatsapp?.replace(/\D/g, "");
    const msg = encodeURIComponent(`Olá! Acabei de pagar o plano ${data?.plan_name ?? ""} do usuário ${user}.`);
    return (
      <div className="rounded-2xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-gradient-primary shadow-glow">
          <Check className="size-8 text-primary-foreground" />
        </div>
        <h2 className="text-2xl font-bold">Pagamento confirmado!</h2>
        <p className="mt-2 text-muted-foreground">
          {status === "renewed" ? "Sua assinatura foi renovada." : "Recebemos seu pagamento. A renovação será concluída em instantes."}
        </p>
        <div className="my-6 space-y-1 rounded-xl bg-muted p-4 text-sm">
          <p>Usuário: <b>{user}</b></p>
          <p>Plano: <b className="text-primary">{data?.plan_name}</b></p>
          {until && <p>Nova validade: <b className="text-primary">{until}</b></p>}
        </div>
        {wa && (
          <CTA asChild>
            <a href={`https://wa.me/${wa}?text=${msg}`} target="_blank" rel="noreferrer"><MessageCircle /> Falar no WhatsApp</a>
          </CTA>
        )}
      </div>
    );
  }

  if (left === 0 || status === "expired" || status === "cancelled") {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-8 text-center">
        <h2 className="text-xl font-bold">PIX expirado</h2>
        <p className="text-sm text-muted-foreground">O código expirou antes do pagamento. Gere um novo para continuar.</p>
        <CTA onClick={onRestart}>Gerar novo PIX</CTA>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border bg-card p-6 text-center">
      <div>
        <p className="text-sm text-muted-foreground">Total</p>
        <p className="font-display text-4xl font-bold text-primary">{brl(pix.amount_cents)}</p>
      </div>
      <img src={qrSrc} alt="QR Code PIX" className="mx-auto size-60 rounded-xl bg-foreground p-2" />
      <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm">
        <Timer className="size-4 text-warning" /> Expira em <b className="tabular-nums">{label}</b>
      </p>
      <CTA onClick={() => navigator.clipboard.writeText(pix.brcode).then(() => toast.success("Código PIX copiado!"), () => toast.error("Não foi possível copiar"))}>
        <Copy /> Copiar código PIX
      </CTA>
      <ol className="space-y-1 text-left text-xs text-muted-foreground">
        <li>1. Abra o app do seu banco e escolha PIX copia e cola.</li>
        <li>2. Cole o código e confirme o pagamento.</li>
        <li>3. Esta tela atualiza sozinha quando o pagamento cair.</li>
      </ol>
      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {isError ? "Reconectando…" : "Aguardando pagamento…"}
      </p>
    </div>
  );
}
