-- Fix: the product_suppliers unique(product_id, variant_id, supplier_id) constraint
-- from the previous migration does NOT actually stop duplicate whole-product
-- mappings (variant_id IS NULL), because standard SQL treats NULL as distinct
-- from NULL in a unique constraint. Found via a live data-layer test that
-- tried to insert a second identical whole-product mapping and it succeeded
-- instead of raising a conflict. Replaced with two partial unique indexes
-- that correctly cover both the whole-product (NULL variant) and
-- variant-scoped cases.
alter table public.product_suppliers drop constraint if exists product_suppliers_unique;

create unique index if not exists product_suppliers_unique_no_variant
  on public.product_suppliers (product_id, supplier_id)
  where variant_id is null;

create unique index if not exists product_suppliers_unique_with_variant
  on public.product_suppliers (product_id, variant_id, supplier_id)
  where variant_id is not null;
