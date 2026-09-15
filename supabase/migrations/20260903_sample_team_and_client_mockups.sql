-- Applied remotely. Do not re-run against production if already present.
-- 1) sample_stock.with_team for "With Team" sample location.
-- 2) Clients may SELECT mockups with status = shared for their company.

ALTER TABLE public.sample_stock
  ADD COLUMN IF NOT EXISTS with_team integer NOT NULL DEFAULT 0;

DROP POLICY IF EXISTS mockups_select_client ON public.mockups;
CREATE POLICY mockups_select_client ON public.mockups
FOR SELECT
USING (
  is_client()
  AND status = 'shared'
  AND (
    (requirement_id IN (SELECT id FROM public.requirements WHERE company_id = client_company_id()))
    OR (order_id IN (SELECT id FROM public.orders WHERE company_id = client_company_id()))
  )
);
