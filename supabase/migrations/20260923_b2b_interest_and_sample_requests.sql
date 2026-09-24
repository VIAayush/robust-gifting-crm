-- B2B persistent Interest List + customer-facing Sample Request ticket.
--
-- Purely additive: no existing table, column or row is changed or removed.
--
-- Why new tables instead of reusing client_product_selections / sample_movements:
--   * client_product_selections is scoped to a campaign_id + campaign_product_id
--     (a sales-curated, per-company offering list that must be published first).
--     The portal's general "browse my whole assigned catalogue" page has no
--     campaign at all, so that table structurally cannot represent "I'm
--     interested in this catalogue product" the way the client wants.
--   * sample_movements is a completed-fact inventory ledger (from_holder/
--     to_holder), written only by staff, with no draft/pending/status concept
--     and RLS that blocks any client access outright. A customer-initiated,
--     reviewable request needs its own status field, which that table has no
--     room for without changing its meaning for existing internal reporting.
--
-- Both new tables mirror the exact RLS pattern already used everywhere else
-- for client-facing rows: is_client() AND company_id = client_company_id().
-- A fulfilled sample_requests row links to the sample_movements row staff
-- actually created (fulfilled_via_movement_id), so the existing Samples page
-- stays the single source of truth for real stock movement.

-- ---------------------------------------------------------------------------
-- company_product_interests: persistent, DB-backed B2B "Interest List".
-- Replaces the browser-localStorage-only catalogue-shortlist for portal use.
-- ---------------------------------------------------------------------------
create table if not exists public.company_product_interests (
  id uuid default gen_random_uuid() not null primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  quantity integer,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create index if not exists company_product_interests_company_idx
  on public.company_product_interests (company_id);
create index if not exists company_product_interests_product_idx
  on public.company_product_interests (product_id);

alter table public.company_product_interests enable row level security;

drop policy if exists interests_select on public.company_product_interests;
drop policy if exists interests_insert on public.company_product_interests;
drop policy if exists interests_update on public.company_product_interests;
drop policy if exists interests_delete on public.company_product_interests;
drop policy if exists interests_admin_write on public.company_product_interests;

create policy interests_select on public.company_product_interests
  as permissive for select to authenticated
  using (is_internal() or (is_client() and company_id = client_company_id()));

create policy interests_insert on public.company_product_interests
  as permissive for insert to authenticated
  with check (is_client() and company_id = client_company_id() and user_id = auth.uid());

create policy interests_update on public.company_product_interests
  as permissive for update to authenticated
  using (is_client() and company_id = client_company_id() and user_id = auth.uid())
  with check (is_client() and company_id = client_company_id() and user_id = auth.uid());

create policy interests_delete on public.company_product_interests
  as permissive for delete to authenticated
  using (is_client() and company_id = client_company_id() and user_id = auth.uid());

create policy interests_admin_write on public.company_product_interests
  as permissive for all to authenticated
  using (is_admin()) with check (is_admin());

drop trigger if exists set_updated_at_company_product_interests on public.company_product_interests;
create trigger set_updated_at_company_product_interests
  before update on public.company_product_interests
  for each row execute function public.set_updated_at();

drop trigger if exists audit_company_product_interests on public.company_product_interests;
create trigger audit_company_product_interests
  after insert or update or delete on public.company_product_interests
  for each row execute function public.write_audit();

-- ---------------------------------------------------------------------------
-- sample_requests: customer-facing request ticket with a status, reviewed by
-- staff on the existing internal Samples page. Fulfilling a request re-uses
-- the existing sendSampleToClient/moveSample action, which writes the real
-- sample_movements row this table then links back to.
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.sample_request_status as enum ('pending', 'approved', 'shipped', 'rejected');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.sample_requests (
  id uuid default gen_random_uuid() not null primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  requested_by uuid references public.profiles(id) on delete set null,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  quantity integer default 1 not null,
  notes text,
  status public.sample_request_status default 'pending' not null,
  requested_date date,
  assigned_to uuid references public.profiles(id) on delete set null,
  fulfilled_via_movement_id uuid references public.sample_movements(id) on delete set null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create index if not exists sample_requests_company_idx on public.sample_requests (company_id);
create index if not exists sample_requests_status_idx on public.sample_requests (status);

alter table public.sample_requests enable row level security;

drop policy if exists sample_requests_select on public.sample_requests;
drop policy if exists sample_requests_insert on public.sample_requests;
drop policy if exists sample_requests_update on public.sample_requests;
drop policy if exists sample_requests_delete on public.sample_requests;

create policy sample_requests_select on public.sample_requests
  as permissive for select to authenticated
  using (is_internal() or (is_client() and company_id = client_company_id()));

create policy sample_requests_insert on public.sample_requests
  as permissive for insert to authenticated
  with check (is_client() and company_id = client_company_id() and requested_by = auth.uid());

create policy sample_requests_update on public.sample_requests
  as permissive for update to authenticated
  using (has_any_role(array['admin'::app_role, 'sales'::app_role, 'operations'::app_role]))
  with check (has_any_role(array['admin'::app_role, 'sales'::app_role, 'operations'::app_role]));

create policy sample_requests_delete on public.sample_requests
  as permissive for delete to authenticated
  using (is_admin());

drop trigger if exists set_updated_at_sample_requests on public.sample_requests;
create trigger set_updated_at_sample_requests
  before update on public.sample_requests
  for each row execute function public.set_updated_at();

drop trigger if exists audit_sample_requests on public.sample_requests;
create trigger audit_sample_requests
  after insert or update or delete on public.sample_requests
  for each row execute function public.write_audit();
