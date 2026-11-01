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