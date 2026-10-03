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
