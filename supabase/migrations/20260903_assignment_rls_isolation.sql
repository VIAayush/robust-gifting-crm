-- Additive RLS: sales sees owned records only; operations sees assigned orders;
-- clients unchanged. Does not drop tables or seeded data.

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS quotations_owner_idx ON public.quotations (owner_id);
CREATE INDEX IF NOT EXISTS requirements_owner_idx ON public.requirements (owner_id);
CREATE INDEX IF NOT EXISTS orders_owner_idx ON public.orders (owner_id);
CREATE INDEX IF NOT EXISTS order_assignments_assigned_to_idx ON public.order_assignments (assigned_to);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS leads_select ON public.leads;
DROP POLICY IF EXISTS leads_write ON public.leads;

CREATE POLICY leads_select ON public.leads
  FOR SELECT USING (
    public.can_management_read()
    OR (public.can_crm() AND (public.is_admin() OR owner_id = auth.uid()))
  );

CREATE POLICY leads_insert ON public.leads
  FOR INSERT WITH CHECK (
    public.can_crm() AND (public.is_admin() OR owner_id = auth.uid())
  );

CREATE POLICY leads_update ON public.leads
  FOR UPDATE
  USING (public.can_crm() AND (public.is_admin() OR owner_id = auth.uid()))
  WITH CHECK (public.can_crm() AND (public.is_admin() OR owner_id = auth.uid()));

CREATE POLICY leads_delete ON public.leads
  FOR DELETE USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- Requirements
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS req_select ON public.requirements;
DROP POLICY IF EXISTS req_write ON public.requirements;

CREATE POLICY req_select ON public.requirements
  FOR SELECT USING (
    public.can_management_read()
    OR (public.can_crm() AND (public.is_admin() OR owner_id = auth.uid()))
    OR (
      public.is_client()
      AND company_id = public.client_company_id()
    )
  );

CREATE POLICY req_insert ON public.requirements
  FOR INSERT WITH CHECK (
    public.can_crm() AND (public.is_admin() OR owner_id = auth.uid())
  );

CREATE POLICY req_update ON public.requirements
  FOR UPDATE
  USING (public.can_crm() AND (public.is_admin() OR owner_id = auth.uid()))
  WITH CHECK (public.can_crm() AND (public.is_admin() OR owner_id = auth.uid()));

CREATE POLICY req_delete ON public.requirements
  FOR DELETE USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- Quotations — split ALL so SELECT is not leaked to every salesperson
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS quot_select ON public.quotations;
DROP POLICY IF EXISTS quot_write ON public.quotations;

CREATE POLICY quot_select_internal ON public.quotations
  FOR SELECT USING (
    public.can_management_read()
    OR (public.can_sales() AND (public.is_admin() OR owner_id = auth.uid()))
  );

CREATE POLICY quot_select_client ON public.quotations
  FOR SELECT USING (
    public.is_client()
    AND company_id = public.client_company_id()
    AND status = ANY (ARRAY[
      'sent'::quotation_status,
      'viewed'::quotation_status,
      'accepted'::quotation_status,
      'rejected'::quotation_status,
      'expired'::quotation_status
    ])
  );

CREATE POLICY quot_insert ON public.quotations
  FOR INSERT WITH CHECK (
    public.can_sales() AND (public.is_admin() OR owner_id = auth.uid())
  );

CREATE POLICY quot_update ON public.quotations
  FOR UPDATE
  USING (public.can_sales() AND (public.is_admin() OR owner_id = auth.uid()))
  WITH CHECK (public.can_sales() AND (public.is_admin() OR owner_id = auth.uid()));

CREATE POLICY quot_delete ON public.quotations
  FOR DELETE USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- Orders — sales owned/assigned; ops assigned/department; finance + management all
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS orders_select ON public.orders;

CREATE POLICY orders_select ON public.orders
  FOR SELECT USING (
    public.can_management_read()
    OR public.can_finance()
    OR (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'sales')
      AND (owner_id = auth.uid() OR assigned_to = auth.uid())
    )
    OR (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'operations')
      AND (
        assigned_to = auth.uid()
        OR operations_user_id = auth.uid()
        OR current_department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.order_assignments oa
          WHERE oa.order_id = orders.id AND oa.assigned_to = auth.uid()
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Companies — sales sees assigned accounts only; ops/accounts keep names for work
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS companies_select ON public.companies;

CREATE POLICY companies_select ON public.companies
  FOR SELECT USING (
    public.can_management_read()
    OR public.can_ops()
    OR public.can_finance()
    OR (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'sales')
      AND owner_id = auth.uid()
    )
    OR (public.is_client() AND id = public.client_company_id())
  );

-- ---------------------------------------------------------------------------
-- Audit + activities
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS audit_select ON public.audit_logs;
CREATE POLICY audit_select ON public.audit_logs
  FOR SELECT USING (
    public.can_management_read() OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS activities_select ON public.activities;
CREATE POLICY activities_select ON public.activities
  FOR SELECT USING (
    public.can_management_read()
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  );

-- Catalogue visibility is admin-only (matches server action)
DROP POLICY IF EXISTS cpa_write ON public.company_product_access;
CREATE POLICY cpa_write ON public.company_product_access
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.protect_catalogue_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.catalogue_access IS DISTINCT FROM OLD.catalogue_access
    OR NEW.visibility IS DISTINCT FROM OLD.visibility
  ) THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admin can change product catalogue visibility';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_catalogue_access ON public.products;
CREATE TRIGGER trg_protect_catalogue_access
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_catalogue_access();
