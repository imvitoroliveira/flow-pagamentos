ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'whatsapp_clicked';
CREATE TABLE public.advertising_choices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), choice text NOT NULL CHECK (choice IN ('granted','denied')), notice_version text NOT NULL DEFAULT '2026-11-27', country text, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.advertising_choices TO authenticated;
GRANT ALL ON public.advertising_choices TO service_role;
ALTER TABLE public.advertising_choices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read advertising choices" ON public.advertising_choices FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.clicks ADD COLUMN IF NOT EXISTS landing_page_id uuid REFERENCES public.landing_pages(id), ADD COLUMN IF NOT EXISTS session_id text, ADD COLUMN IF NOT EXISTS lead_at timestamptz, ADD COLUMN IF NOT EXISTS meta_lead_status text, ADD COLUMN IF NOT EXISTS meta_lead_error text, ADD COLUMN IF NOT EXISTS advertising_choice_id uuid REFERENCES public.advertising_choices(id), ADD COLUMN IF NOT EXISTS advertising_allowed boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS clicks_landing_session_idx ON public.clicks(landing_page_id,session_id);
CREATE INDEX IF NOT EXISTS events_ref_session_idx ON public.events(ref_code,session_id);
CREATE OR REPLACE FUNCTION public.record_landing_view(p_slug text,p_session text,p_ref text,p_fbclid text,p_fbc text,p_fbp text,p_ua text,p_ip_hash text,p_country text,p_choice uuid,p_allowed boolean) RETURNS text LANGUAGE plpgsql SET search_path=public AS $$
DECLARE lp public.landing_pages; cl public.clicks;
BEGIN
 SELECT * INTO lp FROM public.landing_pages WHERE slug=p_slug AND active FOR SHARE;
 IF lp.id IS NULL THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(lp.id::text||p_session,0));
 SELECT * INTO cl FROM public.clicks WHERE landing_page_id=lp.id AND session_id=p_session ORDER BY created_at DESC LIMIT 1;
 IF cl.id IS NOT NULL THEN
   UPDATE public.clicks SET advertising_allowed=p_allowed, advertising_choice_id=p_choice,
     fbc=COALESCE(p_fbc,fbc),fbp=COALESCE(p_fbp,fbp) WHERE id=cl.id;
   RETURN cl.ref_code;
 END IF;
 INSERT INTO public.clicks(landing_page_id,session_id,campaign_id,ref_code,fbclid,fbc,fbp,user_agent,ip_hash,source,advertising_choice_id,advertising_allowed)
 VALUES(lp.id,p_session,lp.campaign_id,p_ref,p_fbclid,p_fbc,p_fbp,p_ua,p_ip_hash,'landing',p_choice,p_allowed);
 INSERT INTO public.events(session_id,ref_code,type,metadata) VALUES(p_session,p_ref,'page_view',jsonb_build_object('page','landing','slug',p_slug));
 UPDATE public.landing_pages SET views_count=views_count+1 WHERE id=lp.id;
 RETURN p_ref;
