-- Personalised client catalogue.
--
-- Model (reusing what already exists, no parallel system):
--   * public.products                -- single product master, one row per product, SKU unique
--   * products.catalogue_access      -- 'all' | 'selected' | 'none'  (client discovery)
--   * public.company_product_access  -- which companies see a 'selected' product
--   * public.campaign_products       -- unchanged: campaign-specific curated offerings
--
-- Products are never cloned per client. Visibility governs FUTURE discovery only;
-- quotations and orders keep their own product references so history is unaffected.

-- 1. Constrain catalogue_access to the three supported states.
alter table public.products
  drop constraint if exists products_catalogue_access_check;

alter table public.products
  add constraint products_catalogue_access_check
  check (catalogue_access in ('all', 'selected', 'none'));

-- 2. Keep SKUs case-consistent so uniqueness cannot be dodged by casing.
--    (products_sku_unique already exists; this only normalises stored values.)
update public.products
set sku = upper(btrim(sku))
where sku is distinct from upper(btrim(sku));

-- 3. Speed up catalogue browsing on a large product pool.
create index if not exists products_catalogue_browse_idx
  on public.products (status, catalogue_access);

create index if not exists products_name_lower_idx
  on public.products (lower(name));

-- 4. Client-facing catalogue view.
--
--    This view is the security boundary for client product discovery. It runs with
--    definer rights (so it is not blocked by the internal-only RLS policy on
--    products) and applies its own filter based on the caller's company, resolved
--    server-side from auth.uid() via client_company_id().
--
--    Only client-safe columns are exposed. supplier_id, supplier_cost,
--    internal_margin, internal_notes, catalogue_access, visibility and status are
--    deliberately omitted so they cannot leak through column selection.
--    Category/brand names are resolved inside the view because those tables are
--    internal-only under RLS; this avoids opening them up to client accounts.
drop view if exists public.client_products;

create view public.client_products as
select
  p.id,
  p.name,
  p.sku,
  p.description,
  p.image_url,
  p.price,
  p.moq,
  p.category_id,
  cat.name as category_name,
  p.subcategory_id,
  sub.name as subcategory_name,
  p.brand_id,
  b.name as brand_name
from public.products p
left join public.categories cat on cat.id = p.category_id
left join public.subcategories sub on sub.id = p.subcategory_id
left join public.brands b on b.id = p.brand_id
where p.status = 'active'
  and p.catalogue_access <> 'none'
  and (
    p.catalogue_access = 'all'
    or exists (
      select 1
      from public.company_product_access cpa
      where cpa.product_id = p.id
        and cpa.company_id = public.client_company_id()
    )
  );

comment on view public.client_products is
  'Client-safe catalogue. Filters by the caller''s company via client_company_id(); exposes no internal cost, supplier or visibility columns.';

revoke all on public.client_products from anon;
grant select on public.client_products to authenticated;

-- 5. Audit catalogue visibility changes (reuses the existing write_audit trigger,
--    which records previous_value/new_value, user and timestamp into audit_logs).
drop trigger if exists audit_products on public.products;
create trigger audit_products
  after insert or update or delete on public.products
  for each row execute function public.write_audit();

--    company_product_access has a composite primary key and no `id` column, so it
--    needs its own trigger function rather than the generic write_audit().
create or replace function public.write_catalogue_access_audit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.company_product_access;
  v_sku text;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  select sku into v_sku from public.products where id = v_row.product_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, previous_value, new_value)
  values (
    auth.uid(),
    case when tg_op = 'INSERT' then 'catalogue_client_added' else 'catalogue_client_removed' end,
    'company_product_access',
    v_row.product_id,
    case when tg_op = 'DELETE'
      then jsonb_build_object('company_id', old.company_id, 'product_id', old.product_id, 'sku', v_sku)
    end,
    case when tg_op = 'INSERT'
      then jsonb_build_object('company_id', new.company_id, 'product_id', new.product_id, 'sku', v_sku)
    end
  );
  return v_row;
end;
$$;

drop trigger if exists audit_company_product_access on public.company_product_access;
create trigger audit_company_product_access
  after insert or delete on public.company_product_access
  for each row execute function public.write_catalogue_access_audit();
