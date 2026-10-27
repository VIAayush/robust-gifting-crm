-- Order cost protection (SOW 3.4 / 6: costs and margins never reach customers or unauthorised roles).
--
-- Problem: row-level security cannot hide individual columns, so any signed-in user who could read an
-- order row (a client for their own company, a sales user for their own orders) could also read
-- orders.product_cost / printing_cost / courier_cost / other_cost / total_cost / gross_profit and
-- order_items.supplier_cost_snapshot by calling the data API directly, even though the pages hide them.
--
-- Fix: withdraw table-wide SELECT from the API roles and grant SELECT on every column EXCEPT the cost
-- columns. Authorised staff read costs through the two SECURITY DEFINER functions below, which check the
-- caller's role / permission. The application (src/lib/orders/costs.ts) already uses these functions and
-- falls back to direct reads only while this migration is not applied.
--
-- Defaults (secure; the business decision on who may see costs is still open and is NOT guessed here):
--   order costs and margin:      admin, accounts, management   (the same roles the app already allowed)
--   supplier cost on order line: anyone holding the suppliers.cost_view permission
-- Changing who may see them later means editing ONE line in the matching function, not the table grants.
--
-- Additive and idempotent. Apply after 20261034_order_history_handoff_and_sample_team.sql, manually.
-- IMPORTANT: after this runs, `select *` on public.orders or public.order_items fails for API users
-- (permission denied). The app has been changed to list columns explicitly. If a column is added to either
-- table later, re-run the DO block at the bottom so the new column is readable.

-- ---------------------------------------------------------------------------
-- 1. Permission-checked readers
-- ---------------------------------------------------------------------------
create or replace function public.order_cost_summary(p_order_ids uuid[])
returns table (
  order_id uuid,
  product_cost numeric,
  printing_cost numeric,
  courier_cost numeric,
  other_cost numeric,
  total_cost numeric,
  gross_profit numeric
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  -- Edit this role list to change who may see order costs and margin.
  if not public.has_any_role(array['admin', 'accounts', 'management']::public.app_role[]) then
    raise exception 'Not permitted to view order costs';
  end if;
  return query
    select o.id, o.product_cost, o.printing_cost, o.courier_cost, o.other_cost, o.total_cost, o.gross_profit
    from public.orders o
    where o.id = any (p_order_ids);
end;
$fn$;

create or replace function public.order_item_supplier_costs(p_order_id uuid)
returns table (item_id uuid, supplier_cost_snapshot numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.has_permission('suppliers.cost_view') then
    raise exception 'Not permitted to view supplier costs';
  end if;
  -- (This function runs with the owner's rights, so row-level security does not apply inside it: the
  -- permission check above is the gate. The page calling it has already loaded the order under the caller's scope.)
  return query
    select oi.id, oi.supplier_cost_snapshot
    from public.order_items oi
    where oi.order_id = p_order_id;
end;
$fn$;

revoke all on function public.order_cost_summary(uuid[]) from public, anon;
revoke all on function public.order_item_supplier_costs(uuid) from public, anon;
grant execute on function public.order_cost_summary(uuid[]) to authenticated;
grant execute on function public.order_item_supplier_costs(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Column-level SELECT: everything except the cost columns
-- ---------------------------------------------------------------------------
do $do$
declare
  v_cols text;
begin
  -- orders
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orders'
    and column_name not in ('product_cost', 'printing_cost', 'courier_cost', 'other_cost', 'total_cost', 'gross_profit');
  if v_cols is not null then
    execute 'revoke select on public.orders from anon, authenticated';
    execute format('grant select (%s) on public.orders to authenticated', v_cols);
  end if;

  -- order_items
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'order_items'
    and column_name not in ('supplier_cost_snapshot');
  if v_cols is not null then
    execute 'revoke select on public.order_items from anon, authenticated';
    execute format('grant select (%s) on public.order_items to authenticated', v_cols);
  end if;
end
$do$;

-- INSERT / UPDATE / DELETE privileges are untouched, so saving costs (UPDATE) and the SECURITY DEFINER
-- functions that write them (recalc_order_cost, convert_quotation_to_order, advance_order_stage) work as before.
-- The service role keeps full access.

-- ---------------------------------------------------------------------------
-- Verification (run as the SQL Editor owner, then test through the app as each role):
-- select column_name, grantee, privilege_type from information_schema.column_privileges
--  where table_schema = 'public' and table_name = 'orders' and grantee = 'authenticated'
--    and column_name in ('order_value', 'product_cost', 'gross_profit');
--   -- expect order_value present; product_cost and gross_profit ABSENT
-- select column_name from information_schema.column_privileges
--  where table_schema = 'public' and table_name = 'order_items' and grantee = 'authenticated'
--    and column_name = 'supplier_cost_snapshot';                      -- expect no row
-- Through the data API as a client user, a sales user and an operations user:
--   GET /rest/v1/orders?select=product_cost        -> 403 permission denied
--   GET /rest/v1/orders?select=*                   -> 403 permission denied
--   GET /rest/v1/orders?select=id,order_value      -> works (RLS still limits the rows)
-- As admin / accounts / management: order detail Financials tab shows costs; as sales/operations it does not.
