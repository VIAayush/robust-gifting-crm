-- Product sales channel: show a product in the B2C store, the B2B catalogue, or both.
-- Additive and idempotent; the safe default 'both' leaves every existing product visible exactly as today.
-- Apply after 20261030_staff_notification_email.sql, manually in the SQL Editor.
-- The application tolerates this migration being absent (everything counts as 'both').

alter table public.products
  add column if not exists sales_channel text not null default 'both';

do $fn$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_sales_channel_check') then
    alter table public.products add constraint products_sales_channel_check
      check (sales_channel in ('b2b', 'b2c', 'both'));
  end if;
end
$fn$;

create index if not exists products_sales_channel_idx on public.products (sales_channel) where sales_channel <> 'both';

-- Client portal catalogue: B2C-only products are hidden. Same columns as the latest definition
-- (20260926_mrp_orders_notifications.sql, including customization_enabled); only the WHERE changes, so
-- CREATE OR REPLACE keeps existing grants and dependent objects.
create or replace view public.client_products as
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
  b.name as brand_name,
  p.customization_enabled
from public.products p
left join public.categories cat on cat.id = p.category_id
left join public.subcategories sub on sub.id = p.subcategory_id
left join public.brands b on b.id = p.brand_id
where p.status = 'active'
  and p.catalogue_access <> 'none'
  and p.sales_channel in ('b2b', 'both')
  and p.price is not null
  and p.price > 0
  and p.image_url is not null
  and btrim(p.image_url) <> ''
  and p.name is not null
  and btrim(p.name) <> ''
  and cat.name is not null
  and (
    p.catalogue_access = 'all'
    or exists (
      select 1
      from public.company_product_access cpa
      where cpa.product_id = p.id
        and cpa.company_id = public.client_company_id()
    )
  );

-- Verification:
-- select sales_channel, count(*) from public.products group by 1;   -- expect 'both' for every existing row
-- select count(*) from public.client_products;                       -- unchanged until a product is set to b2c
