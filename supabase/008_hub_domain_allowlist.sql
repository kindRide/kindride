CREATE TABLE IF NOT EXISTS public.hub_domain_allowlist (
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  domain text NOT NULL,
  CONSTRAINT hub_domain_allowlist_hub_domain_key UNIQUE (hub_id, domain)
);

CREATE INDEX IF NOT EXISTS hub_domain_allowlist_domain_idx
  ON public.hub_domain_allowlist(domain);

ALTER TABLE public.hub_domain_allowlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hub_domain_allowlist_service_role_all" ON public.hub_domain_allowlist;

CREATE POLICY "hub_domain_allowlist_service_role_all"
  ON public.hub_domain_allowlist
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
