-- Function execution hardening, found by the read-only database inspection of the live project.
-- Additive and idempotent. NOT YET APPLIED. Run AFTER 20261038_security_hardening.sql, manually in the SQL Editor.
-- No business rows are changed. Nothing here widens any grant.
--
-- Findings this fixes (all verified against the live function source / ACLs, not assumed):
--  1. Supabase grants EXECUTE on every new public function to anon, so the public API key could call
--     SECURITY DEFINER functions that perform no caller check at all:
--       notify_users            -> anyone could insert in-app notifications (any company, any link text)
--       record_campaign_event   -> anyone could write catalogue activity rows
--       recalc_order_cost / recalc_quotation_totals / refresh_invoice_status -> unauthenticated writes
--     and functions whose own check is bypassed for a caller without a profile (see 2).
--  2. assign_order tested "v_role NOT IN (...)". current_role() is NULL for a caller without a profile, so the
--     test evaluated to NULL (not true) and the exception never fired: an anonymous caller could reassign orders.
--  3. has_any_role / is_admin / current_role ignored profiles.is_active (is_internal / is_client honour it), so a
--     deactivated staff account kept every can_*() privilege at database level.
--  4. client_mark_quotation_viewed and assign_order still wrote notification links to pages that do not exist.
--  5. recalc_order_cost stored "order value minus whatever costs exist" as gross profit, so an order with no (or only
--     partial) costs reported almost its whole value as profit. It now stores profit only when every cost component has
--     been entered (same rule as the application) and is restricted to the roles that may edit order costs.
--
-- The RLS predicate helpers (is_internal, is_client, is_admin, can_*, has_permission, client_company_id,
-- has_any_role, current_role) are deliberately LEFT executable by anon: policies call them while evaluating anon
-- requests, so revoking them would turn "0 rows" into "permission denied" for the public catalogue.

-- ---------------------------------------------------------------------------
-- 1. Deactivated users lose their role-based powers at database level too.
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $fn$
  select role from public.profiles where id = auth.uid() and is_active;
$fn$;

create or replace function public.has_any_role(roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select role = any(roles) from public.profiles where id = auth.uid() and is_active), false);
$fn$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid() and is_active), false);
$fn$;

