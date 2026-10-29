-- Client responses to catalogues sent by staff (accept / select products / ask for changes).
-- ADDITIVE and idempotent: one new table, nothing existing is altered or rewritten. Safe to run more than once.
-- Run in the Supabase SQL editor for project zrfetfibatcuvwogyvjn AFTER 20261039_function_execute_hardening.sql.
--
-- Why a table of its own: a catalogue can be assigned to several companies, and the existing campaign_events
-- history is readable by every company the catalogue is assigned to, so a response stored there would leak one
-- company's selection to another. This table is company-scoped by row-level security.
--
-- Design:
--  * One OPEN response per (catalogue, company): resubmitting while it is still awaiting staff updates that row
--    (revision + 1) instead of creating a second one. Once staff process it, a later submission starts a new row.
--  * The client's selection is a snapshot (items jsonb: product, name, quantity, note, catalogue price). The
--    assigned catalogue itself (campaign_products) is never modified by a client.
--  * Writes happen only in the application's server code (service role) after it has checked the caller. There is
--    deliberately NO insert/update/delete policy for any API role.
--
-- Rollback: drop table public.catalogue_responses;   (nothing else depends on it)

create table if not exists public.catalogue_responses (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  submitted_by uuid references public.profiles(id) on delete set null,
  status text not null default 'submitted' check (status in ('submitted', 'processed')),
  comment text check (comment is null or char_length(comment) <= 2000),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  revision integer not null default 1 check (revision >= 1),
  submitted_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles(id) on delete set null,
  requirement_id uuid references public.requirements(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one open response per catalogue and company, so a double click or a retry cannot stack duplicates.
create unique index if not exists catalogue_responses_one_open
  on public.catalogue_responses (campaign_id, company_id) where status = 'submitted';
create index if not exists catalogue_responses_company_idx on public.catalogue_responses (company_id, status);
create index if not exists catalogue_responses_campaign_idx on public.catalogue_responses (campaign_id, status);
-- A requirement can come from at most one response (idempotent "create requirement from response").
create unique index if not exists catalogue_responses_one_per_requirement
  on public.catalogue_responses (requirement_id) where requirement_id is not null;

alter table public.catalogue_responses enable row level security;

drop policy if exists catalogue_responses_select_internal on public.catalogue_responses;
create policy catalogue_responses_select_internal on public.catalogue_responses for select
  using (can_crm() or can_ops() or can_finance() or can_management_read());

-- A client sees only their own company's responses.
drop policy if exists catalogue_responses_select_client on public.catalogue_responses;
create policy catalogue_responses_select_client on public.catalogue_responses for select
  using (is_client() and company_id = client_company_id());

revoke all on table public.catalogue_responses from anon;
revoke insert, update, delete, truncate on table public.catalogue_responses from authenticated;
grant select on table public.catalogue_responses to authenticated;
grant all on table public.catalogue_responses to service_role;

drop trigger if exists set_updated_at_catalogue_responses on public.catalogue_responses;
create trigger set_updated_at_catalogue_responses
  before update on public.catalogue_responses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Verify (service role). Expected: relrowsecurity = true; 2 select policies; no write grants for authenticated; anon sees nothing.
-- select relrowsecurity from pg_class where oid = 'public.catalogue_responses'::regclass;
-- select policyname, cmd from pg_policies where tablename = 'catalogue_responses';
-- select privilege_type from information_schema.role_table_grants where table_name = 'catalogue_responses' and grantee = 'authenticated';
