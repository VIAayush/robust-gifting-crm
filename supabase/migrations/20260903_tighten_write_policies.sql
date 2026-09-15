-- Keep FOR ALL write policies from leaking SELECT.
-- Sales can only update companies they own.

DROP POLICY IF EXISTS activities_write ON public.activities;
CREATE POLICY activities_insert ON public.activities
  FOR INSERT WITH CHECK (public.is_internal());
CREATE POLICY activities_update ON public.activities
  FOR UPDATE
  USING (public.can_management_read() OR assigned_to = auth.uid() OR created_by = auth.uid())
  WITH CHECK (public.can_management_read() OR assigned_to = auth.uid() OR created_by = auth.uid());
CREATE POLICY activities_delete ON public.activities
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS companies_update ON public.companies;
CREATE POLICY companies_update ON public.companies
  FOR UPDATE
  USING (
    public.is_admin()
    OR (public.can_crm() AND owner_id = auth.uid())
  )
  WITH CHECK (
    public.is_admin()
    OR (public.can_crm() AND owner_id = auth.uid())
  );
