-- B2C storefront checkout + payment pipeline (PayU-ready, demo-first).
--
-- Purely additive: no existing table, column, row, or RLS policy is changed
-- or removed.
--
-- Why new tables instead of the existing orders/order_items/payments:
--   * orders/order_items model an internal B2B fulfilment pipeline (cost,
--     supplier, printing vendor, courier, department routing) and its RLS
--     requires an authenticated admin/sales/operations session to INSERT —
--     an anonymous guest checkout has no such session at all.
--   * payments is scoped to invoice_id (accounts-receivable reconciliation
--     against a CRM invoice) with payment_method limited to manual methods
--     (bank_transfer/cheque/upi/card/cash) and zero client-facing RLS access
--     — there is no room in it for a gateway transaction id, hash, or
--     verification metadata without changing what it means for existing
--     internal reporting.
--
-- Instead: a checkout/payment is captured here, written exclusively via the
-- service-role admin client (the same pattern src/app/cart/actions.ts and
-- src/app/request-quote/actions.ts already use for anonymous public forms —
-- there is no auth.uid() to satisfy the internal tables' RLS at all). Once a
-- payment is verified server-side, a REAL row is created in the existing
-- orders/order_items tables so fulfilment staff keep using the exact same
-- CRM pipeline they already do for every other order.

-- ---------------------------------------------------------------------------
-- Product customization (per-product, a fixed toggleable set of fields —
-- not a generic form-builder). Additive columns, default off for every
-- existing product.
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists customization_enabled boolean not null default false;

alter table public.products
  add column if not exists customization_fields text[];

-- ---------------------------------------------------------------------------
-- Variant + customization on order_items — the existing table has neither,
-- so today's orders cannot record which colour or personalisation a B2C
-- customer chose. Both nullable/additive; every existing order_items row is
-- unaffected.
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null;

alter table public.order_items
  add column if not exists customization jsonb;

do $$ begin
  create type public.storefront_payment_status as enum ('pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.storefront_checkout_status as enum ('draft', 'awaiting_payment', 'paid', 'failed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- storefront_checkouts: one row per checkout attempt from /cart onward.
-- ---------------------------------------------------------------------------
create table if not exists public.storefront_checkouts (
  id uuid default gen_random_uuid() not null primary key,
  status public.storefront_checkout_status default 'draft' not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  delivery_address_line text not null,
  delivery_city text not null,
  delivery_state text,
  delivery_postal_code text,
  delivery_country text default 'India' not null,
  subtotal numeric not null default 0,
  tax_amount numeric not null default 0,
  delivery_charge numeric not null default 0,
  total_amount numeric not null default 0,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.storefront_checkout_items (
  id uuid default gen_random_uuid() not null primary key,
  checkout_id uuid not null references public.storefront_checkouts(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  quantity integer not null,
  unit_price numeric not null,
  line_total numeric not null,
  customization jsonb,
  customization_file_path text,
  created_at timestamp with time zone default now() not null
);

create index if not exists storefront_checkout_items_checkout_idx on public.storefront_checkout_items (checkout_id);

-- ---------------------------------------------------------------------------
-- storefront_payments: one row per payment ATTEMPT (a checkout can have more
-- than one if an earlier attempt failed/was cancelled and the customer tried
-- again). provider_txn_id is the idempotency anchor — the PayU callback and
-- the Verify Payment API reconciliation both key off it, and it is unique so
-- a duplicate callback can never double-process the same attempt.
-- ---------------------------------------------------------------------------
create table if not exists public.storefront_payments (
  id uuid default gen_random_uuid() not null primary key,
  checkout_id uuid not null references public.storefront_checkouts(id) on delete cascade,
  provider text not null,
  provider_txn_id text not null,
  provider_reference text,
  status public.storefront_payment_status default 'pending' not null,
  amount numeric not null,
  currency text default 'INR' not null,
  failure_reason text,
  raw_response jsonb,
  verified_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint storefront_payments_provider_txn_id_key unique (provider_txn_id)
);

create index if not exists storefront_payments_checkout_idx on public.storefront_payments (checkout_id);

-- RLS: enabled with no permissive policies at all. Every read/write goes
-- through server actions and the PayU callback route using the service-role
-- admin client (there is no Supabase Auth session for an anonymous shopper
-- to authorize against), exactly like the existing public cart/quote forms.
alter table public.storefront_checkouts enable row level security;
alter table public.storefront_checkout_items enable row level security;
alter table public.storefront_payments enable row level security;

drop trigger if exists set_updated_at_storefront_checkouts on public.storefront_checkouts;
create trigger set_updated_at_storefront_checkouts
  before update on public.storefront_checkouts
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_storefront_payments on public.storefront_payments;
create trigger set_updated_at_storefront_payments
  before update on public.storefront_payments
  for each row execute function public.set_updated_at();
