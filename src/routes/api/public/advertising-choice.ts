import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
export const Route = createFileRoute("/api/public/advertising-choice")({ server: { handlers: {
  POST: async ({request}) => {
    const { isSameOrigin,requestCookies } = await import("@/lib/advertising.server");
    if (!isSameOrigin(request)) return new Response(null,{status:403});
    const parsed = z.object({choice:z.enum(["granted","denied"])}).safeParse(await request.json().catch(()=>null));
    if (!parsed.success) return new Response(null,{status:400});
    const {supabaseAdmin} = await import("@/integrations/supabase/client.server");
    const oldId = requestCookies(request)["natv_ad_choice"];
    const id = oldId && z.string().uuid().safeParse(oldId).success ? oldId : crypto.randomUUID();
    const choice = request.headers.get("sec-gpc")==="1" ? "denied" : parsed.data.choice;
    const {error} = await supabaseAdmin.from("advertising_choices").upsert({id,choice,notice_version:"2026-11-27",country:request.headers.get("cf-ipcountry"),updated_at:new Date().toISOString()});
    if(error) return new Response(null,{status:500});
    return Response.json({ok:true},{headers:{"Set-Cookie":`natv_ad_choice=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(request.url).protocol==="https:"?"; Secure":""}`,"Cache-Control":"no-store"}});
  }
}}});
