import { createFileRoute } from "@tanstack/react-router";
import { viewSchema } from "@/lib/landing-tracking";
export const Route = createFileRoute("/api/public/lp-view")({
 server: { handlers: { POST: async ({request}) => {
   const {isSameOrigin} = await import("@/lib/advertising.server");
   if(!isSameOrigin(request)) return Response.json({ok:false},{status:403});
   const parsed = viewSchema.safeParse(await request.json().catch(()=>null));
   if(!parsed.success) return Response.json({ok:false},{status:400});
   try {
     const {registerView,readRequestInfo} = await import("@/lib/landing.server");
     return Response.json(await registerView(parsed.data.slug,parsed.data,await readRequestInfo(request)),{headers:{"Cache-Control":"no-store"}});
   } catch { return Response.json({ok:false},{status:500}); }
 } } }
});
