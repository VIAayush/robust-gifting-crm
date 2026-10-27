-- Festival / occasion banners managed from the CRM and shown on the public home pages and the client portal.
-- Additive and idempotent. Apply after 20261031_product_sales_channel.sql, manually in the SQL Editor.
-- No banners are seeded. The application tolerates this table being absent (no banners are shown).

create table if not exists public.site_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  subtitle text check (subtitle is null or char_length(subtitle) <= 240),
  cta_label text check (cta_label is null or char_length(cta_label) <= 40),
  link_url text check (link_url is null or (char_length(link_url) <= 500 and link_url ~ '^(/|https://)')),
  image_url text check (image_url is null or (char_length(image_url) <= 500 and image_url ~ '^https://')),
  occasion text check (occasion is null or char_length(occasion) <= 60),
  audience text not null default 'both' check (audience in ('public', 'portal', 'both')),
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_banners_dates_ordered check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

create index if not exists site_banners_active_idx on public.site_banners (is_active, sort_order);

drop trigger if exists site_banners_updated_at on public.site_banners;
create trigger site_banners_updated_at before update on public.site_banners
  for each row execute function public.set_updated_at();

alter table public.site_banners enable row level security;

-- Banner copy is public marketing content: anyone may read banners that are active and inside their window.
drop policy if exists site_banners_select_live on public.site_banners;
create policy site_banners_select_live on public.site_banners for select to anon, authenticated
  using (
    is_active
    and (starts_on is null or starts_on <= (now() at time zone 'Asia/Kolkata')::date)
    and (ends_on is null or ends_on >= (now() at time zone 'Asia/Kolkata')::date)
  );

-- Internal staff can see every banner (drafts, scheduled, expired) to manage them.
drop policy if exists site_banners_select_internal on public.site_banners;
create policy site_banners_select_internal on public.site_banners for select to authenticated
  using (is_internal());

-- Writes need the Catalogues module permission (the banners screen lives under it).
drop policy if exists site_banners_write on public.site_banners;
create policy site_banners_write on public.site_banners for all to authenticated
  using (is_internal() and has_permission('module.catalogues'))
  with check (is_internal() and has_permission('module.catalogues'));

-- Verification:
-- select tablename, rowsecurity from pg_tables where tablename = 'site_banners';          -- rowsecurity = true
-- select policyname from pg_policies where tablename = 'site_banners';                    -- 3 policies
