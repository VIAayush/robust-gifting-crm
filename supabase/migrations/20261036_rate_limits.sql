-- Rate limiting for anonymous public actions (enquiry form, personalisation uploads, order lookup).
-- Additive and idempotent. Apply after 20261035_order_cost_protection.sql, manually in the SQL Editor.
-- The application falls back to a per-instance in-memory window while this is not applied.
--
-- Callers pass a HASHED client key (never a raw IP address). The table has RLS enabled and NO policies, so the
-- API roles cannot read or write it; only the SECURITY DEFINER function below (called with the service role) can.

create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  key_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_lookup_idx on public.rate_limit_events (bucket, key_hash, created_at desc);

alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from anon, authenticated;

-- Returns true when the call is allowed (and records it), false when the key is over the limit for the window.
create or replace function public.rate_limit_check(p_bucket text, p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  if p_bucket is null or p_key is null or p_max < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate limit arguments';
  end if;
  -- Serialise concurrent checks for the same key so two simultaneous requests cannot both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended(p_bucket || ':' || p_key, 0));
  -- Keep the table small: drop this key's expired events, and a little old data from everyone.
  delete from public.rate_limit_events
   where bucket = p_bucket and key_hash = p_key and created_at < now() - make_interval(secs => p_window_seconds);
  delete from public.rate_limit_events where created_at < now() - interval '2 days' and id in (
    select id from public.rate_limit_events where created_at < now() - interval '2 days' limit 200
  );
  select count(*) into v_count from public.rate_limit_events
   where bucket = p_bucket and key_hash = p_key and created_at >= now() - make_interval(secs => p_window_seconds);
  if v_count >= p_max then
    return false;
  end if;
  insert into public.rate_limit_events (bucket, key_hash) values (p_bucket, p_key);
  return true;
end;
$fn$;

revoke all on function public.rate_limit_check(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_check(text, text, integer, integer) to service_role;

-- Verification (as the SQL Editor owner):
-- select public.rate_limit_check('test', 'k', 2, 60);   -- true
-- select public.rate_limit_check('test', 'k', 2, 60);   -- true
-- select public.rate_limit_check('test', 'k', 2, 60);   -- false (third call in the window)
-- delete from public.rate_limit_events where bucket = 'test';
-- select rowsecurity from pg_tables where tablename = 'rate_limit_events';   -- true
