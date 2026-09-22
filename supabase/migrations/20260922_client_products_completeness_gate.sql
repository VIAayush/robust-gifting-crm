-- Close a gap found in production: an incomplete product (missing price,
-- photo, category or name) reached the logged-in client portal because
-- client_products only checked status/catalogue_access, not completeness.
-- This mirrors the same gate added to the public storefront queries in
-- src/lib/catalogue/products.ts (isCatalogueReady()) so both surfaces agree
-- on what counts as sellable, regardless of how a bad row got into products.

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

comment on view public.client_products is
  'Client-safe catalogue. Filters by the caller''s company via client_company_id(); exposes no internal cost, supplier or visibility columns. Also requires price>0, image_url, name and category to be present — an incomplete row is never shown to a client.';

revoke all on public.client_products from anon;
grant select on public.client_products to authenticated;
