-- Item-by-item quotation acceptance (SOW 3.5 / 5.1): a client accepts or rejects each quotation line,
-- and only the accepted lines become an order.
-- Additive and idempotent. Apply after 20261032_site_banners.sql, manually in the SQL Editor.
-- Existing quotations keep working: a quotation with no recorded item decisions is treated as
-- "all items accepted" when it was accepted, exactly as before.

alter table public.quotation_items
  add column if not exists client_decision text not null default 'pending',
  add column if not exists client_decided_at timestamptz;

do $fn$
begin
  if not exists (select 1 from pg_constraint where conname = 'quotation_items_client_decision_check') then
    alter table public.quotation_items add constraint quotation_items_client_decision_check
      check (client_decision in ('pending', 'accepted', 'rejected'));
  end if;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Lines that count as accepted for a quotation. A quotation with no item-level decisions at all
-- (accepted before this migration) counts every line, which preserves the old behaviour.
-- ---------------------------------------------------------------------------
create or replace function public.quotation_accepted_items(p_quotation_id uuid)
returns setof public.quotation_items
language sql
stable
security definer
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

-- Total of the accepted lines using the same formula as recalc_quotation_totals (header discount % and tax %).
create or replace function public.quotation_accepted_total(p_quotation_id uuid)
returns numeric
language plpgsql
stable
security definer
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

revoke all on function public.quotation_accepted_items(uuid) from public, anon;
revoke all on function public.quotation_accepted_total(uuid) from public, anon;
grant execute on function public.quotation_accepted_items(uuid) to authenticated;
grant execute on function public.quotation_accepted_total(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Client response, item by item. p_decisions = [{"item_id": "<uuid>", "accept": true|false}, ...]
-- and must cover every line of the quotation exactly once.
-- ---------------------------------------------------------------------------
create or replace function public.client_respond_quotation_items(p_quotation_id uuid, p_decisions jsonb, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  q public.quotations%rowtype;
  v_status public.quotation_status;
  v_total_items integer;
  v_decided integer;
  v_matched integer;
  v_accepted integer;
begin
  if not public.is_client() then raise exception 'Not permitted'; end if;
  select * into q from public.quotations where id = p_quotation_id;
  if not found then raise exception 'Quotation not found'; end if;
  if q.company_id is distinct from public.client_company_id() then raise exception 'Quotation not found'; end if;
  if q.status not in ('sent', 'viewed') then raise exception 'This quotation can no longer be answered'; end if;
  if q.valid_until is not null and q.valid_until < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'This quotation has expired. Please ask us for a refreshed quotation';
  end if;
  if p_decisions is null or jsonb_typeof(p_decisions) <> 'array' then raise exception 'Please accept or reject each item'; end if;

  select count(*) into v_total_items from public.quotation_items where quotation_id = p_quotation_id;
  if v_total_items = 0 then raise exception 'This quotation has no items'; end if;
  select count(*), count(distinct (d->>'item_id')) into v_decided, v_matched from jsonb_array_elements(p_decisions) d;
  if v_decided <> v_total_items or v_matched <> v_total_items then raise exception 'Please accept or reject every item exactly once'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_decisions) d
    where not exists (select 1 from public.quotation_items qi where qi.quotation_id = p_quotation_id and qi.id::text = d->>'item_id')
       or jsonb_typeof(d->'accept') <> 'boolean'
  ) then raise exception 'One of the items does not belong to this quotation'; end if;

  update public.quotation_items qi
    set client_decision = case when (d->>'accept')::boolean then 'accepted' else 'rejected' end,
        client_decided_at = now()
    from jsonb_array_elements(p_decisions) d
    where qi.quotation_id = p_quotation_id and qi.id::text = d->>'item_id';

  select count(*) into v_accepted from public.quotation_items where quotation_id = p_quotation_id and client_decision = 'accepted';
  v_status := case when v_accepted > 0 then 'accepted'::public.quotation_status else 'rejected'::public.quotation_status end;

  update public.quotations
    set status = v_status, client_comment = left(p_comment, 1000), responded_at = now(), responded_by = auth.uid()
    where id = p_quotation_id;
  insert into public.quotation_history (quotation_id, from_status, to_status, changed_by, note)
  values (p_quotation_id, q.status, v_status, auth.uid(),
          concat(v_accepted, ' of ', v_total_items, ' items accepted', case when coalesce(btrim(p_comment), '') <> '' then ': ' || left(p_comment, 1000) else '' end));
  if q.campaign_id is not null then
    update public.campaigns set status = case when v_accepted > 0 then 'approved'::public.campaign_status else 'rejected'::public.campaign_status end
    where id = q.campaign_id;
    perform public.record_campaign_event(q.campaign_id, case when v_accepted > 0 then 'quotation_accepted' else 'quotation_rejected' end,
      jsonb_build_object('quotation_id', p_quotation_id, 'accepted_items', v_accepted, 'total_items', v_total_items));
  end if;
  perform public.notify_users('internal', q.company_id,
    case when v_accepted = v_total_items then 'Quotation accepted'
         when v_accepted > 0 then 'Quotation partly accepted (' || v_accepted || ' of ' || v_total_items || ' items)'
         else 'Quotation rejected' end,
    coalesce(p_comment, ''), '/crm/quotations/' || p_quotation_id);
