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