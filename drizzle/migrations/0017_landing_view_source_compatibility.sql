CREATE OR REPLACE FUNCTION public.record_landing_view(p_slug text,p_session text,p_ref text,p_fbclid text,p_fbc text,p_fbp text,p_ua text,p_ip_hash text,p_country text,p_choice uuid,p_allowed boolean) RETURNS text LANGUAGE plpgsql SET search_path=public AS $$
DECLARE lp public.landing_pages; cl public.clicks;
BEGIN
 SELECT * INTO lp FROM public.landing_pages WHERE slug=p_slug AND active;
 IF lp.id IS NULL THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(lp.id::text||p_session,0));
 SELECT * INTO cl FROM public.clicks WHERE landing_page_id=lp.id AND session_id=p_session ORDER BY created_at DESC LIMIT 1;
 IF cl.id IS NOT NULL THEN
   UPDATE public.clicks SET advertising_allowed=p_allowed, advertising_choice_id=p_choice,
     fbc=CASE WHEN p_allowed THEN COALESCE(p_fbc,fbc) ELSE NULL END,fbp=CASE WHEN p_allowed THEN COALESCE(p_fbp,fbp) ELSE NULL END WHERE id=cl.id;
   RETURN cl.ref_code;
 END IF;
 INSERT INTO public.clicks(landing_page_id,session_id,campaign_id,ref_code,fbclid,fbc,fbp,user_agent,ip_hash,source,advertising_choice_id,advertising_allowed)
 VALUES(lp.id,p_session,lp.campaign_id,p_ref,p_fbclid,p_fbc,p_fbp,p_ua,p_ip_hash,'tracked',p_choice,p_allowed);
 INSERT INTO public.events(session_id,ref_code,type,metadata) VALUES(p_session,p_ref,'page_view',jsonb_build_object('page','landing','slug',p_slug));
 UPDATE public.landing_pages SET views_count=views_count+1 WHERE id=lp.id;
 RETURN p_ref;
END $$;
REVOKE ALL ON FUNCTION public.record_landing_view(text,text,text,text,text,text,text,text,text,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_landing_view(text,text,text,text,text,text,text,text,text,uuid,boolean) TO service_role;