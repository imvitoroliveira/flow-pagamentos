drop trigger if exists on_auth_user_created_admin on auth.users;
drop function if exists public.handle_first_admin();

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid,
  admin_email text,
  action text not null,
  entity text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select on public.admin_audit_log to authenticated;
grant all on public.admin_audit_log to service_role;
alter table public.admin_audit_log enable row level security;
create policy "admin read audit" on public.admin_audit_log for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create index admin_audit_log_created on public.admin_audit_log (created_at);

create index if not exists orders_created_at_idx on public.orders(created_at);
create index if not exists orders_paid_at_idx on public.orders(paid_at);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_campaign_idx on public.orders(campaign_id);
create index if not exists orders_seller_idx on public.orders(seller_id);
create index if not exists orders_panel_username_idx on public.orders(panel_username);
create index if not exists orders_ref_code_idx on public.orders(ref_code);
create index if not exists events_session_idx on public.events(session_id);
create index if not exists events_created_idx on public.events(created_at);
create index if not exists events_order_idx on public.events(order_id);
create index if not exists events_type_idx on public.events(type);
create index if not exists clicks_created_idx on public.clicks(created_at);
create index if not exists clicks_campaign_idx on public.clicks(campaign_id);
create index if not exists webhook_logs_created_idx on public.webhook_logs(created_at);

alter table public.clicks add column if not exists source text not null default 'tracked';
alter table public.clicks add constraint clicks_source_check check (source in ('tracked','manual'));

-- Filtered sources (RLS applies: security invoker)
create or replace function public._adm_clicks(p_from timestamptz, p_to timestamptz, p_campaign uuid, p_seller uuid)
returns setof public.clicks language sql stable security invoker set search_path = public as $$
  select c.* from clicks c
  where c.created_at between p_from and p_to
    and (p_campaign is null or c.campaign_id = p_campaign)
    and (p_seller is null or exists (select 1 from campaigns k where k.id = c.campaign_id and k.seller_id = p_seller))
$$;

create or replace function public._adm_orders(p_campaign uuid, p_seller uuid)
returns setof public.orders language sql stable security invoker set search_path = public as $$
  select o.* from orders o
  where (p_campaign is null or o.campaign_id = p_campaign)
    and (p_seller is null or o.seller_id = p_seller)
$$;

create or replace function public._adm_events(p_from timestamptz, p_to timestamptz, p_campaign uuid, p_seller uuid)
returns setof public.events language sql stable security invoker set search_path = public as $$
  select e.* from events e
  where e.created_at between p_from and p_to
    and (p_campaign is null or exists (select 1 from clicks c where c.ref_code = e.ref_code and c.campaign_id = p_campaign))
    and (p_seller is null or exists (select 1 from clicks c join campaigns k on k.id = c.campaign_id where c.ref_code = e.ref_code and k.seller_id = p_seller))
$$;

