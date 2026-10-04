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
        url := 'https://project--01fd8fdd-a237-45ef-9ebf-9aca7b382289-dev.lovable.app/api/public/renewal-retries',
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