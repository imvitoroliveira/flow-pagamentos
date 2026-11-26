CREATE TABLE IF NOT EXISTS public.billing_templates (
  regua text PRIMARY KEY CHECK (regua IN ('d3','d1','d0','vencido')),
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.billing_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_templates TO authenticated;
GRANT ALL ON public.billing_templates TO service_role;
ALTER TABLE public.billing_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins gerenciam modelos de cobranca" ON public.billing_templates;
CREATE POLICY "Admins gerenciam modelos de cobranca" ON public.billing_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));