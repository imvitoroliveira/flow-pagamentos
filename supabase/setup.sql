-- Esquema completo do NATV para um projeto Supabase NOVO (gratuito).
-- Gerado a partir de drizzle/migrations (0000..0009), na ordem do journal.
-- Cole no SQL Editor do Supabase e execute UMA vez, em um projeto vazio.
-- ATENÇÃO: troque https://SEU-DOMINIO.com abaixo pelo endereço real do site (só afeta a fila de retentativas).

-- ═══ 0000_natv_schema ═══
create type public.app_role as enum ('admin');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

-- first user to sign up becomes admin
create or replace function public.handle_first_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created_admin after insert on auth.users
for each row execute function public.handle_first_admin();

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('mensal','trimestral','semestral')),
  name text not null,
  price_cents integer not null,
  months integer not null,
  active boolean not null default true
);
create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  telegram_chat_id text,
  active boolean not null default true
);
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  seller_id uuid references public.sellers(id) on delete set null,
  utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text,
  destination_whatsapp text,
  prefilled_message text,
  meta_pixel_id text,
  tiktok_pixel_id text,
  created_at timestamptz not null default now()
);
create or replace function public.campaign_slug_immutable()
returns trigger language plpgsql as $$
begin
  if new.slug is distinct from old.slug then raise exception 'slug é imutável'; end if;
  return new;
end $$;
create trigger campaigns_slug_immutable before update on public.campaigns
for each row execute function public.campaign_slug_immutable();

create table public.clicks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  ref_code text not null unique,
  fbp text, fbc text, fbclid text, ttclid text, user_agent text, ip_hash text, state text,
  created_at timestamptz not null default now()
);
create type public.order_status as enum ('pending','paid','renewed','renewal_failed','expired','cancelled');
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  ref_code text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  seller_id uuid references public.sellers(id) on delete set null,
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  panel_username text not null,
  plan_id uuid not null references public.plans(id),
  amount_cents integer not null,
  status public.order_status not null default 'pending',
  abacate_id text,
  pix_brcode text,
  pix_qr_base64 text,
  paid_at timestamptz,
  renewed_at timestamptz,
  renewal_error text,
  event_id text,
  created_at timestamptz not null default now()
);
create index orders_abacate_idx on public.orders(abacate_id);
create type public.event_type as enum ('page_view','checkout_started','pix_generated','paid','renewed');
create table public.events (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  ref_code text,
  order_id uuid references public.orders(id) on delete set null,
  type public.event_type not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event text,
  payload jsonb,
  processed boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);
create table public.notifications_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  channel text not null,
  status text not null,
  created_at timestamptz not null default now()
);

grant select on public.plans to anon;
grant select, insert, update, delete on public.plans, public.sellers, public.campaigns, public.clicks, public.orders, public.events, public.webhook_logs, public.notifications_log to authenticated;
grant all on public.plans, public.sellers, public.campaigns, public.clicks, public.orders, public.events, public.webhook_logs, public.notifications_log to service_role;

alter table public.plans enable row level security;
alter table public.sellers enable row level security;
alter table public.campaigns enable row level security;
alter table public.clicks enable row level security;
alter table public.orders enable row level security;
alter table public.events enable row level security;
alter table public.webhook_logs enable row level security;
alter table public.notifications_log enable row level security;

create policy "public active plans" on public.plans for select to anon, authenticated using (active = true or public.has_role(auth.uid(),'admin'));
create policy "admin plans" on public.plans for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin sellers" on public.sellers for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin campaigns" on public.campaigns for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin clicks" on public.clicks for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin orders" on public.orders for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin events" on public.events for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin webhook_logs" on public.webhook_logs for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin notifications" on public.notifications_log for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

insert into public.plans (slug, name, price_cents, months) values
  ('mensal','Mensal',3500,1),('trimestral','Trimestral',9000,3),('semestral','Semestral',17000,6);


-- ═══ 0001_migration ═══
-- lovable-cron-fallback-reviewed: bounded retry queue; job is armed on enqueue and unscheduled after drain
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.renewal_retries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  attempt integer not null,
  run_at timestamptz not null,
  status text not null default 'pending',
  last_error text,
  created_at timestamptz not null default now(),
  unique (order_id, attempt)
);
create index renewal_retries_due on public.renewal_retries (status, run_at);
grant select, insert, update, delete on public.renewal_retries to authenticated;
grant all on public.renewal_retries to service_role;
alter table public.renewal_retries enable row level security;
create policy "admin renewal_retries" on public.renewal_retries for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.arm_renewal_retries()
returns void language plpgsql security definer set search_path = public, cron as $$
begin
  if not exists (select 1 from cron.job where jobname = 'natv-renewal-retries') then
    perform cron.schedule('natv-renewal-retries', '* * * * *', $job$
      select net.http_post(
        url := 'https://SEU-DOMINIO.com/api/public/renewal-retries',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb);
    $job$);
  end if;
end $$;

