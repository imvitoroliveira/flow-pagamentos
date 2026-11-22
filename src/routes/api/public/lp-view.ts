import { createFileRoute } from "@tanstack/react-router";

// Landing page visit: registers the click (ref_code + Meta params) and the view counter.
export const Route = createFileRoute("/api/public/lp-view")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as { slug?: unknown; fbclid?: unknown } | null;
        const slug = typeof body?.slug === "string" ? body.slug : "";
        if (!slug || slug.length > 60) return Response.json({ ref: null }, { status: 400 });
        try {
          const { registerView, readRequestInfo } = await import("@/lib/landing.server");
          return Response.json(await registerView(slug, body ?? {}, readRequestInfo(request)));
        } catch (e) {
          console.error("[lp-view]", (e as Error).message);
          return Response.json({ ref: null }, { status: 500 });
        }
      },
    },
  },
});
