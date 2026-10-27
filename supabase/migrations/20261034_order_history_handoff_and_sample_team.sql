-- (1) Order stage history keeps the assignee, department and due date of every hand-off (SOW 3.6), and a
--     stage change through advance_order_stage writes ONE history row instead of two.
-- (2) Sample movements to or from the team location are recorded (SOW 3.8). The old CHECK constraints only
--     allowed supplier/office/client, so a "team" move changed stock and then failed to log the movement.
-- Additive and idempotent. Apply after 20261033_quotation_item_decisions.sql, manually in the SQL Editor.

-- ---------------------------------------------------------------------------
-- 1. Order stage history
-- ---------------------------------------------------------------------------
alter table public.order_status_history
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists department_id uuid references public.departments(id) on delete set null,
  add column if not exists stage_due_at date;

-- The trigger records status changes made by direct UPDATEs. advance_order_stage records its own, richer row
-- and sets a transaction-local flag so the trigger does not add a duplicate.
create or replace function public.track_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if coalesce(current_setting('app.skip_order_status_trigger', true), '') <> '1' then
      insert into public.order_status_history (order_id, from_status, to_status, changed_by)
      values (new.id, old.status, new.status, auth.uid());
    end if;
    if new.status = 'delivered' and new.actual_delivery_date is null then new.actual_delivery_date := current_date; end if;
  end if;
  return new;
end;
$fn$;

create or replace function public.advance_order_stage(
  p_order_id uuid,
  p_status public.order_status default null,
  p_assigned_to uuid default null,
  p_department_id uuid default null,
  p_comment text default null,
  p_stage_due date default null,
  p_next_action text default null
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_role public.app_role;
  v_old public.order_status;
  v_company uuid;
  v_ord text;
  v_client_label text;
  v_new public.order_status;
  v_dept uuid;
begin
  v_role := public.current_role();
  if v_role is null or v_role in ('client_admin','client_user','sales','management') then
    raise exception 'Not permitted to change order stages';
  end if;
  if v_role = 'accounts' and coalesce(p_status, 'delivered') not in ('delivered') then
    raise exception 'Accounts cannot change this operational stage';
  end if;
  if v_role not in ('admin','operations','accounts') then
    raise exception 'Not permitted to change order stages';
  end if;

  select status, company_id, order_number, current_department_id
    into v_old, v_company, v_ord, v_dept
  from public.orders where id = p_order_id;
  if v_old is null then raise exception 'Order not found'; end if;

  v_new := coalesce(p_status, v_old);
  v_dept := coalesce(p_department_id, v_dept);

  -- This function writes the history row itself (with assignee, department and due date).
  perform set_config('app.skip_order_status_trigger', '1', true);

  update public.orders set
    status = v_new,
    assigned_to = coalesce(p_assigned_to, assigned_to),
    current_department_id = coalesce(p_department_id, current_department_id),
    operations_user_id = coalesce(p_assigned_to, operations_user_id),
    stage_due_at = coalesce(p_stage_due, stage_due_at),
    next_action = coalesce(p_next_action, next_action),
    actual_delivery_date = case when v_new = 'delivered' then coalesce(actual_delivery_date, current_date) else actual_delivery_date end,
    updated_at = now()
  where id = p_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, note, changed_at, assigned_to, department_id, stage_due_at)
  values (p_order_id, v_old, v_new, auth.uid(), p_comment, now(), p_assigned_to, v_dept, p_stage_due);

  if p_department_id is not null or p_assigned_to is not null then
    insert into public.order_assignments (order_id, department_id, assigned_to, assigned_by, note)
    values (p_order_id, p_department_id, p_assigned_to, auth.uid(), coalesce(p_comment, 'Stage changed to ' || v_new::text));
  end if;

  if v_new is distinct from v_old then
    if v_new = 'procurement' then
      insert into public.tasks (title, order_id, department_id, assigned_to, created_by, due_at, description, status, priority)
      values ('Confirm supplier availability', p_order_id, v_dept, p_assigned_to, auth.uid(), coalesce(p_stage_due, current_date + 2), p_comment, 'open', 2);
    elsif v_new = 'printing' then
      insert into public.tasks (title, order_id, department_id, assigned_to, created_by, due_at, description, status, priority)
      values ('Complete logo printing / customization', p_order_id, v_dept, p_assigned_to, auth.uid(), coalesce(p_stage_due, current_date + 3), p_comment, 'open', 2);
    elsif v_new = 'quality_check' then
      insert into public.tasks (title, order_id, department_id, assigned_to, created_by, due_at, description, status, priority)
      values ('Quality check finished goods', p_order_id, v_dept, p_assigned_to, auth.uid(), coalesce(p_stage_due, current_date + 1), p_comment, 'open', 1);
    elsif v_new in ('ready_to_dispatch','dispatched') then
      insert into public.tasks (title, order_id, department_id, assigned_to, created_by, due_at, description, status, priority)
      values ('Book courier and upload tracking', p_order_id, v_dept, p_assigned_to, auth.uid(), coalesce(p_stage_due, current_date + 1), p_comment, 'open', 2);
    elsif v_new = 'delivered' then
      insert into public.tasks (title, order_id, department_id, assigned_to, created_by, due_at, description, status, priority)
      values ('Generate invoice', p_order_id, (select id from departments where slug = 'accounts' limit 1), (select manager_id from departments where slug = 'accounts' limit 1), auth.uid(), current_date + 1, p_comment, 'open', 1);
    end if;
  end if;

  perform public.notify_users('internal', v_company, 'Order ' || v_ord || ' moved to ' || replace(v_new::text, '_', ' '), coalesce(p_comment, ''), '/crm/orders/' || p_order_id::text);

  -- Customer-facing wording follows the eight SOW stages.
  v_client_label := case v_new
      when 'created' then 'received'
      when 'confirmed' then 'in planning'
      when 'procurement' then 'in procurement'
      when 'printing' then 'in printing'
      when 'quality_check' then 'in quality check'
      when 'ready_to_dispatch' then 'being packed'
      when 'dispatched' then 'in transit'
      when 'delivered' then 'delivered'
      when 'in_progress' then 'in production'
      else replace(v_new::text, '_', ' ')
    end;
  perform public.notify_users('client', v_company, 'Your order ' || v_ord || ' is now ' || v_client_label, '', '/portal/orders/' || p_order_id::text);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Sample movements: allow the team location
