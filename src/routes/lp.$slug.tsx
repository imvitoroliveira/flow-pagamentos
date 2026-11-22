import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Headset, MessageCircle, ShieldCheck, Smartphone, Star, Tv, Wrench, Zap, type LucideIcon } from "lucide-react";
import { getLandingPage } from "@/lib/landing.functions";
import { buildWhatsappUrl, DEVICES, type PublicLanding } from "@/lib/landing";
import { initPixel, readCookie, trackPixel } from "@/lib/meta-pixel";

// Public, mobile-first landing page for ads: Meta Ads → LP → WhatsApp. Everything above the fold is server-rendered.
export const Route = createFileRoute("/lp/$slug")({
  loader: async ({ params }) => {
    const lp = await getLandingPage({ data: { slug: params.slug } });
    if (!lp) throw redirect({ to: "/pagar" });
    return lp;
  },
  head: ({ loaderData }) => {
    const t = loaderData?.headline ?? "NATV";
    const d = loaderData?.subheadline ?? "Teste grátis no WhatsApp";
    return { meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] };
  },
  component: LandingPage,
});

const ICONS: Record<string, LucideIcon> = { tv: Tv, zap: Zap, headset: Headset, shield: ShieldCheck, wrench: Wrench, smartphone: Smartphone, check: Check, star: Star };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const refKey = (slug: string) => `natv_lp_ref_${slug}`;

function LandingPage() {
  const lp: PublicLanding = Route.useLoaderData();
  const refPromise = useRef<Promise<string | null> | null>(null);
  const leadSent = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (lp.pixelId) initPixel(lp.pixelId);
    // One visit = one click row. A refresh in the same session reuses the code instead of inflating views.
    let stored: string | null = null;
    try { stored = sessionStorage.getItem(refKey(lp.slug)); } catch { /* sem storage */ }
    if (stored) { refPromise.current = Promise.resolve(stored); return; }
    refPromise.current = fetch("/api/public/lp-view", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: lp.slug, fbclid: new URLSearchParams(window.location.search).get("fbclid") }),
    }).then((r) => (r.ok ? r.json() : null)).then((j: { ref?: string | null } | null) => {
      const ref = j?.ref ?? null;
      if (ref) { try { sessionStorage.setItem(refKey(lp.slug), ref); } catch { /* sem storage */ } }
      return ref;
    }).catch(() => null);
  }, [lp.pixelId, lp.slug]);

  async function onCta() {
    if (busy || !lp.whatsapp) return;
    setBusy(true);
    const ref = refPromise.current ? await Promise.race([refPromise.current, sleep(1200).then(() => null)]) : null;
    if (!leadSent.current) {
      leadSent.current = true; // only the first tap counts as a lead
      const eventId = `lp_${ref ?? "x"}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      trackPixel("Lead", { content_name: "whatsapp_click", ...(ref ? { ref_code: ref } : {}) }, eventId);
      if (ref) {
        const sent = fetch("/api/public/lp-lead", {
          method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
          body: JSON.stringify({ slug: lp.slug, ref, eventId, fbp: readCookie("_fbp"), fbc: readCookie("_fbc") }),
        }).catch(() => null);
        await Promise.race([sent, sleep(800)]); // don't hold the visitor: the server finishes on its own
      }
    }
    window.location.href = buildWhatsappUrl(lp.whatsapp, lp.message, ref);
  }

  const renderCta = (id: string) => (
    <div className="space-y-2 text-center">
      <button
        id={id} type="button" onClick={onCta} disabled={!lp.whatsapp || busy}
        className="relative inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-emerald-500 px-5 py-3 text-base font-bold text-emerald-950 shadow-lg transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 animate-ping rounded-xl bg-emerald-500/30 motion-reduce:hidden" />
        <MessageCircle className="h-6 w-6 shrink-0" />
        <span>{lp.ctaText}</span>
      </button>
      {lp.ctaSubtext && <p className="text-sm text-muted-foreground">{lp.ctaSubtext}</p>}
      {!lp.whatsapp && <p className="text-sm text-destructive" role="alert">WhatsApp indisponível no momento.</p>}
    </div>
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-md flex-col gap-8 px-4 pb-12 pt-6">
        <header className="space-y-4 text-center">
          <p className="text-sm font-extrabold tracking-widest text-primary">NATV</p>
          {lp.badgeTop && <span className="inline-block rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary">{lp.badgeTop}</span>}
          <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{lp.headline}</h1>
          {lp.subheadline && <p className="text-base text-muted-foreground">{lp.subheadline}</p>}
        </header>

        {renderCta("lp-cta-top")}

        <section aria-label="Benefícios" className="grid grid-cols-1 gap-3">
          {lp.benefits.map((b, i) => {
            const Icon = ICONS[b.icon] ?? Check;
            return (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                <p className="text-sm font-medium">{b.text}</p>
              </div>
            );
          })}
        </section>

        <section aria-label="Dispositivos compatíveis" className="space-y-3 text-center">
          <h2 className="font-display text-lg font-semibold">Funciona em todos os seus aparelhos</h2>
          <div className="flex flex-wrap justify-center gap-2">
            {DEVICES.map((d) => <span key={d} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">{d}</span>)}
          </div>
        </section>

        <section aria-label="Dúvidas frequentes" className="space-y-3">
          <h2 className="text-center font-display text-lg font-semibold">Dúvidas rápidas</h2>
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
      </div>
    </main>
  );
}
