-- Security hardening found by the self-audit. Additive and idempotent. NOT YET APPLIED.
-- Run AFTER 20261037. No business rows are deleted or rewritten; the only data change is repairing the
-- link text of existing in-app notifications whose path pointed at a page that does not exist.
--
-- 1. handle_new_user: stop trusting role / company_id sent by the visitor.
-- 2. Staff can no longer change a requirement's workflow stage by writing the column directly.
-- 3. quotation_accepted_items / _total: respect the caller's access (they leaked other companies' quotation lines).
-- 4. payments: a payment can never push an invoice past its amount, even under concurrent inserts.
-- 5. notifications: clients cannot create notifications; users can only change the read flag.
-- 6. Broken notification links repaired.
-- 8. Audit log: cost and margin figures are no longer copied into audit_logs, and a user can no longer read
--    cost-bearing audit rows just because they made the change; only internal users may write audit rows.
-- 7. tasks.status accepts 'blocked' (the task screens already offer it; the old check rejected it).

-- ---------------------------------------------------------------------------
-- 1. New-user trigger.
-- A visitor can call Supabase Auth directly with any user_metadata, so role and company_id from user_metadata
-- must never decide a profile. Only raw_app_meta_data (settable by the service role / admin API only) may.
-- The default is the least-privileged role; every in-app flow (client login, team invite, portal invite)
-- sets the real role and company on the profile explicitly right after creating the user.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_role public.app_role := 'client_user';
  v_company uuid := null;
begin
  begin
    if new.raw_app_meta_data ? 'role' then
      v_role := (new.raw_app_meta_data->>'role')::public.app_role;
    end if;
    v_company := nullif(new.raw_app_meta_data->>'company_id', '')::uuid;
  exception when others then
    v_role := 'client_user';
    v_company := null;
  end;
  insert into public.profiles (id, full_name, email, role, company_id)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    v_role,
    v_company
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Workflow stage guard. The SECURITY DEFINER functions (requirement_transition, the quotation sync trigger)
-- run as the table owner; a direct API write runs as 'authenticated' (or 'anon') and is refused.
-- ---------------------------------------------------------------------------
create or replace function public.requirement_workflow_guard()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if current_user in ('authenticated', 'anon') then
    if new.workflow_stage is distinct from old.workflow_stage
       or new.submitted_at is distinct from old.submitted_at
       or new.admin_decided_at is distinct from old.admin_decided_at
       or new.admin_decided_by is distinct from old.admin_decided_by
       or new.client_confirmed_at is distinct from old.client_confirmed_at
       or new.client_confirmed_by is distinct from old.client_confirmed_by
       or new.selection_submitted_at is distinct from old.selection_submitted_at
       or new.selection_decided_at is distinct from old.selection_decided_at
       or new.selection_decided_by is distinct from old.selection_decided_by
       or new.decision_note is distinct from old.decision_note
       or new.company_id is distinct from old.company_id then
      raise exception 'Workflow fields change only through the requirement workflow';
    end if;
    -- A requirement inside the client workflow keeps its approved scope fixed once it has been approved.
    if old.workflow_stage is not null
       and old.workflow_stage not in ('submitted', 'changes_requested', 'admin_rejected')
       and (new.budget is distinct from old.budget or new.quantity is distinct from old.quantity) then
      raise exception 'The approved budget and quantity cannot be edited after approval';
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists requirements_workflow_guard on public.requirements;
create trigger requirements_workflow_guard before update on public.requirements
  for each row execute function public.requirement_workflow_guard();

-- ---------------------------------------------------------------------------
-- 3. Accepted-lines helpers run with the CALLER's rights, so row-level security on quotation_items and
-- quotations decides what is visible. The definer functions that call them run as the owner and are unaffected.
-- ---------------------------------------------------------------------------
create or replace function public.quotation_accepted_items(p_quotation_id uuid)
returns setof public.quotation_items
language sql
stable
security invoker
set search_path = public
as $fn$
  select qi.*
  from public.quotation_items qi
  where qi.quotation_id = p_quotation_id
    and (
      qi.client_decision = 'accepted'
      or not exists (
        select 1 from public.quotation_items d
        where d.quotation_id = p_quotation_id and d.client_decision <> 'pending'
      )
    );
$fn$;

create or replace function public.quotation_accepted_total(p_quotation_id uuid)
returns numeric
language plpgsql
stable
security invoker
set search_path = public
as $fn$
declare
  q public.quotations%rowtype;
  v_sub numeric(14,2);
  v_disc numeric(14,2);
  v_tax numeric(14,2);
begin
  select * into q from public.quotations where id = p_quotation_id;
  if not found then return 0; end if;
  select coalesce(sum(quantity * unit_price), 0) into v_sub from public.quotation_accepted_items(p_quotation_id);
  v_disc := round(v_sub * q.discount_percent / 100, 2);
  v_tax := round((v_sub - v_disc) * q.tax_percent / 100, 2);
  return v_sub - v_disc + v_tax;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. No overpayment. The invoice row is locked so two concurrent payments cannot both fit.
-- ---------------------------------------------------------------------------
create or replace function public.payments_no_overpay()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_amount numeric(14,2);
  v_other numeric(14,2);
begin
  if new.amount is null or new.amount <= 0 then raise exception 'A payment must be greater than zero'; end if;
  select amount into v_amount from public.invoices where id = new.invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  select coalesce(sum(amount), 0) into v_other from public.payments
    where invoice_id = new.invoice_id and (tg_op = 'INSERT' or id <> new.id);
  if v_other + new.amount > v_amount then
    raise exception 'Payments (%) would exceed the invoice amount (%)', v_other + new.amount, v_amount;
  end if;
  return new;
