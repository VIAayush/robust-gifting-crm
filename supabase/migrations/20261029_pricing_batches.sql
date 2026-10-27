-- Pricing batches: group bulk price changes so a whole batch can be rolled back safely.
-- Additive and idempotent. Apply after 20261028_company_allowed_email_domains.sql, manually in the SQL Editor.
-- The application tolerates this migration being absent: bulk updates still work and are recorded
-- without a batch id, but the Roll back button is hidden until the columns exist.

alter table public.product_price_history
  add column if not exists batch_id uuid,
  add column if not exists rollback_of uuid;

create index if not exists product_price_history_batch_idx
  on public.product_price_history (batch_id) where batch_id is not null;
create index if not exists product_price_history_rollback_of_idx
  on public.product_price_history (rollback_of) where rollback_of is not null;

-- RLS is already enabled on this table (20260926_mrp_orders_notifications.sql): internal staff can
-- select and insert; nobody can update or delete history rows.

-- Verification:
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'product_price_history' and column_name in ('batch_id', 'rollback_of');
