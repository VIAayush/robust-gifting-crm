-- Final client pass: MRP pricing, B2B/B2C order typing + payment tracking,
-- configurable delivery charge, and a notification outbox for WhatsApp.
-- Additive only - no existing column, row, or policy is dropped or rewritten.

-- ---------------------------------------------------------------------------
-- 1. MRP. products.price stays the SELLING price (unchanged meaning).
--    mrp is new and intentionally NOT backfilled - existing prices are never
--    reinterpreted. A null mrp simply means "no strike-through shown".
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists mrp numeric(12,2),
  add column if not exists price_updated_at timestamptz;

do $$ begin
  alter table public.products add constraint products_mrp_check check (mrp is null or mrp >= 0);
exception when duplicate_object then null; end $$;

create table if not exists public.product_price_history (
  id uuid default gen_random_uuid() primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  old_price numeric(12,2),
  new_price numeric(12,2),
  old_mrp numeric(12,2),
  new_mrp numeric(12,2),
  source text not null default 'manual',
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz default now() not null
);
create index if not exists product_price_history_product_idx on public.product_price_history(product_id, changed_at desc);

alter table public.product_price_history enable row level security;
drop policy if exists product_price_history_select on public.product_price_history;
create policy product_price_history_select on public.product_price_history for select to authenticated using (is_internal());
drop policy if exists product_price_history_insert on public.product_price_history;
create policy product_price_history_insert on public.product_price_history for insert to authenticated with check (is_internal());

-- ---------------------------------------------------------------------------
-- 2. Orders: B2B vs B2C, payment status/reference, shipping, MRP snapshot.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists order_type text default 'b2b' not null,
  add column if not exists payment_status text default 'not_applicable' not null,
  add column if not exists payment_reference text,
  add column if not exists storefront_checkout_id uuid references public.storefront_checkouts(id) on delete set null,
  add column if not exists shipping_address jsonb;

do $$ begin
  alter table public.orders add constraint orders_order_type_check check (order_type in ('b2b','b2c'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.orders add constraint orders_payment_status_check check (payment_status in ('not_applicable','pending','paid','failed','refunded'));
exception when duplicate_object then null; end $$;

create unique index if not exists orders_storefront_checkout_id_key on public.orders(storefront_checkout_id) where storefront_checkout_id is not null;

-- Backfill: orders already created from a paid storefront checkout are B2C + paid.
update public.orders o
set order_type = 'b2c',
    payment_status = 'paid',
    storefront_checkout_id = sc.id
from public.storefront_checkouts sc
where sc.order_id = o.id and o.storefront_checkout_id is null;

alter table public.order_items add column if not exists mrp_snapshot numeric(12,2);
alter table public.storefront_checkout_items add column if not exists mrp_snapshot numeric(12,2);

-- ---------------------------------------------------------------------------
-- 3. Configurable B2C delivery charge.
-- ---------------------------------------------------------------------------
alter table public.org_settings
  add column if not exists delivery_charge numeric(10,2) default 0 not null,
  add column if not exists free_delivery_above numeric(12,2);

-- ---------------------------------------------------------------------------
-- 4. Staff phone (for internal WhatsApp alerts) + B2B customization on samples.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists phone text;
alter table public.sample_requests add column if not exists customization_notes text;

-- client_products: append customization_enabled (customer-safe - it only says
-- whether a product CAN be personalised) so the B2B portal can offer a
-- customization field on sample requests. Same columns/filter as the
-- 20260922 completeness-gate definition, with the one new column appended
-- last, which is what CREATE OR REPLACE VIEW allows without a drop.
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

revoke all on public.client_products from anon;
grant select on public.client_products to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Notification outbox. Business events enqueue rows here; a dispatcher
--    sends them through the configured provider. A row is only ever marked
--    'sent' when the provider actually accepted it - with no provider
--    configured it is marked 'skipped', never falsely 'sent'.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_outbox (
  id uuid default gen_random_uuid() primary key,
  event_type text not null,
  channel text not null default 'whatsapp',
  recipient_type text not null,
  recipient_phone text,
  recipient_name text,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  rendered_message text,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  provider text,
  provider_message_id text,
  entity text,
  entity_id uuid,
  dedupe_key text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  sent_at timestamptz
);

do $$ begin
  alter table public.notification_outbox add constraint notification_outbox_status_check check (status in ('pending','sent','failed','skipped'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.notification_outbox add constraint notification_outbox_recipient_type_check check (recipient_type in ('customer','staff'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.notification_outbox add constraint notification_outbox_dedupe_key_key unique (dedupe_key);
exception when duplicate_object then null; end $$;

create index if not exists notification_outbox_status_idx on public.notification_outbox(status, created_at);
create index if not exists notification_outbox_entity_idx on public.notification_outbox(entity, entity_id);

drop trigger if exists notification_outbox_set_updated_at on public.notification_outbox;
create trigger notification_outbox_set_updated_at
  before update on public.notification_outbox
  for each row execute function public.set_updated_at();

-- Reads are internal-only; all writes go through the service-role dispatcher.
alter table public.notification_outbox enable row level security;
drop policy if exists notification_outbox_select on public.notification_outbox;
create policy notification_outbox_select on public.notification_outbox for select to authenticated
  using (is_internal() and has_permission('notifications.view'));

-- ---------------------------------------------------------------------------
-- 6. New permission keys.
-- ---------------------------------------------------------------------------
insert into public.permissions (key, module, description) values
  ('notifications.view', 'notifications', 'View the notification log'),
  ('notifications.manage', 'notifications', 'Retry failed notifications'),
  ('pricing.manage', 'products', 'Edit MRP/selling price and run bulk price updates')
on conflict (key) do nothing;

insert into public.role_permissions (role, permission_key)
select r::public.app_role, p from (values
  ('admin','notifications.view'), ('admin','notifications.manage'), ('admin','pricing.manage'),
  ('operations','notifications.view'), ('operations','notifications.manage'),
  ('management','notifications.view'),
  ('sales','pricing.manage')
) as t(r, p)
on conflict (role, permission_key) do nothing;
