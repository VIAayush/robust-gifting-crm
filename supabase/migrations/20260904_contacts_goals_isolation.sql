-- Sales sees only contacts on companies they own. Split contacts ALL write policy.

DROP POLICY IF EXISTS contacts_select ON public.contacts;
DROP POLICY IF EXISTS contacts_write ON public.contacts;

CREATE POLICY contacts_select ON public.contacts
  FOR SELECT USING (
    public.can_management_read()
    OR public.can_ops()
    OR public.can_finance()
    OR (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'sales')
      AND company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
    )
    OR (public.is_client() AND company_id = public.client_company_id())
  );

CREATE POLICY contacts_insert ON public.contacts
  FOR INSERT WITH CHECK (
    public.can_crm() AND (
      public.is_admin()
      OR company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
    )
  );

CREATE POLICY contacts_update ON public.contacts
  FOR UPDATE
  USING (
    public.can_crm() AND (
      public.is_admin()
      OR company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
    )
  )
  WITH CHECK (
    public.can_crm() AND (
      public.is_admin()
      OR company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
    )
  );

CREATE POLICY contacts_delete ON public.contacts
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS goals_all ON public.goals;
CREATE POLICY goals_select ON public.goals
  FOR SELECT USING (
    public.can_management_read()
    OR owner_id = auth.uid()
    OR owner_id IS NULL
  );
CREATE POLICY goals_write ON public.goals
  FOR ALL
  USING (public.can_management_read())
  WITH CHECK (public.can_management_read());