END $$;
REVOKE ALL ON FUNCTION public.record_landing_view(text,text,text,text,text,text,text,text,text,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_landing_view(text,text,text,text,text,text,text,text,text,uuid,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.record_landing_lead(p_slug text,p_ref text) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE cl public.clicks;
BEGIN
 SELECT c.* INTO cl FROM public.clicks c JOIN public.landing_pages l ON l.id=c.landing_page_id WHERE c.ref_code=p_ref AND l.slug=p_slug AND l.active FOR UPDATE OF c;
 IF cl.id IS NULL THEN RETURN NULL; END IF;
 IF cl.lead_at IS NULL THEN
  UPDATE public.clicks SET lead_at=now(),meta_lead_status='pending' WHERE id=cl.id RETURNING * INTO cl;
  INSERT INTO public.events(session_id,ref_code,type,metadata) VALUES(cl.session_id,cl.ref_code,'whatsapp_clicked',jsonb_build_object('slug',p_slug,'event_id','lp_lead_'||p_ref));
  UPDATE public.landing_pages SET leads_count=leads_count+1 WHERE id=cl.landing_page_id;
 END IF;
 RETURN to_jsonb(cl);
END $$;
REVOKE ALL ON FUNCTION public.record_landing_lead(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_landing_lead(text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.admin_sessions(p_from timestamptz,p_to timestamptz,p_campaign uuid DEFAULT NULL,p_seller uuid DEFAULT NULL,p_stage text DEFAULT 'all',p_search text DEFAULT NULL,p_limit integer DEFAULT 25,p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE r jsonb; lim int:=least(greatest(coalesce(p_limit,25),1),100); q text:=nullif(trim(coalesce(p_search,'')),'');
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_stage NOT IN ('all','pagina','whatsapp','checkout','pix','pago','abandonou','falha_renovacao') THEN RAISE EXCEPTION 'invalid stage'; END IF;
 WITH s AS (
 SELECT coalesce(c.session_id,e.session_id) session_id,min(e.created_at) started_at,max(e.created_at) last_at,
 (array_agg(e.ref_code ORDER BY e.created_at DESC) FILTER(WHERE e.ref_code IS NOT NULL))[1] ref_code,
 (array_agg(e.order_id ORDER BY e.created_at DESC) FILTER(WHERE e.order_id IS NOT NULL))[1] order_id,
 bool_or(e.type::text='page_view') has_page,bool_or(e.metadata->>'page'='landing') has_landing,
 bool_or(e.type::text='whatsapp_clicked') has_whatsapp,bool_or(e.type::text='checkout_started') has_checkout,bool_or(e.type::text='pix_generated') has_pix
 FROM public.events e LEFT JOIN public.clicks c ON c.ref_code=e.ref_code
 WHERE coalesce(c.session_id,e.session_id) IS NOT NULL AND e.created_at BETWEEN p_from AND p_to GROUP BY 1),
 j AS (
 SELECT s.*,o.status::text order_status,o.amount_cents,o.customer_email,o.panel_username,o.created_at order_created,
 (cl.id IS NOT NULL) has_click,k.id campaign_id,k.name campaign_name,coalesce(o.seller_id,k.seller_id) seller_id,cl.meta_lead_status,cl.meta_lead_error
 FROM s LEFT JOIN public.orders o ON o.id=s.order_id LEFT JOIN public.clicks cl ON cl.ref_code=s.ref_code LEFT JOIN public.campaigns k ON k.id=coalesce(o.campaign_id,cl.campaign_id)),
 x AS (
 SELECT j.*,CASE WHEN order_status='renewal_failed' THEN 'falha_renovacao' WHEN order_status IN ('paid','renewed') THEN 'pago'
 WHEN has_pix AND (order_status IN ('expired','cancelled') OR order_created<now()-interval '30 minutes') THEN 'abandonou'
 WHEN has_pix THEN 'pix' WHEN has_checkout THEN 'checkout' WHEN has_whatsapp THEN 'whatsapp' ELSE 'pagina' END stage
 FROM j WHERE (p_campaign IS NULL OR campaign_id=p_campaign) AND (p_seller IS NULL OR seller_id=p_seller)
 AND (q IS NULL OR session_id ILIKE '%'||q||'%' OR ref_code ILIKE '%'||q||'%' OR customer_email ILIKE '%'||q||'%' OR panel_username ILIKE '%'||q||'%')),
 f AS (SELECT * FROM x WHERE p_stage='all' OR stage=p_stage),pg AS(SELECT * FROM f ORDER BY last_at DESC LIMIT lim OFFSET greatest(coalesce(p_offset,0),0))
 SELECT jsonb_build_object('total',(SELECT count(*) FROM f),'all',(SELECT count(*) FROM x),'counts',coalesce((SELECT jsonb_object_agg(stage,n) FROM(SELECT stage,count(*) n FROM x GROUP BY stage)t),'{}'::jsonb),'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('session_id',session_id,'started_at',started_at,'last_at',last_at,'ref_code',ref_code,'order_id',order_id,'stage',stage,'order_status',order_status,'amount_cents',amount_cents,'campaign_name',campaign_name,'meta_lead_status',meta_lead_status,'meta_lead_error',meta_lead_error,'visitor',coalesce(customer_email,panel_username,'Visitante #'||right(session_id,4)),'path',to_jsonb(array_remove(ARRAY[CASE WHEN has_click THEN 'clique' END,CASE WHEN has_landing THEN 'landing' WHEN has_page THEN 'pagina' END,CASE WHEN has_whatsapp THEN 'whatsapp' END,CASE WHEN has_checkout THEN 'checkout' END,CASE WHEN has_pix THEN 'pix' END,CASE WHEN order_status IN('paid','renewed','renewal_failed') THEN 'pago' END,CASE WHEN order_status='renewed' THEN 'renovado' END],NULL))) ORDER BY last_at DESC) FROM pg),'[]'::jsonb)) INTO r;
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_sessions(timestamptz,timestamptz,uuid,uuid,text,text,integer,integer) TO authenticated;
