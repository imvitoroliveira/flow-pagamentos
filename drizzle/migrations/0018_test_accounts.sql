-- Contas de teste geradas no painel da revenda (/admin/testes). Só admins acessam.
CREATE TABLE IF NOT EXISTS public.test_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id TEXT,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  domain TEXT DEFAULT 'natv.pm',
  customer_name TEXT,
  customer_phone TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 120,
  expires_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.test_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access on test_accounts" ON public.test_accounts;
CREATE POLICY "Admins full access on test_accounts"
  ON public.test_accounts
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON TABLE public.test_accounts FROM PUBLIC, anon;
GRANT ALL ON TABLE public.test_accounts TO authenticated;
GRANT ALL ON TABLE public.test_accounts TO service_role;

CREATE INDEX IF NOT EXISTS idx_test_accounts_username ON public.test_accounts(username);
CREATE INDEX IF NOT EXISTS idx_test_accounts_created_at ON public.test_accounts(created_at DESC);
