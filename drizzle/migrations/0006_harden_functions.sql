ALTER FUNCTION public.campaign_slug_immutable() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.arm_renewal_retries() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.disarm_renewal_retries() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_admins() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_admins() TO authenticated;