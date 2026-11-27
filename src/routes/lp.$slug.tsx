import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Headset, MessageCircle, ShieldCheck, Smartphone, Star, Tv, Wrench, Zap, type LucideIcon } from "lucide-react";
import { getLandingPage } from "@/lib/landing.functions";
import { buildWhatsappUrl, DEVICES, type PublicLanding } from "@/lib/landing";
import { CookieSettings } from "@/components/cookie-settings";
import { canTrack, onConsentChange } from "@/lib/consent";
import { leadEventId, visitorSessionId } from "@/lib/landing-tracking";
import { initPixel, readCookie, trackPixel } from "@/lib/meta-pixel";
import { readStoredRef, REF_KEY, serializeRef, shouldStoreRef } from "@/lib/ref-storage";

// Public, mobile-first landing page for ads: Meta Ads → LP → WhatsApp. Everything above the fold is server-rendered.
export const Route = createFileRoute("/lp/$slug")({
  loader: async ({ params }) => {
    const lp = await getLandingPage({ data: { slug: params.slug } });
    if (!lp) throw redirect({ to: "/pagar" });
    return lp;
  },
  head: ({ loaderData }) => {
    const t = loaderData?.headline ?? "NATV";
    const d = loaderData?.subheadline ?? "Atendimento pelo WhatsApp";
    return { meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] };
  },
  component: LandingPage,
});

const ICONS: Record<string, LucideIcon> = { tv: Tv, zap: Zap, headset: Headset, shield: ShieldCheck, wrench: Wrench, smartphone: Smartphone, check: Check, star: Star };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const refKey = (slug: string) => `natv_lp_ref_${slug}`;

/** Mirrors the ref into localStorage (what /pagar reads), so a later /pagar without ?ref= still attributes the sale. */
function persistRef(ref: string, fresh: boolean) {
  try {
    const now = Date.now();
    if (shouldStoreRef(readStoredRef(localStorage.getItem(REF_KEY), now), ref, fresh)) localStorage.setItem(REF_KEY, serializeRef(ref, now));
  } catch { /* storage bloqueado */ }
}

