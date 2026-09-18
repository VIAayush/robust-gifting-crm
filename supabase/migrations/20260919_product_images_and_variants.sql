-- Product multi-image + colour variant support.
-- Purely additive: no existing column, table or row is changed or removed.
-- Safe to run against the live project as-is.

-- ---------------------------------------------------------------------------
-- product_variants: metadata needed to manage variants after creation.
-- ---------------------------------------------------------------------------
alter table public.product_variants add column if not exists display_name text;
alter table public.product_variants add column if not exists status text not null default 'active';
alter table public.product_variants add column if not exists sort_order integer not null default 0;

-- ---------------------------------------------------------------------------
-- product_images: multiple photos per product, optionally scoped to one colour
-- variant. variant_id = null means "shown regardless of colour" (also used by
-- products that have no variants at all).
-- ---------------------------------------------------------------------------
create table if not exists public.product_images (
  id uuid default gen_random_uuid() not null primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  image_url text not null,
  storage_path text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  alt_text text,
  created_at timestamp with time zone default now() not null
);

create index if not exists product_images_product_id_idx on public.product_images (product_id);
create index if not exists product_images_variant_id_idx on public.product_images (variant_id);

alter table public.product_images enable row level security;

drop policy if exists product_images_select_internal on public.product_images;
drop policy if exists product_images_public_select on public.product_images;
drop policy if exists product_images_write on public.product_images;

-- Mirrors variants_select on product_variants.
create policy product_images_select_internal on public.product_images
  as permissive for select to authenticated using (is_internal());

-- Mirrors products_public_catalogue_select on products.
create policy product_images_public_select on public.product_images
  as permissive for select to anon, authenticated using (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id
        and p.status = 'active'::product_status
        and p.catalogue_access = 'all'::text
    )
  );

-- Mirrors variants_write on product_variants.
create policy product_images_write on public.product_images
  as permissive for all to authenticated using (can_sales()) with check (can_sales());

-- ---------------------------------------------------------------------------
-- Portal (logged-in client) visibility. client_products already resolves the
-- caller's own catalogue access (including "selected companies") by running
-- as a definer view rather than through direct RLS on `products`; these two
-- views extend that exact same pattern to variants and images so the client
-- portal can show colour/gallery data for the products it can already see.
-- ---------------------------------------------------------------------------
create or replace view public.client_product_variants as
select v.id, v.product_id, v.colour, v.display_name, v.sort_order, v.extra_price, v.sku
from public.product_variants v
join public.products p on p.id = v.product_id
where v.status = 'active'
  and p.status = 'active'::product_status
  and p.catalogue_access <> 'none'::text
  and (
    p.catalogue_access = 'all'::text
    or exists (
      select 1 from public.company_product_access cpa
      where cpa.product_id = p.id and cpa.company_id = client_company_id()
    )
  );

create or replace view public.client_product_images as
select i.id, i.product_id, i.variant_id, i.image_url, i.sort_order, i.is_primary
from public.product_images i
join public.products p on p.id = i.product_id
where p.status = 'active'::product_status
  and p.catalogue_access <> 'none'::text
  and (
    p.catalogue_access = 'all'::text
    or exists (
      select 1 from public.company_product_access cpa
      where cpa.product_id = p.id and cpa.company_id = client_company_id()
    )
  );

grant select on public.client_product_variants to anon, authenticated;
grant select on public.client_product_images to anon, authenticated;
