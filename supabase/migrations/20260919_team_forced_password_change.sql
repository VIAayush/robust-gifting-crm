-- Adds a flag so an admin-created login (portal team invite) can force the
-- recipient to set their own password before using the account further.
-- Additive only: safe to run against the live project.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;
