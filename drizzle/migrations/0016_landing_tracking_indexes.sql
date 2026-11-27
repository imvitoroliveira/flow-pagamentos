ALTER POLICY "admin read advertising choices" ON public.advertising_choices USING ((select public.has_role((select auth.uid()), 'admin')));
CREATE INDEX IF NOT EXISTS clicks_advertising_choice_idx ON public.clicks(advertising_choice_id);
