-- Gasto diário com anúncios (por campanha ou geral) para o calendário de performance em /admin/metricas.
CREATE TABLE IF NOT EXISTS public.daily_ad_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  spend_cents integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_ad_spend_date_campaign_unique UNIQUE NULLS NOT DISTINCT (date, campaign_id)
);

ALTER TABLE public.daily_ad_spend ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_ad_spend FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_ad_spend TO authenticated;
GRANT ALL ON public.daily_ad_spend TO service_role;

DROP POLICY IF EXISTS "Admins gerenciam gastos com anuncios" ON public.daily_ad_spend;
CREATE POLICY "Admins gerenciam gastos com anuncios" ON public.daily_ad_spend
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS daily_ad_spend_date_idx ON public.daily_ad_spend (date);
