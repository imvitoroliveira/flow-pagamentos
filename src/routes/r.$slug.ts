import { createFileRoute } from "@tanstack/react-router";

// Campaign tracking link: /r/<slug> → registers click with ref_code → WhatsApp
export const Route = createFileRoute("/r/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { makeRefCode, hashIp } = await import("@/lib/checkout.server");
        const { isLinkPreviewBot } = await import("@/lib/link-bots");
        const url = new URL(request.url);
        const { data: c } = await db.from("campaigns").select("id, active, destination_whatsapp, prefilled_message").eq("slug", params.slug).maybeSingle();
        if (!c || c.active === false) return Response.redirect(new URL("/pagar", url).toString(), 302);

        const cookies = Object.fromEntries(
          (request.headers.get("cookie") ?? "").split(";").map((p) => p.trim().split("=")).filter((p) => p[0]),
        );
        const fbclid = url.searchParams.get("fbclid");
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "";
        const code = url.searchParams.get("l");
        let link_id: string | null = null;
        if (code && /^[a-z0-9]{4,12}$/.test(code)) {
          const { data: l } = await db.from("campaign_links").select("id").eq("code", code).eq("campaign_id", c.id).maybeSingle();
          link_id = l?.id ?? null;
        }
        // Link-preview/search crawlers are redirected like anyone else but are not recorded as clicks (no ref code).
        const bot = isLinkPreviewBot(request.headers.get("user-agent"));
        let ref: string | null = bot ? null : makeRefCode();
        for (let i = 0; ref && i < 3; i++) {
          const { error } = await db.from("clicks").insert({
            campaign_id: c.id,
            link_id,
            ref_code: ref,
            fbp: cookies["_fbp"] ?? null,
            fbc: cookies["_fbc"] ?? (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null),
            fbclid,
            ttclid: url.searchParams.get("ttclid"),
            user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
            ip_hash: ip ? hashIp(ip) : null,
            state: request.headers.get("cf-region-code") ?? null,
          });
          if (!error) break;
          ref = makeRefCode();
        }
        const plano = url.searchParams.get("plano");
        const qs = new URLSearchParams();
        if (ref) qs.set("ref", ref);
        if (plano && /^[a-z]+$/.test(plano)) qs.set("plano", plano);
        const toPagar = `/pagar${qs.toString() ? `?${qs}` : ""}`;
        if (url.searchParams.get("pagar") === "1" || !c.destination_whatsapp) return Response.redirect(new URL(toPagar, url).toString(), 302);
        const msg = `${c.prefilled_message ?? "Olá! Quero assinar o NATV."}${ref ? ` [${ref}]` : ""}`;
        const wa = `https://wa.me/${c.destination_whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
        return Response.redirect(wa, 302);
      },
    },
  },
});