-- ---------------------------------------------------------------------------
-- 2. assign_order: a caller without an active profile is refused (it used to pass), and the link points at /crm.
-- ---------------------------------------------------------------------------
create or replace function public.assign_order(p_order_id uuid, p_assigned_to uuid, p_department_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_role public.app_role;
  v_company uuid;
  v_ord text;
begin
  v_role := public.current_role();
  if v_role is null or v_role not in ('admin', 'operations', 'management') then
    raise exception 'Not allowed to assign orders';
  end if;
  select company_id, order_number into v_company, v_ord from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  update public.orders
     set assigned_to = p_assigned_to, current_department_id = p_department_id,
         operations_user_id = coalesce(p_assigned_to, operations_user_id), updated_at = now()
   where id = p_order_id;
  insert into public.order_assignments (order_id, department_id, assigned_to, assigned_by, note)
  values (p_order_id, p_department_id, p_assigned_to, auth.uid(), p_note);
  perform public.notify_users('internal', v_company, 'Order ' || coalesce(v_ord, '') || ' was reassigned', coalesce(p_note, ''), '/crm/orders/' || p_order_id::text);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Client "viewed" marker: same behaviour, correct staff link.
-- ---------------------------------------------------------------------------
create or replace function public.client_mark_quotation_viewed(p_quotation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  q public.quotations%rowtype;
begin
  if not public.is_client() then return; end if;
  select * into q from public.quotations where id = p_quotation_id;
  if not found then return; end if;
  if q.company_id is distinct from public.client_company_id() then return; end if;
  if q.status = 'sent' then
    update public.quotations set status = 'viewed' where id = p_quotation_id;
    insert into public.quotation_history (quotation_id, from_status, to_status, changed_by)
    values (p_quotation_id, 'sent', 'viewed', auth.uid());
    perform public.notify_users('internal', q.company_id, 'Client viewed quotation', '', '/crm/quotations/' || p_quotation_id);
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. record_campaign_event: only a signed-in internal user, or a client whose company the catalogue is assigned to.
-- (It is also called from the definer functions that accept a quotation; there auth.uid() is the real caller.)
-- ---------------------------------------------------------------------------
create or replace function public.record_campaign_event(p_campaign_id uuid, p_event_type text, p_payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_event_type is null or char_length(btrim(p_event_type)) not between 1 and 60 then
    raise exception 'Invalid event type';
  end if;
  if not public.is_internal() then
    if not (
      public.is_client()
      and exists (
        select 1 from public.campaigns c
        where c.id = p_campaign_id
          and (
            c.company_id = public.client_company_id()
            or exists (select 1 from public.campaign_companies cc where cc.campaign_id = c.id and cc.company_id = public.client_company_id())
          )
      )
    ) then
      raise exception 'Not permitted';
    end if;
  end if;
  insert into public.campaign_events (campaign_id, actor_id, event_type, payload)
  values (p_campaign_id, auth.uid(), p_event_type, coalesce(p_payload, '{}'::jsonb));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. Who may execute what.
-- anon and PUBLIC lose EXECUTE on every function that is not an RLS predicate. Signed-in users keep the functions
-- the application calls with their own session; notify_users is only called by the service role (the application's
-- server code) and by the definer functions above, which run as the owner.
-- ---------------------------------------------------------------------------
revoke all on function public.notify_users(public.notification_audience, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.notify_users(public.notification_audience, uuid, text, text, text) to service_role;

revoke all on function public.record_campaign_event(uuid, text, jsonb) from public, anon;
revoke all on function public.recalc_order_cost(uuid) from public, anon;
revoke all on function public.recalc_quotation_totals(uuid) from public, anon;
revoke all on function public.refresh_invoice_status(uuid) from public, anon;
revoke all on function public.assign_order(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.advance_order_stage(uuid, public.order_status, uuid, uuid, text, date, text) from public, anon;
revoke all on function public.convert_quotation_to_order(uuid) from public, anon;
revoke all on function public.duplicate_quotation(uuid) from public, anon;
revoke all on function public.client_respond_quotation(uuid, boolean, text) from public, anon;
revoke all on function public.client_mark_quotation_viewed(uuid) from public, anon;
revoke all on function public.client_set_campaign_status(uuid, public.campaign_status) from public, anon;
revoke all on function public.provision_client_user(text, text, text, uuid, public.app_role) from public, anon;

-- The service role keeps every function (the application's server code and cron jobs use it).
grant execute on function public.record_campaign_event(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.recalc_order_cost(uuid) to authenticated, service_role;
grant execute on function public.recalc_quotation_totals(uuid) to authenticated, service_role;
grant execute on function public.refresh_invoice_status(uuid) to authenticated, service_role;
grant execute on function public.assign_order(uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.advance_order_stage(uuid, public.order_status, uuid, uuid, text, date, text) to authenticated, service_role;
grant execute on function public.convert_quotation_to_order(uuid) to authenticated, service_role;
grant execute on function public.duplicate_quotation(uuid) to authenticated, service_role;
grant execute on function public.client_respond_quotation(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.client_mark_quotation_viewed(uuid) to authenticated, service_role;
grant execute on function public.client_set_campaign_status(uuid, public.campaign_status) to authenticated, service_role;
grant execute on function public.provision_client_user(text, text, text, uuid, public.app_role) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. recalc_order_cost: same costing rule as the application (src/lib/orders/costing.ts), and only the roles that may
-- see and edit order costs (admin, accounts, management, as order_cost_summary) may call it.
-- Cost columns are NOT NULL default 0, so with this schema a stored 0 cannot be told from "not entered yet". Stored
-- gross_profit therefore means VERIFIED profit only: it is written when product, printing, courier and other cost are ALL
-- entered (> 0) and is 0 otherwise (the screen computes a clearly labelled provisional figure on the fly). Negative or NULL
-- components count as 0. A "confirmed zero" for a component needs a schema change, proposed (not made) in
-- docs/proposed/20261040_order_costs_confirmed.sql.
-- ---------------------------------------------------------------------------
create or replace function public.recalc_order_cost(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.has_any_role(array['admin', 'accounts', 'management']::public.app_role[]) then
    raise exception 'Not permitted to change order costing';
  end if;
  update public.orders set
    total_cost = greatest(coalesce(product_cost, 0), 0) + greatest(coalesce(printing_cost, 0), 0)
               + greatest(coalesce(courier_cost, 0), 0) + greatest(coalesce(other_cost, 0), 0),
    gross_profit = case
      when greatest(coalesce(product_cost, 0), 0) > 0 and greatest(coalesce(printing_cost, 0), 0) > 0
       and greatest(coalesce(courier_cost, 0), 0) > 0 and greatest(coalesce(other_cost, 0), 0) > 0
        then coalesce(order_value, 0) - (greatest(coalesce(product_cost, 0), 0) + greatest(coalesce(printing_cost, 0), 0)
                                         + greatest(coalesce(courier_cost, 0), 0) + greatest(coalesce(other_cost, 0), 0))
      else 0
    end
  where id = p_order_id;
end;
$fn$;

-- Verification (run manually after applying; every query should return the stated result):
-- select proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
--  where s.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
--    and proname not in ('is_internal','is_client','is_admin','current_role','has_any_role','has_permission','client_company_id',
--                        'can_crm','can_ops','can_finance','can_sales','can_management_read','can_orders_read','can_orders_write',
--                        'can_manage_team','can_client_admin',
--                        'handle_new_user','write_audit','track_order_status','prevent_lead_regression','protect_catalogue_access',
--                        'write_catalogue_access_audit','payments_refresh_invoice','payments_no_overpay',
--                        'quotation_requirement_guard','quotation_requirement_sync');   -- expect 0 rows
-- select has_function_privilege('authenticated', 'public.notify_users(public.notification_audience, uuid, text, text, text)', 'execute');  -- false
-- select has_function_privilege('service_role',  'public.notify_users(public.notification_audience, uuid, text, text, text)', 'execute');  -- true
-- select prosrc like '%v_role is null%' from pg_proc where proname = 'assign_order';                                                      -- true
-- select prosrc like '%is_active%' from pg_proc where proname in ('current_role', 'has_any_role', 'is_admin');                             -- true, true, true
