import { createFileRoute } from "@tanstack/react-router";
import { leadSchema } from "@/lib/landing-tracking";
export const Route = createFileRoute("/api/public/lp-lead")({
 server: { handlers: { POST: async ({request}) => {
   const {isSameOrigin} = await import("@/lib/advertising.server");
   if(!isSameOrigin(request)) return Response.json({ok:false},{status:403});
   const parsed = leadSchema.safeParse(await request.json().catch(()=>null));
   if(!parsed.success) return Response.json({ok:false},{status:400});
   try {
     const {registerLead,readRequestInfo} = await import("@/lib/landing.server");
     const {publicUrl} = await import("@/lib/site-url");
     return Response.json(await registerLead(parsed.data.slug,parsed.data,await readRequestInfo(request),publicUrl(`/lp/${parsed.data.slug}`)),{headers:{"Cache-Control":"no-store"}});
   } catch { return Response.json({ok:false},{status:500}); }
 } } }
});
