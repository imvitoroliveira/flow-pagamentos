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