create or replace function public.disarm_renewal_retries()
returns void language plpgsql security definer set search_path = public, cron as $$
begin
  if not exists (select 1 from public.renewal_retries where status in ('pending','running'))
     and exists (select 1 from cron.job where jobname = 'natv-renewal-retries') then
    perform cron.unschedule('natv-renewal-retries');
  end if;
end $$;

revoke all on function public.arm_renewal_retries() from public, anon, authenticated;
revoke all on function public.disarm_renewal_retries() from public, anon, authenticated;
grant execute on function public.arm_renewal_retries() to service_role;
grant execute on function public.disarm_renewal_retries() to service_role;

-- ═══ 0002_admin_stage_a ═══
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

-- ═══ 0003_admin_stage_c ═══
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

-- ═══ 0004_seller_role_enum ═══
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'seller';

-- ═══ 0005_seller_access_links ═══
ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE;
ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS login_email text;
ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS commission_bps integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.my_seller_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id FROM public.sellers s
  WHERE s.user_id = auth.uid() AND s.active AND public.has_role(auth.uid(), 'seller')
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.my_seller_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_seller_id() TO authenticated;

CREATE TABLE public.campaign_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  label text NOT NULL,
  code text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_links TO authenticated;
GRANT ALL ON public.campaign_links TO service_role;
ALTER TABLE public.campaign_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin campaign_links" ON public.campaign_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "seller own links" ON public.campaign_links FOR ALL TO authenticated
  USING (campaign_id IN (SELECT id FROM public.campaigns WHERE seller_id = public.my_seller_id()))
  WITH CHECK (campaign_id IN (SELECT id FROM public.campaigns WHERE seller_id = public.my_seller_id()));
CREATE INDEX campaign_links_campaign_idx ON public.campaign_links(campaign_id);

ALTER TABLE public.clicks ADD COLUMN IF NOT EXISTS link_id uuid REFERENCES public.campaign_links(id) ON DELETE SET NULL;

CREATE POLICY "seller own row" ON public.sellers FOR SELECT TO authenticated USING (id = public.my_seller_id());
CREATE POLICY "seller read campaigns" ON public.campaigns FOR SELECT TO authenticated USING (seller_id = public.my_seller_id());
CREATE POLICY "seller insert campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (seller_id = public.my_seller_id());
CREATE POLICY "seller update campaigns" ON public.campaigns FOR UPDATE TO authenticated USING (seller_id = public.my_seller_id()) WITH CHECK (seller_id = public.my_seller_id());
CREATE POLICY "seller read clicks" ON public.clicks FOR SELECT TO authenticated USING (campaign_id IN (SELECT id FROM public.campaigns WHERE seller_id = public.my_seller_id()));
CREATE POLICY "seller read orders" ON public.orders FOR SELECT TO authenticated USING (seller_id = public.my_seller_id());

-- ═══ 0006_harden_functions ═══
ALTER FUNCTION public.campaign_slug_immutable() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.arm_renewal_retries() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.disarm_renewal_retries() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_admins() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_admins() TO authenticated;

-- ═══ 0007_clients_and_credit_schedules ═══
CREATE TABLE public.panel_clients (
  panel_id text PRIMARY KEY,
  username text NOT NULL,
  password text,
  notes text,
  phone text,
  expires_at timestamptz,
  last_seen_at timestamptz,
  registered_at timestamptz,
  status text,
  blocked boolean NOT NULL DEFAULT false,
  connections integer,
  synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.panel_clients TO authenticated;
GRANT ALL ON public.panel_clients TO service_role;
ALTER TABLE public.panel_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read panel_clients" ON public.panel_clients FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX panel_clients_username_idx ON public.panel_clients (lower(username));

CREATE TABLE public.credit_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id),
  panel_username text NOT NULL,
  total_months integer NOT NULL,
  months_applied integer NOT NULL DEFAULT 1,
  next_run_at timestamptz,
  last_exp_date timestamptz,
  status text NOT NULL DEFAULT 'active',
  last_error text,
  alerted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_schedules TO authenticated;
GRANT ALL ON public.credit_schedules TO service_role;
ALTER TABLE public.credit_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read credit_schedules" ON public.credit_schedules FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX credit_schedules_due_idx ON public.credit_schedules (status, next_run_at);

-- ═══ 0008_integration_settings ═══
CREATE TABLE public.integration_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
-- Holds integration secrets (e.g. Meta token). RLS on with NO policies and no grants to anon/authenticated:
-- only server functions (service role) can read or write it; the browser never sees it.
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.integration_settings TO service_role;

-- ═══ 0009_ensure_integration_settings ═══
-- Ensures the admin integration settings table exists (same schema as 0008_integration_settings.sql).
-- Written idempotently so it is a safe no-op when that migration has already created the table.
-- Holds integration secrets (e.g. Meta token). RLS on with NO policies and no grants to anon/authenticated:
-- only server functions (service role) can read or write it; the browser never sees it.
CREATE TABLE IF NOT EXISTS public.integration_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.integration_settings TO service_role;