end;
$fn$;

drop trigger if exists payments_no_overpay on public.payments;
create trigger payments_no_overpay before insert or update of amount, invoice_id on public.payments
  for each row execute function public.payments_no_overpay();

-- ---------------------------------------------------------------------------
-- 5. Notifications: written by definer functions and the service role only; a user may only mark their own as read.
-- ---------------------------------------------------------------------------
drop policy if exists notifications_insert_internal on public.notifications;
create policy notifications_insert_internal on public.notifications as permissive for insert to authenticated
  with check (is_internal());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications as permissive for update to authenticated
  using (
    (audience = 'internal' and is_internal())
    or (audience = 'client' and is_client() and company_id = client_company_id() and (user_id is null or user_id = auth.uid()))
  )
  with check (
    (audience = 'internal' and is_internal())
    or (audience = 'client' and is_client() and company_id = client_company_id() and (user_id is null or user_id = auth.uid()))
  );

revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Repair links that pointed at pages that do not exist (/orders/<id>, /quotations/<id> -> under /crm).
-- ---------------------------------------------------------------------------
update public.notifications
set link = '/crm' || link
where audience = 'internal' and (link like '/orders/%' or link like '/quotations/%');

-- ---------------------------------------------------------------------------
-- 7. Tasks: the screens offer 'Blocked' but the check constraint refused it.
-- ---------------------------------------------------------------------------
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status = any (array['open'::text, 'in_progress'::text, 'blocked'::text, 'done'::text, 'cancelled'::text]));

-- ---------------------------------------------------------------------------
-- 8. Audit log and costs.
-- write_audit() stored to_jsonb(row) for orders and products, so product_cost, supplier_cost, internal_margin and
-- friends were copied into audit_logs, which an internal user can read for any change they made (audit_select:
-- user_id = auth.uid()). The trigger now removes those keys (names only are recorded), the own-rows read no longer
-- covers cost-bearing entities, and audit rows can only be written by internal users as themselves.
-- Existing audit rows are NOT rewritten: they stay readable by admin and management only (the roles allowed to see
-- costs by default). To scrub them as well, see the optional statement at the very bottom.
-- The key list below must match src/lib/audit-redact.ts (a test compares the two).
-- ---------------------------------------------------------------------------
create or replace function public.audit_redact(p_entity text, p_row jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $fn$
declare
  v_keys text[] := array['product_cost', 'printing_cost', 'courier_cost', 'other_cost', 'total_cost', 'gross_profit',
                         'supplier_cost', 'supplier_cost_snapshot', 'internal_margin'];
  v_present text[];
begin
  if p_row is null then return null; end if;
  if p_entity in ('products', 'product') then v_keys := v_keys || array['internal_notes']; end if;
  select coalesce(array_agg(k), array[]::text[]) into v_present from unnest(v_keys) k where p_row ? k;
  if cardinality(v_present) = 0 then return p_row; end if;
  return (p_row - v_keys) || jsonb_build_object('restricted_fields_changed', to_jsonb(v_present));
end;
$fn$;

create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare v_action text;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs(user_id, action, entity, entity_id, new_value)
    values (auth.uid(), 'create', tg_table_name, new.id, public.audit_redact(tg_table_name, to_jsonb(new)));
    return new;
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    if to_jsonb(new) ? 'status' and (to_jsonb(new)->>'status') is distinct from (to_jsonb(old)->>'status') then v_action := 'status_change';
    elsif to_jsonb(new) ? 'owner_id' and (to_jsonb(new)->>'owner_id') is distinct from (to_jsonb(old)->>'owner_id') then v_action := 'assignment_change'; end if;
    insert into public.audit_logs(user_id, action, entity, entity_id, previous_value, new_value)
    values (auth.uid(), v_action, tg_table_name, new.id, public.audit_redact(tg_table_name, to_jsonb(old)), public.audit_redact(tg_table_name, to_jsonb(new)));
    return new;
  else
    insert into public.audit_logs(user_id, action, entity, entity_id, previous_value)
    values (auth.uid(), 'delete', tg_table_name, old.id, public.audit_redact(tg_table_name, to_jsonb(old)));
    return old;
  end if;
end;
$fn$;

drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs as permissive for select to public
  using (
    public.can_management_read()
    or (user_id = auth.uid() and entity not in ('orders', 'order_items', 'products', 'product', 'product_suppliers', 'product_supplier'))
  );

drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs as permissive for insert to authenticated
  with check (is_internal() and (user_id is null or user_id = auth.uid()));

-- OPTIONAL, run by hand only after taking a backup and deciding that historic cost values should disappear from the
-- audit log (this rewrites existing audit rows, so it is NOT part of the migration):
--   update public.audit_logs
--   set previous_value = public.audit_redact(entity, previous_value), new_value = public.audit_redact(entity, new_value)
--   where entity in ('orders', 'order_items', 'products', 'product', 'product_suppliers', 'product_supplier');

-- Verification (run manually after applying):
-- select tgname from pg_trigger where tgname in ('requirements_workflow_guard', 'payments_no_overpay');
-- select proname, prosecdef from pg_proc where proname in ('quotation_accepted_items', 'quotation_accepted_total'); -- both false
-- select public.audit_redact('products', '{"name":"x","supplier_cost":5}'::jsonb); -- no supplier_cost, restricted_fields_changed present
-- select polname from pg_policy where polrelid = 'public.audit_logs'::regclass; -- audit_select, audit_insert
-- select column_name from information_schema.column_privileges where table_name = 'notifications' and grantee = 'authenticated' and privilege_type = 'UPDATE'; -- read_at only
