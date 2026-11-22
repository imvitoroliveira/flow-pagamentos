-- Landing pages (Meta Ads -> LP -> WhatsApp). Public read only for active pages; admins manage everything.
CREATE TABLE IF NOT EXISTS public.landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  headline text NOT NULL,
  subheadline text,
  cta_text text NOT NULL DEFAULT 'Quero Meu Teste Grátis no WhatsApp',
  cta_subtext text DEFAULT 'Ativação imediata em menos de 2 minutos',
  whatsapp_number text,
  whatsapp_message text,
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  badge_top text DEFAULT '🔥 TESTE GRÁTIS DE 4 HORAS LIBERADO',
  faq jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta_pixel_id text,
  active boolean NOT NULL DEFAULT true,
  views_count integer NOT NULL DEFAULT 0,
  leads_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.landing_pages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.landing_pages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.landing_pages TO authenticated;
GRANT ALL ON public.landing_pages TO service_role;

DROP POLICY IF EXISTS "LPs ativas são públicas para leitura" ON public.landing_pages;
CREATE POLICY "LPs ativas são públicas para leitura" ON public.landing_pages
  FOR SELECT TO anon, authenticated USING (active = true);

DROP POLICY IF EXISTS "Admins gerenciam LPs" ON public.landing_pages;
CREATE POLICY "Admins gerenciam LPs" ON public.landing_pages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS landing_pages_campaign_idx ON public.landing_pages (campaign_id);

-- Atomic counters (called only by server routes with the service role).
CREATE OR REPLACE FUNCTION public.lp_bump(p_id uuid, p_lead boolean)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  UPDATE public.landing_pages
     SET views_count = views_count + CASE WHEN p_lead THEN 0 ELSE 1 END,
         leads_count = leads_count + CASE WHEN p_lead THEN 1 ELSE 0 END
   WHERE id = p_id;
$$;
REVOKE EXECUTE ON FUNCTION public.lp_bump(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lp_bump(uuid, boolean) TO service_role;