create or replace function public.admin_overview(p_from timestamptz, p_to timestamptz, p_campaign uuid default null, p_seller uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare r jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  with o as (select * from _adm_orders(p_campaign, p_seller)),
  paid as (select * from o where paid_at between p_from and p_to and status in ('paid','renewed','renewal_failed')),
  ab as (select * from o where abacate_id is not null and created_at between p_from and p_to and status in ('pending','expired','cancelled'))
  select jsonb_build_object(
    'clicks', (select count(*) from _adm_clicks(p_from, p_to, p_campaign, p_seller)),
    'page_sessions', (select count(distinct session_id) from _adm_events(p_from, p_to, p_campaign, p_seller) where type = 'page_view'),
    'checkout_sessions', (select count(distinct session_id) from _adm_events(p_from, p_to, p_campaign, p_seller) where type = 'checkout_started'),
    'pix_generated', (select count(*) from o where abacate_id is not null and created_at between p_from and p_to),
    'paid_count', (select count(*) from paid),
    'renewed_count', (select count(*) from paid where status = 'renewed'),
    'renewal_failed_count', (select count(*) from paid where status = 'renewal_failed'),
    'revenue_cents', (select coalesce(sum(amount_cents),0) from paid),
    'avg_ticket_cents', (select case when count(*) = 0 then null else round(avg(amount_cents)) end from paid),
    'abandoned_count', (select count(*) from ab),
    'abandoned_cents', (select coalesce(sum(amount_cents),0) from ab),
    'renewal_success_rate', (select case when count(*) filter (where status in ('renewed','renewal_failed')) = 0 then null
        else round(100.0 * count(*) filter (where status = 'renewed') / count(*) filter (where status in ('renewed','renewal_failed')), 1) end from paid),
    'renewal_avg_seconds', (select round(avg(extract(epoch from renewed_at - paid_at))) from paid where status = 'renewed' and renewed_at is not null)
  ) into r;
  return r;
end $$;

create or replace function public.admin_timeseries(p_from timestamptz, p_to timestamptz, p_campaign uuid default null, p_seller uuid default null, p_bucket text default 'day')
returns table(bucket timestamptz, clicks int, pix int, paid int, revenue_cents bigint)
language plpgsql stable security invoker set search_path = public as $$
declare unit text := case when p_bucket = 'hour' then 'hour' else 'day' end;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  return query
  with b as (
    select (g at time zone 'America/Sao_Paulo') as bucket
    from generate_series(date_trunc(unit, p_from at time zone 'America/Sao_Paulo'),
                         date_trunc(unit, p_to at time zone 'America/Sao_Paulo'),
                         ('1 ' || unit)::interval) g
  ),
  o as (select * from _adm_orders(p_campaign, p_seller)),
  k as (select date_trunc(unit, created_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as t, count(*)::int n
        from _adm_clicks(p_from, p_to, p_campaign, p_seller) group by 1),
  x as (select date_trunc(unit, created_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as t, count(*)::int n
        from o where abacate_id is not null and created_at between p_from and p_to group by 1),
  p as (select date_trunc(unit, paid_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as t, count(*)::int n, sum(amount_cents)::bigint s
        from o where paid_at between p_from and p_to and status in ('paid','renewed','renewal_failed') group by 1)
  select b.bucket, coalesce(k.n,0), coalesce(x.n,0), coalesce(p.n,0), coalesce(p.s,0)::bigint
  from b left join k on k.t = b.bucket left join x on x.t = b.bucket left join p on p.t = b.bucket
  order by b.bucket;
end $$;

create or replace function public.admin_breakdown(p_from timestamptz, p_to timestamptz, p_campaign uuid default null, p_seller uuid default null, p_dim text default 'plan')
returns table(key text, label text, clicks int, pix int, paid int, revenue_cents bigint)
language plpgsql stable security invoker set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  if p_dim not in ('plan','campaign','seller','state') then raise exception 'invalid dim'; end if;
  return query
  with o as (select * from _adm_orders(p_campaign, p_seller)),
  ck as (select c.*, k.seller_id from _adm_clicks(p_from, p_to, p_campaign, p_seller) c left join campaigns k on k.id = c.campaign_id),
  ox as (select o.*, cl.state as click_state from o left join clicks cl on cl.ref_code = o.ref_code),
  dk as (
    select case p_dim when 'campaign' then campaign_id::text when 'seller' then seller_id::text when 'state' then coalesce(state,'Desconhecido') else null end as key,
      count(*)::int n from ck where p_dim <> 'plan' group by 1),
  dx as (
    select case p_dim when 'plan' then plan_id::text when 'campaign' then campaign_id::text when 'seller' then seller_id::text else coalesce(click_state,'Desconhecido') end as key,
      count(*) filter (where abacate_id is not null and created_at between p_from and p_to)::int pix,
      count(*) filter (where paid_at between p_from and p_to and status in ('paid','renewed','renewal_failed'))::int paid,
      coalesce(sum(amount_cents) filter (where paid_at between p_from and p_to and status in ('paid','renewed','renewal_failed')),0)::bigint rev
    from ox group by 1),
  keys as (select dk.key from dk union select dx.key from dx where dx.pix > 0 or dx.paid > 0)
  select coalesce(keys.key,'none'),
    case p_dim
      when 'plan' then (select pl.name from plans pl where pl.id::text = keys.key)
      when 'campaign' then coalesce((select cm.name from campaigns cm where cm.id::text = keys.key), 'Sem campanha')
      when 'seller' then coalesce((select s.name from sellers s where s.id::text = keys.key), 'Sem vendedor')
      else keys.key end,
    coalesce(dk.n,0), coalesce(dx.pix,0), coalesce(dx.paid,0), coalesce(dx.rev,0)::bigint
  from keys left join dk on dk.key is not distinct from keys.key left join dx on dx.key is not distinct from keys.key
  order by 6 desc, 3 desc;
end $$;

revoke execute on function public._adm_clicks(timestamptz,timestamptz,uuid,uuid), public._adm_orders(uuid,uuid), public._adm_events(timestamptz,timestamptz,uuid,uuid),
  public.admin_overview(timestamptz,timestamptz,uuid,uuid), public.admin_timeseries(timestamptz,timestamptz,uuid,uuid,text), public.admin_breakdown(timestamptz,timestamptz,uuid,uuid,text)
  from public, anon;
grant execute on function public._adm_clicks(timestamptz,timestamptz,uuid,uuid), public._adm_orders(uuid,uuid), public._adm_events(timestamptz,timestamptz,uuid,uuid),
  public.admin_overview(timestamptz,timestamptz,uuid,uuid), public.admin_timeseries(timestamptz,timestamptz,uuid,uuid,text), public.admin_breakdown(timestamptz,timestamptz,uuid,uuid,text)
  to authenticated;