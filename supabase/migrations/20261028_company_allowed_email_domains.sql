-- Allowed e-mail domains per company (RG: company onboarding).
-- Additive and idempotent. An empty array means "no restriction", so every
-- existing company keeps working exactly as before.
-- Apply AFTER 20261027_requirement_workflow.sql, manually in the Supabase SQL Editor.

alter table public.companies
  add column if not exists allowed_email_domains text[] not null default '{}';

do $fn$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_allowed_email_domains_size') then
    alter table public.companies add constraint companies_allowed_email_domains_size
      check (coalesce(array_length(allowed_email_domains, 1), 0) <= 20);
  end if;
end
$fn$;

-- Verification:
-- select column_name, data_type, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'companies' and column_name = 'allowed_email_domains';