end;
$fn$;

revoke all on function public.client_respond_quotation_items(uuid, jsonb, text) from public, anon;
grant execute on function public.client_respond_quotation_items(uuid, jsonb, text) to authenticated;

-- The original whole-quotation function now also records the per-item decisions, so both paths agree.
create or replace function public.client_respond_quotation(p_quotation_id uuid, p_accept boolean, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  q public.quotations%rowtype;
  v_status public.quotation_status;
begin
  if not public.is_client() then raise exception 'Not permitted'; end if;
  select * into q from public.quotations where id = p_quotation_id;
  if not found then raise exception 'Quotation not found'; end if;
  if q.company_id is distinct from public.client_company_id() then raise exception 'Quotation not found'; end if;
  if q.status not in ('sent', 'viewed') then raise exception 'This quotation can no longer be answered'; end if;
  if q.valid_until is not null and q.valid_until < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'This quotation has expired. Please ask us for a refreshed quotation';
  end if;
  v_status := case when p_accept then 'accepted'::public.quotation_status else 'rejected'::public.quotation_status end;
  update public.quotation_items
    set client_decision = case when p_accept then 'accepted' else 'rejected' end, client_decided_at = now()
    where quotation_id = p_quotation_id;
  update public.quotations
    set status = v_status, client_comment = p_comment, responded_at = now(), responded_by = auth.uid()
    where id = p_quotation_id;
  insert into public.quotation_history (quotation_id, from_status, to_status, changed_by, note)
  values (p_quotation_id, q.status, v_status, auth.uid(), p_comment);
  if q.campaign_id is not null then
    update public.campaigns set status = case when p_accept then 'approved'::public.campaign_status else 'rejected'::public.campaign_status end
    where id = q.campaign_id;
    perform public.record_campaign_event(q.campaign_id, case when p_accept then 'quotation_accepted' else 'quotation_rejected' end, jsonb_build_object('quotation_id', p_quotation_id));
  end if;
  perform public.notify_users('internal', q.company_id, case when p_accept then 'Quotation accepted' else 'Quotation rejected' end, coalesce(p_comment, ''), '/crm/quotations/' || p_quotation_id);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Order creation: only accepted lines, and the order value / cost come from those lines only.
-- Same guards, idempotency and side effects as 20260909_convert_order_active_catalogue_only.sql, EXCEPT that the old
-- "unknown supplier cost = 62% of price" assumption is removed (approved decision D1, option B): an order with any
-- accepted line lacking a verified supplier cost is created with costs 0 ("costs not entered"), never an invented margin.
-- ---------------------------------------------------------------------------
create or replace function public.convert_quotation_to_order(p_quotation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  q public.quotations%rowtype;
  v_order_id uuid;
  v_ops uuid;
  v_cost numeric := 0;
  v_item_count integer := 0;
  v_unknown_cost_lines integer := 0;
  v_value numeric := 0;
begin
  if not public.has_any_role(array['admin','sales','operations']::public.app_role[]) then
    raise exception 'Not permitted to convert quotations';
  end if;
  select * into q from public.quotations where id = p_quotation_id;
  if not found then raise exception 'Quotation not found'; end if;
  if q.status <> 'accepted' then raise exception 'Only accepted quotations can become orders'; end if;
  if exists (select 1 from public.orders where quotation_id = q.id) then
    select id into v_order_id from public.orders where quotation_id = q.id;
    return v_order_id;
  end if;

  select count(*) into v_item_count
  from public.quotation_accepted_items(q.id) qi
  join public.products p on p.id = qi.product_id
  where p.status = 'active' and coalesce(p.catalogue_access, 'all') <> 'none';
  if v_item_count = 0 then
    raise exception 'Quotation has no accepted active catalogue products to convert';
  end if;

  select id into v_ops from public.departments where slug = 'operations';
  -- Cost is only ever calculated from verified supplier costs (products.supplier_cost > 0). If ANY accepted line has
  -- none, the order cost is left at the existing "costs not entered" value (0) instead of inventing a margin; staff
  -- enter the real costs on the order's Financials tab, and the page shows "costs not entered" until they do.
  select count(*) filter (where p.supplier_cost is null or p.supplier_cost <= 0),
         coalesce(sum(p.supplier_cost * qi.quantity) filter (where p.supplier_cost > 0), 0)
    into v_unknown_cost_lines, v_cost
  from public.quotation_accepted_items(q.id) qi
  join public.products p on p.id = qi.product_id
  where p.status = 'active' and coalesce(p.catalogue_access, 'all') <> 'none';
  if v_unknown_cost_lines > 0 then v_cost := 0; end if;
  -- gross_profit is stored as 0 here whatever v_cost is: the conversion fills only the product cost, so printing,
  -- courier and other cost are not entered yet and no profit is verified. recalc_order_cost (migration 39) stores
  -- profit once staff have entered every cost component.

  v_value := public.quotation_accepted_total(q.id);

  insert into public.orders (
    order_number, company_id, contact_id, quotation_id, requirement_id, owner_id,
    order_value, expected_delivery_date, status, current_department_id, next_action,
    product_cost, total_cost, gross_profit, campaign_id
  ) values (
    public.next_order_number(), q.company_id, q.contact_id, q.id, q.requirement_id, q.owner_id,
    v_value, current_date + 21, 'created', v_ops, 'Confirm PO and assign operations',
    v_cost, v_cost, 0, q.campaign_id
  ) returning id into v_order_id;

  insert into public.order_items (order_id, product_id, description, quantity, unit_price, line_total)
  select v_order_id, qi.product_id, coalesce(qi.description, p.name), qi.quantity, qi.unit_price, round(qi.quantity * qi.unit_price, 2)
  from public.quotation_accepted_items(q.id) qi
  join public.products p on p.id = qi.product_id
  where p.status = 'active' and coalesce(p.catalogue_access, 'all') <> 'none';

  insert into public.order_assignments (order_id, department_id, assigned_by, note)
  values (v_order_id, v_ops, auth.uid(), 'Order received from accepted quotation');
  insert into public.tasks (title, order_id, department_id, created_by, due_at, description)
  values ('Confirm order and assign operations', v_order_id, v_ops, auth.uid(), current_date + 1, 'New order from quotation');

  if q.requirement_id is not null then
    update public.requirements set status = 'won' where id = q.requirement_id;
  end if;
  if q.campaign_id is not null then
    update public.campaigns set status = 'order_ready' where id = q.campaign_id;
    perform public.record_campaign_event(q.campaign_id, 'order_created', jsonb_build_object('order_id', v_order_id));
  end if;
  perform public.notify_users('internal', q.company_id, 'New order from accepted quotation', '', '/crm/orders/' || v_order_id::text);
  perform public.notify_users('client', q.company_id, 'Your order is confirmed', 'We have started fulfilment.', '/portal/orders');
  return v_order_id;
end;
$fn$;

-- Verification:
-- select column_name from information_schema.columns where table_name = 'quotation_items' and column_name = 'client_decision';
-- select proname from pg_proc where proname in ('client_respond_quotation_items', 'quotation_accepted_items', 'quotation_accepted_total');
