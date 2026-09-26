-- Phase 2: multi-supplier architecture + granular internal permissions.
-- Additive only - no existing column/table is dropped or renamed.
-- Run this once in the Supabase SQL editor (project zrfetfibatcuvwogyvjn) before
-- the new /crm/suppliers, product-supplier mapping, or order procurement UI
-- will function - they read/write these tables directly.

-- ---------------------------------------------------------------------------
-- 1. Extend the existing suppliers master with the fields Phase 2 needs.
--    is_active is kept in sync with the new `status` column via trigger so
--    every existing query that still reads is_active keeps working.
-- ---------------------------------------------------------------------------
alter table public.suppliers
  add column if not exists supplier_code text,
  add column if not exists legal_name text,
  add column if not exists address text,
  add column if not exists state text,
  add column if not exists country text default 'India',
  add column if not exists gst_number text,
  add column if not exists payment_terms text,
  add column if not exists lead_time_days integer,
  add column if not exists moq integer,
  add column if not exists status text default 'active' not null;

do $$ begin
  alter table public.suppliers add constraint suppliers_status_check check (status in ('active','inactive','blocked'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.suppliers add constraint suppliers_supplier_code_key unique (supplier_code);
exception when duplicate_object then null; end $$;

update public.suppliers set status = case when is_active then 'active' else 'inactive' end;

create or replace function public.sync_supplier_is_active()
returns trigger
language plpgsql
as $$
begin
  new.is_active := (new.status = 'active');
  return new;
end;
$$;

drop trigger if exists suppliers_sync_is_active on public.suppliers;
create trigger suppliers_sync_is_active
  before insert or update of status on public.suppliers
  for each row execute function public.sync_supplier_is_active();

-- ---------------------------------------------------------------------------
-- 2. product_suppliers: the actual many-to-many. A product may have several
--    suppliers; a mapping may optionally be scoped to one variant instead of
--    the whole product.
-- ---------------------------------------------------------------------------
create table if not exists public.product_suppliers (
  id uuid default gen_random_uuid() primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_sku text,
  supplier_product_name text,
  supplier_cost numeric(12,2),
  moq integer,
  lead_time_days integer,
  is_preferred boolean default false not null,
  status text default 'active' not null,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

do $$ begin
  alter table public.product_suppliers add constraint product_suppliers_cost_check check (supplier_cost is null or supplier_cost >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.product_suppliers add constraint product_suppliers_status_check check (status in ('active','inactive'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.product_suppliers add constraint product_suppliers_unique unique (product_id, variant_id, supplier_id);
exception when duplicate_object then null; end $$;

create index if not exists product_suppliers_product_id_idx on public.product_suppliers(product_id);
create index if not exists product_suppliers_supplier_id_idx on public.product_suppliers(supplier_id);
create index if not exists product_suppliers_variant_id_idx on public.product_suppliers(variant_id);

drop trigger if exists product_suppliers_set_updated_at on public.product_suppliers;
create trigger product_suppliers_set_updated_at
  before update on public.product_suppliers
  for each row execute function public.set_updated_at();

-- Migrate the EXISTING single products.supplier_id link into the new table
-- as each product's initial preferred supplier. No cost/name is invented -
-- only real, already-present data is copied.
insert into public.product_suppliers (product_id, supplier_id, supplier_cost, is_preferred, status)
select p.id, p.supplier_id, p.supplier_cost, true, 'active'
from public.products p
where p.supplier_id is not null
on conflict (product_id, variant_id, supplier_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. supplier_cost_history: append-only log, so a cost change never rewrites
--    away what a past order actually paid.
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_cost_history (
  id uuid default gen_random_uuid() primary key,
  product_supplier_id uuid not null references public.product_suppliers(id) on delete cascade,
  old_cost numeric(12,2),
  new_cost numeric(12,2),
  changed_by uuid references public.profiles(id),
  changed_at timestamptz default now() not null
);
create index if not exists supplier_cost_history_product_supplier_id_idx on public.supplier_cost_history(product_supplier_id);

-- ---------------------------------------------------------------------------
-- 4. order_items: per-line supplier allocation + a cost/SKU/lead-time SNAPSHOT
--    taken at assignment time, so a later supplier cost change never rewrites
--    what a historical order actually cost.
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.procurement_status as enum (
    'not_assigned','supplier_selected','po_pending','po_raised','confirmed',
    'in_production','ready','dispatched','received','cancelled'
  );
exception when duplicate_object then null; end $$;

alter table public.order_items
  add column if not exists supplier_id uuid references public.suppliers(id),
  add column if not exists supplier_sku_snapshot text,
  add column if not exists supplier_cost_snapshot numeric(12,2),
  add column if not exists supplier_lead_time_snapshot integer,
  add column if not exists procurement_status public.procurement_status default 'not_assigned' not null,
  add column if not exists procurement_notes text,
  add column if not exists supplier_assigned_at timestamptz,
  add column if not exists supplier_assigned_by uuid references public.profiles(id);

create index if not exists order_items_supplier_id_idx on public.order_items(supplier_id);

-- ---------------------------------------------------------------------------
-- 5. Granular permissions: module.action keys, mapped per existing app_role.
--    Layered ON TOP of the existing role system (profiles.role / app_role) -
--    does not introduce multi-role users or replace has_any_role()/is_admin()
--    etc, which every Phase 1 RLS policy already depends on.
-- ---------------------------------------------------------------------------
create table if not exists public.permissions (
  key text primary key,
  module text not null,
  description text
);

create table if not exists public.role_permissions (
  role public.app_role not null,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role, permission_key)
);

insert into public.permissions (key, module, description) values
  ('suppliers.view', 'suppliers', 'View supplier master data'),
  ('suppliers.create', 'suppliers', 'Create suppliers'),
  ('suppliers.edit', 'suppliers', 'Edit suppliers'),
  ('suppliers.delete', 'suppliers', 'Deactivate/delete suppliers'),
  ('suppliers.cost_view', 'suppliers', 'View supplier cost/pricing figures'),
  ('products.supplier_manage', 'products', 'Add, edit or remove a product''s supplier mappings'),
  ('orders.assign_supplier', 'orders', 'Assign or change the supplier on an order line'),
  ('orders.procurement', 'orders', 'Update procurement status and notes on an order line'),
  ('permissions.manage', 'users', 'Manage role-to-permission mappings')
on conflict (key) do nothing;

insert into public.role_permissions (role, permission_key)
select r::public.app_role, p from (values
  ('admin','suppliers.view'), ('admin','suppliers.create'), ('admin','suppliers.edit'), ('admin','suppliers.delete'),
  ('admin','suppliers.cost_view'), ('admin','products.supplier_manage'), ('admin','orders.assign_supplier'),
  ('admin','orders.procurement'), ('admin','permissions.manage'),
  ('operations','suppliers.view'), ('operations','suppliers.create'), ('operations','suppliers.edit'),
  ('operations','suppliers.cost_view'), ('operations','products.supplier_manage'),
  ('operations','orders.assign_supplier'), ('operations','orders.procurement'),
  ('management','suppliers.view'), ('management','suppliers.cost_view'),
  ('accounts','suppliers.view'), ('accounts','suppliers.cost_view'),
  ('sales','suppliers.view')
) as t(r, p)
on conflict (role, permission_key) do nothing;

create or replace function public.has_permission(perm_key text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(
    (select true from public.role_permissions rp
     join public.profiles pr on pr.role = rp.role
     where pr.id = auth.uid() and rp.permission_key = perm_key and pr.is_active
     limit 1),
    false
  );
$function$;

-- ---------------------------------------------------------------------------
-- 6. RLS - internal-staff-only on every new table. Nothing here is ever
--    joined into client_products/client_product_variants/client_product_images
--    or any portal query, so this is a second, independent layer of
--    protection on top of that existing column-allowlist boundary.
-- ---------------------------------------------------------------------------
alter table public.product_suppliers enable row level security;
drop policy if exists product_suppliers_select on public.product_suppliers;
create policy product_suppliers_select on public.product_suppliers for select to authenticated using (is_internal());
drop policy if exists product_suppliers_write on public.product_suppliers;
create policy product_suppliers_write on public.product_suppliers for all to authenticated
  using (has_permission('products.supplier_manage')) with check (has_permission('products.supplier_manage'));

alter table public.supplier_cost_history enable row level security;
drop policy if exists supplier_cost_history_select on public.supplier_cost_history;
create policy supplier_cost_history_select on public.supplier_cost_history for select to authenticated
  using (is_internal() and has_permission('suppliers.cost_view'));
drop policy if exists supplier_cost_history_insert on public.supplier_cost_history;
create policy supplier_cost_history_insert on public.supplier_cost_history for insert to authenticated
  with check (has_permission('products.supplier_manage'));

alter table public.permissions enable row level security;
drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions for select to authenticated using (is_internal());
drop policy if exists permissions_write on public.permissions;
create policy permissions_write on public.permissions for all to authenticated
  using (has_permission('permissions.manage')) with check (has_permission('permissions.manage'));

alter table public.role_permissions enable row level security;
drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated using (is_internal());
drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (has_permission('permissions.manage')) with check (has_permission('permissions.manage'));
