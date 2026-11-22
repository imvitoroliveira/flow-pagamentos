import { createFileRoute } from "@tanstack/react-router";

// Landing page WhatsApp click: counts the lead and sends the server-side Meta "Lead" event (same event_id as the Pixel).
export const Route = createFileRoute("/api/public/lp-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as ({ slug?: unknown } & Record<string, unknown>) | null;
        const slug = typeof body?.slug === "string" ? body.slug : "";
        if (!slug || slug.length > 60) return Response.json({ ok: false }, { status: 400 });
        try {
          const { registerLead, readRequestInfo } = await import("@/lib/landing.server");
          const { publicUrl } = await import("@/lib/site-url");
          return Response.json(await registerLead(slug, body ?? {}, readRequestInfo(request), publicUrl(`/lp/${slug}`)));
        } catch (e) {
          console.error("[lp-lead]", (e as Error).message);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
