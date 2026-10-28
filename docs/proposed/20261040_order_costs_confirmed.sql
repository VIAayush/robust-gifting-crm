-- PROPOSAL FOR REVIEW. NOT APPLIED. Deliberately NOT in supabase/migrations/ so it can not be run by accident.
-- Do not run until you have approved it and Claude has wired the matching application change (listed at the bottom).
--
-- WHY A SCHEMA CHANGE IS THE ONLY CORRECT FIX
-- The order cost columns (product_cost, printing_cost, courier_cost, other_cost) are NOT NULL DEFAULT 0. A stored 0 can
-- mean "really zero" (for example no printing is needed) or "not entered yet", and nothing in the schema says which.
-- Without this, an order can only be called fully costed when EVERY component is greater than zero, so an order with a
-- legitimately zero component can never show verified profit; it stays "provisional". That is the safe rule the
-- application uses today (src/lib/orders/costing.ts) and it needs no migration.
--
-- WHAT THIS ADDS: a staff confirmation, recorded with who and when, that "the costing is complete; a zero means zero".
--   orders.costs_confirmed_at / costs_confirmed_by   (NULL = not confirmed)
-- With a confirmation, an order is VERIFIED when product cost > 0 and the costing is confirmed (zero components allowed),
-- or when all four components are > 0 (as today). Editing any cost clears the confirmation until staff confirm again.
--
-- IMPACT / COMPATIBILITY
--  * Additive, idempotent, two nullable columns, no existing row changes (both NULL for every order).
--  * Migration 20261035 withdrew table-wide SELECT on public.orders; a new column is NOT readable until granted, so this
--    file grants SELECT on the two new columns (they are not cost figures).
--  * recalc_order_cost (from migration 20261039) is replaced; its caller check and its "stored profit = verified profit
--    only" meaning are unchanged, it just also honours the confirmation.
--  * The application keeps working if this is never applied (it does not read the columns until the change below is made).
--
-- Apply AFTER 20261039. Rollback: drop the two columns and re-create recalc_order_cost from migration 20261039.

alter table public.orders
  add column if not exists costs_confirmed_at timestamptz,
  add column if not exists costs_confirmed_by uuid references public.profiles(id) on delete set null;

grant select (costs_confirmed_at, costs_confirmed_by) on public.orders to authenticated;

-- Staff with costing rights confirm (or withdraw the confirmation of) an order's costing.
create or replace function public.confirm_order_costs(p_order_id uuid, p_confirmed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.has_any_role(array['admin', 'accounts', 'management']::public.app_role[]) then
    raise exception 'Not permitted to confirm order costing';
  end if;
  update public.orders
     set costs_confirmed_at = case when p_confirmed then now() else null end,
         costs_confirmed_by = case when p_confirmed then auth.uid() else null end
   where id = p_order_id;
  perform public.recalc_order_cost(p_order_id);
end;
$fn$;

revoke all on function public.confirm_order_costs(uuid, boolean) from public, anon;
grant execute on function public.confirm_order_costs(uuid, boolean) to authenticated, service_role;

-- Stored gross_profit stays "verified profit only": written when product cost > 0 and either every component is > 0 or
-- the costing has been confirmed; 0 otherwise.
create or replace function public.recalc_order_cost(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.has_any_role(array['admin', 'accounts', 'management']::public.app_role[]) then
    raise exception 'Not permitted to change order costing';
  end if;
  update public.orders set
    total_cost = greatest(coalesce(product_cost, 0), 0) + greatest(coalesce(printing_cost, 0), 0)
               + greatest(coalesce(courier_cost, 0), 0) + greatest(coalesce(other_cost, 0), 0),
    gross_profit = case
      when greatest(coalesce(product_cost, 0), 0) > 0
       and (costs_confirmed_at is not null
            or (greatest(coalesce(printing_cost, 0), 0) > 0 and greatest(coalesce(courier_cost, 0), 0) > 0 and greatest(coalesce(other_cost, 0), 0) > 0))
        then coalesce(order_value, 0) - (greatest(coalesce(product_cost, 0), 0) + greatest(coalesce(printing_cost, 0), 0)
                                         + greatest(coalesce(courier_cost, 0), 0) + greatest(coalesce(other_cost, 0), 0))
      else 0
    end
  where id = p_order_id;
end;
$fn$;

-- Editing any cost withdraws the confirmation, so a changed costing must be confirmed again.
create or replace function public.orders_costs_unconfirm()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.costs_confirmed_at is not null
     and (new.product_cost is distinct from old.product_cost or new.printing_cost is distinct from old.printing_cost
          or new.courier_cost is distinct from old.courier_cost or new.other_cost is distinct from old.other_cost)
     and new.costs_confirmed_at is not distinct from old.costs_confirmed_at then
    new.costs_confirmed_at := null;
    new.costs_confirmed_by := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists orders_costs_unconfirm on public.orders;
create trigger orders_costs_unconfirm before update of product_cost, printing_cost, courier_cost, other_cost on public.orders
  for each row execute function public.orders_costs_unconfirm();

-- APPLICATION CHANGE NEEDED BEFORE THIS IS USEFUL (not made yet, so nothing depends on this file):
--  1. src/lib/orders/costing.ts: add an optional `costs_confirmed` input; with product cost > 0 and the flag set, the state
--     is 'verified' even when printing / courier / other are 0 (zeroComponents then reads as "confirmed zero").
--  2. Order page, Financials tab: a "Costing is complete (a zero means zero)" checkbox on the Save costing form; the
--     server action calls confirm_order_costs(order, checked) after saving; the page reads costs_confirmed_at.
--  3. Tests: confirmed with zero components -> verified; edit after confirmation -> provisional again; dashboard sums it.