-- ---------------------------------------------------------------------------
alter table public.sample_movements drop constraint if exists sample_movements_from_holder_check;
alter table public.sample_movements drop constraint if exists sample_movements_to_holder_check;
alter table public.sample_movements add constraint sample_movements_from_holder_check
  check (from_holder = any (array['supplier'::text, 'office'::text, 'client'::text, 'team'::text]));
alter table public.sample_movements add constraint sample_movements_to_holder_check
  check (to_holder = any (array['supplier'::text, 'office'::text, 'client'::text, 'team'::text]));

create or replace function public.move_sample(
  p_product_id uuid, p_quantity integer, p_from text, p_to text,
  p_company_id uuid default null, p_requirement_id uuid default null, p_cost numeric default 0, p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare v_row public.sample_stock%rowtype;
begin
  if not public.has_any_role(array['admin','sales','operations']::public.app_role[]) then
    raise exception 'Not permitted';
  end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be positive'; end if;
  if p_from not in ('supplier','office','client','team') or p_to not in ('supplier','office','client','team') or p_from = p_to then
    raise exception 'Invalid sample location';
  end if;
  insert into public.sample_stock (product_id) values (p_product_id) on conflict (product_id) do nothing;
  select * into v_row from public.sample_stock where product_id = p_product_id for update;
  if p_from = 'office' and v_row.in_office < p_quantity then raise exception 'Not enough samples in office'; end if;
  if p_from = 'client' and v_row.with_client < p_quantity then raise exception 'Not enough samples with client'; end if;
  if p_from = 'supplier' and v_row.pending_supplier < p_quantity then raise exception 'Not enough samples pending supplier'; end if;
  if p_from = 'team' and v_row.with_team < p_quantity then raise exception 'Not enough samples with the team'; end if;
  update public.sample_stock set
    in_office = in_office + case when p_to = 'office' then p_quantity else 0 end - case when p_from = 'office' then p_quantity else 0 end,
    with_client = with_client + case when p_to = 'client' then p_quantity else 0 end - case when p_from = 'client' then p_quantity else 0 end,
    pending_supplier = pending_supplier + case when p_to = 'supplier' then p_quantity else 0 end - case when p_from = 'supplier' then p_quantity else 0 end,
    with_team = with_team + case when p_to = 'team' then p_quantity else 0 end - case when p_from = 'team' then p_quantity else 0 end
  where product_id = p_product_id;
  insert into public.sample_movements (product_id, quantity, from_holder, to_holder, company_id, requirement_id, cost, note, created_by)
  values (p_product_id, p_quantity, p_from, p_to, p_company_id, p_requirement_id, coalesce(p_cost, 0), p_note, auth.uid());
end;
$fn$;

-- Verification:
-- select column_name from information_schema.columns where table_name = 'order_status_history' and column_name in ('assigned_to','department_id','stage_due_at');
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conname like 'sample_movements_%_holder_check';
