ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS telegram_tested_at timestamptz;

CREATE OR REPLACE FUNCTION public.admin_sessions(p_from timestamptz, p_to timestamptz, p_campaign uuid DEFAULT NULL, p_seller uuid DEFAULT NULL, p_stage text DEFAULT 'all', p_search text DEFAULT NULL, p_limit int DEFAULT 25, p_offset int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $f$
declare r jsonb; lim int := least(greatest(coalesce(p_limit,25),1),100); q text := nullif(trim(coalesce(p_search,'')),'');
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  if p_stage not in ('all','pagina','checkout','pix','pago','abandonou','falha_renovacao') then raise exception 'invalid stage'; end if;
  with s as (
    select e.session_id, min(e.created_at) started_at,
      (array_agg(e.ref_code order by e.created_at) filter (where e.ref_code is not null))[1] ref_code,
      (array_agg(e.order_id order by e.created_at desc) filter (where e.order_id is not null))[1] order_id,
      bool_or(e.type='page_view') has_page, bool_or(e.type='checkout_started') has_checkout, bool_or(e.type='pix_generated') has_pix
    from events e where e.session_id is not null and e.created_at between p_from and p_to group by e.session_id),
  j as (
    select s.*, o.status::text order_status, o.amount_cents, o.customer_email, o.panel_username, o.created_at order_created,
      (cl.id is not null) has_click, k.id campaign_id, k.name campaign_name, coalesce(o.seller_id, k.seller_id) seller_id
    from s left join orders o on o.id = s.order_id
    left join lateral (select c.id, c.campaign_id from clicks c where c.ref_code = s.ref_code limit 1) cl on true
    left join campaigns k on k.id = coalesce(o.campaign_id, cl.campaign_id)),
  x as (
    select j.*, case
      when order_status = 'renewal_failed' then 'falha_renovacao'
      when order_status in ('paid','renewed') then 'pago'
      when has_pix and (order_status in ('expired','cancelled') or order_created < now() - interval '30 minutes') then 'abandonou'
      when has_pix then 'pix'
      when has_checkout then 'checkout' else 'pagina' end stage
    from j
    where (p_campaign is null or campaign_id = p_campaign) and (p_seller is null or seller_id = p_seller)
      and (q is null or session_id ilike '%'||q||'%' or ref_code ilike '%'||q||'%' or customer_email ilike '%'||q||'%' or panel_username ilike '%'||q||'%')),
  f as (select * from x where p_stage = 'all' or stage = p_stage),
  pg as (select * from f order by started_at desc limit lim offset greatest(coalesce(p_offset,0),0))
  select jsonb_build_object(
    'total', (select count(*) from f),
    'all', (select count(*) from x),
    'counts', coalesce((select jsonb_object_agg(stage, n) from (select stage, count(*) n from x group by stage) t), '{}'::jsonb),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'session_id', session_id, 'started_at', started_at, 'ref_code', ref_code, 'order_id', order_id, 'stage', stage,
        'order_status', order_status, 'amount_cents', amount_cents, 'campaign_id', campaign_id, 'campaign_name', campaign_name,
        'visitor', coalesce(customer_email, panel_username, 'Visitante #' || right(session_id, 4)),
        'path', to_jsonb(array_remove(array[
          case when has_click then 'clique' end, case when has_page then 'pagina' end, case when has_checkout then 'checkout' end,
          case when has_pix then 'pix' end, case when order_status in ('paid','renewed','renewal_failed') then 'pago' end,
          case when order_status = 'renewed' then 'renovado' end], null))
      ) order by started_at desc) from pg), '[]'::jsonb)
  ) into r;
  return r;
end $f$;
REVOKE EXECUTE ON FUNCTION public.admin_sessions(timestamptz, timestamptz, uuid, uuid, text, text, int, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_sessions(timestamptz, timestamptz, uuid, uuid, text, text, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_admins()
RETURNS TABLE(user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  return query select u.id, u.email::text, u.created_at, u.last_sign_in_at
    from public.user_roles r join auth.users u on u.id = r.user_id where r.role = 'admin' order by u.created_at;
end $f$;
REVOKE EXECUTE ON FUNCTION public.admin_list_admins() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_list_admins() TO authenticated;