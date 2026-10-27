-- Configurable staff e-mail destination for internal alerts (new requirement, sample request, order, quotation outcome ...).
-- Additive and idempotent. Apply after 20261029_pricing_batches.sql, manually in the SQL Editor.
-- No address is seeded: until an admin enters one in Settings, no staff e-mail is sent
-- (WhatsApp outbox and in-app notifications are unaffected).

alter table public.org_settings
  add column if not exists staff_notification_email text;

do $fn$
begin
  if not exists (select 1 from pg_constraint where conname = 'org_settings_staff_notification_email_format') then
    alter table public.org_settings add constraint org_settings_staff_notification_email_format
      check (staff_notification_email is null or staff_notification_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$');
  end if;
end
$fn$;

-- RLS on org_settings is unchanged (admin-managed through the Settings page).

-- Verification:
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'org_settings' and column_name = 'staff_notification_email';
