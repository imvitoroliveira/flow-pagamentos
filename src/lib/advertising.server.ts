import { advertisingPermitted } from "./landing-tracking";
import { z } from "zod";

export function requestCookies(request: Request) {
  return Object.fromEntries((request.headers.get("cookie") ?? "").split(";").map(p => p.trim().split("=")).filter((p): p is [string,string] => !!p[0] && p[1] !== undefined));
}
export async function advertisingPermission(request: Request) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const id = requestCookies(request)["natv_ad_choice"];
  const country = request.headers.get("cf-ipcountry");
  const { data } = id && z.string().uuid().safeParse(id).success
    ? await supabaseAdmin.from("advertising_choices").select("id,choice,updated_at").eq("id",id).maybeSingle() : { data: null };
  const active = data && Date.now()-new Date(data.updated_at).getTime() < 365*86400000 ? data : null;
  const allowed = advertisingPermitted(active?.choice ?? null,country,request.headers.get("sec-gpc") === "1");
  return { allowed, explicit: allowed && active?.choice === "granted", choiceId: active?.id ?? null, country };
}
export async function clickPermission(ref: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: c } = await supabaseAdmin.from("clicks").select("advertising_allowed,advertising_choice_id").eq("ref_code",ref).maybeSingle();
  if (!c?.advertising_allowed) return { allowed: false, explicit: false };
  if (!c.advertising_choice_id) return { allowed: true, explicit: false };
  const { data } = await supabaseAdmin.from("advertising_choices").select("choice,updated_at").eq("id",c.advertising_choice_id).maybeSingle();
  const allowed = data?.choice === "granted" && Date.now()-new Date(data.updated_at).getTime()<365*86400000;
  return { allowed, explicit: allowed };
}
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}