function LandingPage() {
  const lp: PublicLanding = Route.useLoaderData();
  const refPromise = useRef<Promise<string | null> | null>(null);
  const leadSent = useRef(false);
  const [busy, setBusy] = useState(false);

  async function registerVisit() {
    const allowed = await canTrack("advertising");
    if(allowed && lp.pixelId) await initPixel(lp.pixelId);
    const response = await fetch("/api/public/lp-view",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({slug:lp.slug,sessionId:visitorSessionId(),fbclid:allowed?new URLSearchParams(window.location.search).get("fbclid"):null})});
    if(!response.ok) return null;
    const result = await response.json() as {ref?:string|null};
    if(result.ref) { persistRef(result.ref,true); try {sessionStorage.setItem(refKey(lp.slug),result.ref);}catch{} }
    return result.ref ?? null;
  }
  useEffect(() => {
    refPromise.current=registerVisit().catch(()=>null);
    const unsubscribe=onConsentChange(()=>{refPromise.current=registerVisit().catch(()=>null);});
    const restore=()=>setBusy(false);
    window.addEventListener("pageshow",restore);
    return ()=>{unsubscribe();window.removeEventListener("pageshow",restore);};
  },[lp.slug,lp.pixelId]);

  async function onCta() {
    if(busy || !lp.whatsapp) return;
    setBusy(true);
    let ref:string|null=null;
    try {
      ref=await Promise.race([refPromise.current ?? registerVisit(),sleep(2500).then(()=>null)]);
      if(!ref) ref=await Promise.race([registerVisit(),sleep(1500).then(()=>null)]);
      if(ref) persistRef(ref,false);
      if(ref && !leadSent.current) {
        leadSent.current=true;
        const allowed=await canTrack("advertising");
        const eventId=leadEventId(ref);
        if(allowed && lp.pixelId) {
          await initPixel(lp.pixelId);
          await trackPixel("Lead",{content_name:"whatsapp_click"},eventId);
        }
        const body=JSON.stringify({slug:lp.slug,ref,fbp:allowed?readCookie("_fbp"):null,fbc:allowed?readCookie("_fbc"):null});
        const deliver=async()=> {
          for(let attempt=0;attempt<2;attempt++) {
            try {const response=await fetch("/api/public/lp-lead",{method:"POST",headers:{"Content-Type":"application/json"},keepalive:true,body});if(response.ok) return;}catch{}
          }
          navigator.sendBeacon?.("/api/public/lp-lead",new Blob([body],{type:"application/json"}));
        };
        // Keepalive survives navigation; the server awaits Meta and saves the receipt before returning.
        await Promise.race([deliver(),sleep(1400)]);
      }
    } finally {
      window.location.href=buildWhatsappUrl(lp.whatsapp,lp.message,ref);
      setBusy(false);
    }
  }

  const renderCta = (id: string) => (
    <div className="space-y-2 text-center">
      <button
        id={id} type="button" onClick={onCta} disabled={!lp.whatsapp || busy}
        className="relative inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 py-3 text-base font-bold text-primary-foreground shadow-lg shadow-primary/30 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 animate-ping rounded-2xl bg-primary/30 motion-reduce:hidden" />
        <MessageCircle className="h-6 w-6 shrink-0" />
        <span>{lp.ctaText}</span>
      </button>
      {lp.ctaSubtext && <p className="text-sm text-muted-foreground">{lp.ctaSubtext}</p>}
      {!lp.whatsapp && <p className="text-sm text-destructive" role="alert">WhatsApp indisponível no momento.</p>}
    </div>
  );

  const steps = [
    { n: "1", t: "Toque no botão", d: "Abre o WhatsApp com a mensagem pronta." },
    { n: "2", t: "Converse com a equipe", d: "Tiramos suas dúvidas e liberamos a demonstração." },
    { n: "3", t: "Aproveite em minutos", d: "Na Smart TV, TV Stick ou celular." },
  ];
  const showcase = [
    { e: "⚽", t: "Esportes", d: "Transmissões em tempo real" },
    { e: "🎬", t: "Filmes e séries", d: "Catálogo sob demanda" },
    { e: "📺", t: "Variedades", d: "Notícias e entretenimento" },
    { e: "🧸", t: "Família", d: "Desenhos e educativos" },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-background pb-28 text-foreground">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-primary/25 blur-3xl" />
      <div className="relative mx-auto flex max-w-md flex-col gap-10 px-5 pt-5">
        <nav className="flex items-center justify-between">
          <span className="font-display text-lg font-extrabold tracking-widest text-primary">NATV</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:hidden" /><span className="relative inline-flex h-2 w-2 rounded-full bg-primary" /></span>
            Atendimento online
          </span>
        </nav>

        <header className="space-y-5 text-center">
          {lp.badgeTop && <span className="inline-block rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-primary">{lp.badgeTop}</span>}
          <h1 className="font-display text-[2.1rem] font-extrabold leading-[1.1] tracking-tight sm:text-5xl">{lp.headline}</h1>
          {lp.subheadline && <p className="text-base leading-relaxed text-muted-foreground">{lp.subheadline}</p>}
          <div className="flex items-center justify-center gap-1 text-primary" aria-label="Avaliação 5 estrelas">
            {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4 fill-current" />)}
            <span className="ml-2 text-xs text-muted-foreground">Bem avaliado por assinantes em todo o Brasil</span>
          </div>
        </header>

        {renderCta("lp-cta-top")}

        <section aria-label="O que você assiste" className="space-y-4">
          <h2 className="text-center font-display text-xl font-bold">Tudo em um só lugar</h2>
          <div className="grid grid-cols-2 gap-3">
            {showcase.map((s) => (
              <div key={s.t} className="rounded-2xl border border-border bg-gradient-to-br from-card to-primary/10 p-4">
                <span aria-hidden className="text-3xl">{s.e}</span>
                <p className="mt-3 font-display text-sm font-bold">{s.t}</p>
                <p className="text-xs text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Benefícios" className="space-y-2 rounded-2xl border border-border bg-card/60 p-2 backdrop-blur">
          {lp.benefits.map((b, i) => {
            const Icon = ICONS[b.icon] ?? Check;
            return (
              <div key={i} className="flex items-center gap-3 rounded-xl p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><Icon className="h-5 w-5" /></span>
                <p className="text-sm font-medium">{b.text}</p>
              </div>
            );
          })}
        </section>

        <section aria-label="Como funciona" className="space-y-4">
          <h2 className="text-center font-display text-xl font-bold">Comece em 3 passos</h2>
          <ol className="space-y-3">
            {steps.map((s) => (
              <li key={s.n} className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary font-display font-extrabold text-primary-foreground">{s.n}</span>
                <div><p className="font-semibold">{s.t}</p><p className="text-sm text-muted-foreground">{s.d}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-label="Dispositivos compatíveis" className="space-y-3 text-center">
          <h2 className="font-display text-xl font-bold">Funciona nos seus aparelhos</h2>
          <div className="flex flex-wrap justify-center gap-2">
            {DEVICES.map((d) => <span key={d} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">{d}</span>)}
          </div>
        </section>

        <section aria-label="Dúvidas frequentes" className="space-y-3">
          <h2 className="text-center font-display text-xl font-bold">Dúvidas rápidas</h2>
          {lp.faq.map((f, i) => (
            <details key={i} className="group rounded-xl border border-border bg-card px-4">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-medium">
                {f.question}<ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
              </summary>
              <p className="pb-4 text-sm text-muted-foreground">{f.answer}</p>
            </details>
          ))}
        </section>

        {renderCta("lp-cta-bottom")}

        <section aria-label="Garantias" className="grid grid-cols-3 gap-2 text-center">
          {[{ I: ShieldCheck, t: "Site seguro" }, { I: Headset, t: "Suporte humano" }, { I: Check, t: "Sem fidelidade" }].map(({ I, t }) => (
            <div key={t} className="rounded-xl border border-border bg-card/60 p-3"><I className="mx-auto h-5 w-5 text-primary" /><p className="mt-1 text-xs text-muted-foreground">{t}</p></div>
          ))}
        </section>

        <footer className="space-y-3 border-t border-border pt-6 text-center text-xs leading-relaxed text-muted-foreground">
          <nav aria-label="Informações legais" className="flex justify-center gap-4">
            <Link to="/termos" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">Termos de Uso</Link>
            <Link to="/privacidade" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">Política de Privacidade</Link>
          </nav>
          <p>Este site não é afiliado ao Facebook, Instagram ou à Meta Platforms, Inc. Depois que você sai das plataformas da Meta, a responsabilidade pelo conteúdo e pelos serviços é exclusivamente deste site. Marcas e nomes citados pertencem aos seus respectivos donos.</p>
          <p>A NATV oferece acesso e suporte a um serviço de streaming multimídia. Não comercializamos aparelhos nem conteúdo de terceiros.</p>
          <CookieSettings />
          <p>© {new Date().getFullYear()} NATV. Todos os direitos reservados.</p>
        </footer>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <button type="button" onClick={onCta} disabled={!lp.whatsapp || busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
            <MessageCircle className="h-5 w-5" /> Falar no WhatsApp
          </button>
        </div>
      </div>
    </main>
  );
}
