import { createFileRoute } from "@tanstack/react-router";

// Campaign tracking link: /r/<slug> → registers click with ref_code → WhatsApp
export const Route = createFileRoute("/r/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { makeRefCode, hashIp } = await import("@/lib/checkout.server");
        const url = new URL(request.url);
        const { data: c } = await db.from("campaigns").select("*").eq("slug", params.slug).maybeSingle();
        if (!c || c.active === false) return Response.redirect(new URL("/pagar", url).toString(), 302);

        const cookies = Object.fromEntries(
          (request.headers.get("cookie") ?? "").split(";").map((p) => p.trim().split("=")).filter((p) => p[0]),
        );
        const fbclid = url.searchParams.get("fbclid");
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "";
        let ref = makeRefCode();
        for (let i = 0; i < 3; i++) {
          const { error } = await db.from("clicks").insert({
            campaign_id: c.id,
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
        const toPagar = `/pagar?ref=${ref}${plano && /^[a-z]+$/.test(plano) ? `&plano=${plano}` : ""}`;
        if (url.searchParams.get("pagar") === "1" || !c.destination_whatsapp) return Response.redirect(new URL(toPagar, url).toString(), 302);
        const msg = `${c.prefilled_message ?? "Olá! Quero assinar o NATV."} [${ref}]`;
        const wa = `https://wa.me/${c.destination_whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
        return Response.redirect(wa, 302);
      },
    },
  },
});
