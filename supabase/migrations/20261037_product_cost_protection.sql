-- Product cost protection (SOW 3.4 / 6: costs, margins and internal notes never reach customers or unauthorised roles).
--
-- Two real exposures, both visible through the data API regardless of what the pages hide:
--
--  1. public.products carries supplier_cost, internal_margin and internal_notes, and the policy
--     products_public_catalogue_select lets ANON and every signed-in user (including client users) read every
--     column of every active public-catalogue product, so those three columns could be read with the public
--     anon key. Internal roles (sales, operations ...) could also read them for any product.
--  2. public.product_suppliers.supplier_cost is readable by every internal role (policy: is_internal()), not just
--     those holding the suppliers.cost_view permission.
--
-- Fix (same technique as 20261035 for orders): withdraw table-wide SELECT from the API roles and grant SELECT on
-- every column EXCEPT the cost columns. Authorised staff read the withheld columns through SECURITY DEFINER
-- functions that check the caller. The application (src/lib/products/costs.ts) already uses them and falls back
-- to direct reads only until this migration is applied.
--
-- Defaults (secure; the business decision on who may see costs is still open and is NOT guessed here):
--   products.supplier_cost / internal_margin / internal_notes: admin, accounts, management (what the app already allowed)
--   product_suppliers.supplier_cost:                           anyone holding suppliers.cost_view
-- To change who may see them later, edit ONE line in the matching function below.
--
-- Additive and idempotent. Apply after 20261036_rate_limits.sql, manually in the SQL Editor.
-- IMPORTANT: afterwards `select *` on public.products or public.product_suppliers fails for API users (permission
-- denied). The app now lists columns explicitly. If a column is added to either table later, re-run the DO block at
-- the bottom so the new column is readable.
-- Left as they were: sample_stock.unit_cost and sample_movements.cost (sample purchase cost; internal roles only,
-- who may see it is a business decision), and every other column of these tables.

-- ---------------------------------------------------------------------------
-- 1. Permission-checked readers
-- ---------------------------------------------------------------------------
create or replace function public.product_cost_summary(p_product_ids uuid[])
returns table (product_id uuid, supplier_cost numeric, internal_margin numeric, internal_notes text)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  -- Edit this role list to change who may see product cost, margin and internal notes.
  if not public.has_any_role(array['admin', 'accounts', 'management']::public.app_role[]) then
    raise exception 'Not permitted to view product costs';
  end if;
  return query
    select p.id, p.supplier_cost, p.internal_margin, p.internal_notes
    from public.products p
    where p.id = any (p_product_ids);
end;
$fn$;

create or replace function public.product_supplier_costs(p_mapping_ids uuid[])
returns table (id uuid, supplier_cost numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.has_permission('suppliers.cost_view') then
    raise exception 'Not permitted to view supplier costs';
  end if;
  return query
    select ps.id, ps.supplier_cost
    from public.product_suppliers ps
    where ps.id = any (p_mapping_ids);
end;
$fn$;

revoke all on function public.product_cost_summary(uuid[]) from public, anon;
revoke all on function public.product_supplier_costs(uuid[]) from public, anon;
grant execute on function public.product_cost_summary(uuid[]) to authenticated;
grant execute on function public.product_supplier_costs(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Column-level SELECT: everything except the cost columns
-- ---------------------------------------------------------------------------
do $do$
declare
  v_cols text;
begin
  -- products: anon needs the public catalogue columns (when no service role is configured), signed-in users the same.
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products'
    and column_name not in ('supplier_cost', 'internal_margin', 'internal_notes');
  if v_cols is not null then
    execute 'revoke select on public.products from anon, authenticated';
    execute format('grant select (%s) on public.products to anon, authenticated', v_cols);
  end if;

  -- product_suppliers: signed-in users only (anon never had access)
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'product_suppliers'
    and column_name not in ('supplier_cost');
  if v_cols is not null then
    execute 'revoke select on public.product_suppliers from anon, authenticated';
    execute format('grant select (%s) on public.product_suppliers to authenticated', v_cols);
  end if;
end
$do$;

-- INSERT / UPDATE / DELETE privileges are untouched, so saving a product's cost or a supplier mapping's cost
-- (UPDATE) and the SECURITY DEFINER functions that read them (convert_quotation_to_order, advance_order_stage ...)
-- work as before. The service role keeps full access.

-- ---------------------------------------------------------------------------
-- Verification (as the SQL Editor owner, then through the data API as each role):
-- select column_name from information_schema.column_privileges
--  where table_schema = 'public' and table_name = 'products' and grantee in ('anon', 'authenticated')
--    and column_name in ('supplier_cost', 'internal_margin', 'internal_notes');          -- expect NO rows
-- select count(*) from information_schema.column_privileges
--  where table_schema = 'public' and table_name = 'products' and grantee = 'anon' and column_name = 'price';  -- expect 1
-- select column_name from information_schema.column_privileges
--  where table_schema = 'public' and table_name = 'product_suppliers' and grantee = 'authenticated'
--    and column_name = 'supplier_cost';                                                  -- expect NO rows
-- With the anon key (no login):
--   GET /rest/v1/products?select=supplier_cost,internal_margin  -> 401/403 permission denied
--   GET /rest/v1/products?select=*                              -> permission denied
--   GET /rest/v1/products?select=id,name,price                  -> still works for active public-catalogue products
-- As a client, sales and operations user: the same three calls behave the same; product_suppliers?select=supplier_cost is denied.
-- As admin / accounts / management: the product page shows cost and margin; as sales / operations it does not.
-- As a user holding suppliers.cost_view: supplier mapping costs show on the product and supplier pages.
