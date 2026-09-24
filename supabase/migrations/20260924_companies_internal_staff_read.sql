-- Fix: sample_requests_select already grants ALL internal staff (is_internal())
-- read access regardless of company ownership, and /crm/samples lists every
-- pending/approved request with no owner filter — but companies_select only
-- let a 'sales' role read companies they personally own, so the joined
-- company:companies(name) came back null for any request from a company the
-- viewing rep didn't own, showing "—" instead of the company name in the CRM.
-- Bring companies_select in line with the already-broad sample_requests policy.
drop policy if exists companies_select on public.companies;

create policy companies_select on public.companies
for select
using (
  is_internal()
  or (is_client() and id = client_company_id())
);
