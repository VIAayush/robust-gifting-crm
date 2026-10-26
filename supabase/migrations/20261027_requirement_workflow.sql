-- Requirement approval workflow (client requirement -> admin review -> client
-- confirmation -> product selection -> admin approval -> quotation).
-- Additive and idempotent: safe to run more than once. Run in the Supabase SQL
-- editor for project zrfetfibatcuvwogyvjn AFTER 20261026_module_permissions_and_catalogues.sql.
-- No existing rows are changed (requirements / quotations are empty today).
--
-- Design:
--  * requirements.workflow_stage is NULL for requirements created by staff in the
--    CRM (they stay outside the client approval flow) and set to 'submitted' when
--    a client submits one from the portal.
--  * Every stage change goes through requirement_transition(), a SECURITY DEFINER
--    function that checks who is calling, which stage they may move it from and
--    to, and writes the history + notification. Clients have no UPDATE right on
--    requirements, so there is no other route.
--  * Quotation progress (draft / sent / accepted / rejected) moves the stage
--    automatically through a trigger on quotations, so the existing quotation
--    workflow is reused and quotation status stays its own thing.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.requirements
  add column if not exists workflow_stage text,
  add column if not exists submission_key text,
  add column if not exists submitted_at timestamptz,
  add column if not exists admin_decided_at timestamptz,
  add column if not exists admin_decided_by uuid references public.profiles(id) on delete set null,
  add column if not exists client_confirmed_at timestamptz,
  add column if not exists client_confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists selection_submitted_at timestamptz,
  add column if not exists selection_decided_at timestamptz,
  add column if not exists selection_decided_by uuid references public.profiles(id) on delete set null,
  add column if not exists decision_note text;

do $fn$
begin
  if not exists (select 1 from pg_constraint where conname = 'requirements_workflow_stage_check') then
    alter table public.requirements add constraint requirements_workflow_stage_check check (
      workflow_stage is null or workflow_stage in (
        'submitted', 'changes_requested', 'admin_rejected', 'admin_approved', 'client_confirmed',
        'selection_submitted', 'selection_changes_requested', 'selection_approved',
        'quotation_drafted', 'quotation_sent', 'quotation_accepted', 'quotation_rejected'
      )
    );
  end if;
end
$fn$;

-- One submission per (company, submission key): a double-click or retry cannot create a second requirement.
create unique index if not exists requirements_company_submission_key
  on public.requirements (company_id, submission_key) where submission_key is not null;
create index if not exists requirements_workflow_stage_idx on public.requirements (workflow_stage) where workflow_stage is not null;

-- At most one draft quotation per requirement, so repeated approvals cannot stack drafts.
create unique index if not exists quotations_one_draft_per_requirement
  on public.quotations (requirement_id) where status = 'draft' and requirement_id is not null;

alter table public.requirement_products
  add column if not exists unit_price_snapshot numeric;

-- ---------------------------------------------------------------------------
-- 2. History / comments. visible_to_client = false means internal note.
-- ---------------------------------------------------------------------------
create table if not exists public.requirement_events (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.requirements(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_kind text not null check (actor_kind in ('client', 'staff', 'system')),
  from_stage text,
  to_stage text,
  note text,
  visible_to_client boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists requirement_events_requirement_idx on public.requirement_events (requirement_id, created_at);

alter table public.requirement_events enable row level security;

-- Staff see events for requirements they can already see (RLS on requirements applies inside the subquery).
drop policy if exists requirement_events_select_staff on public.requirement_events;
create policy requirement_events_select_staff on public.requirement_events for select
  using (is_internal() and exists (select 1 from public.requirements r where r.id = requirement_events.requirement_id));

-- Clients see only the events marked visible, on their own company's requirements.
drop policy if exists requirement_events_select_client on public.requirement_events;
create policy requirement_events_select_client on public.requirement_events for select
  using (
    is_client() and visible_to_client
    and exists (select 1 from public.requirements r where r.id = requirement_events.requirement_id and r.company_id = client_company_id())
  );
-- No insert/update/delete policies: rows are written only by the functions below.

-- Clients can read (not change) the product selection on their own company's requirements.
drop policy if exists req_prod_select_client on public.requirement_products;
create policy req_prod_select_client on public.requirement_products for select
  using (
    is_client()
    and exists (select 1 from public.requirements r where r.id = requirement_products.requirement_id and r.company_id = client_company_id())
  );

-- ---------------------------------------------------------------------------
-- 3. The guarded transition function
-- ---------------------------------------------------------------------------
create or replace function public.requirement_transition(
  p_requirement_id uuid,
  p_to_stage text,
  p_note text default null,
  p_note_visible boolean default true
) returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role;
  v_is_client boolean;
  r public.requirements%rowtype;
  v_from text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_allowed boolean := false;
  v_items integer;
  v_title text;
  v_body text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select role into v_role from public.profiles where id = v_uid and is_active;
  if v_role is null then raise exception 'Not permitted'; end if;
  v_is_client := v_role in ('client_admin', 'client_user');

  select * into r from public.requirements where id = p_requirement_id for update;
  if not found then raise exception 'Requirement not found'; end if;

  if v_is_client then
    if r.company_id is distinct from public.client_company_id() then raise exception 'Requirement not found'; end if;
  else
    if v_role not in ('admin', 'sales') then raise exception 'Your role cannot review requirements'; end if;
    if v_role = 'sales' and r.owner_id is distinct from v_uid then raise exception 'Requirement not found'; end if;
  end if;

  v_from := r.workflow_stage;
  if v_from is null then raise exception 'This requirement is not part of the client approval workflow'; end if;
  if v_from = p_to_stage then return v_from; end if; -- repeat / double-click: nothing to do

  if v_is_client then
    v_allowed := (v_from = 'changes_requested' and p_to_stage = 'submitted')
      or (v_from = 'admin_approved' and p_to_stage in ('client_confirmed', 'submitted'))
      or (v_from = 'client_confirmed' and p_to_stage = 'selection_submitted')
      or (v_from = 'selection_changes_requested' and p_to_stage = 'selection_submitted');
  else
    v_allowed := (v_from = 'submitted' and p_to_stage in ('admin_approved', 'admin_rejected', 'changes_requested'))
      or (v_from = 'selection_submitted' and p_to_stage in ('selection_approved', 'selection_changes_requested'));
  end if;
  if not v_allowed then
    raise exception 'This requirement cannot move from % to % for your role', v_from, p_to_stage;
  end if;

  if p_to_stage in ('admin_rejected', 'changes_requested', 'selection_changes_requested') and v_note is null then
    raise exception 'Please add a note explaining the reason';
  end if;
  if v_is_client and v_from = 'admin_approved' and p_to_stage = 'submitted' and v_note is null then
    raise exception 'Please tell us what needs to change';
  end if;

  if p_to_stage = 'selection_submitted' then
    select count(*) into v_items from public.requirement_products where requirement_id = r.id and quantity >= 1;
    if v_items = 0 then raise exception 'Add at least one product before submitting your selection'; end if;
  end if;

  update public.requirements set
    workflow_stage = p_to_stage,
    decision_note = case when p_to_stage in ('admin_rejected', 'changes_requested', 'selection_changes_requested', 'admin_approved', 'selection_approved') then v_note else decision_note end,
    submitted_at = case when p_to_stage = 'submitted' then now() else submitted_at end,
    admin_decided_at = case when p_to_stage in ('admin_approved', 'admin_rejected', 'changes_requested') then now() else admin_decided_at end,
    admin_decided_by = case when p_to_stage in ('admin_approved', 'admin_rejected', 'changes_requested') then v_uid else admin_decided_by end,
    client_confirmed_at = case when p_to_stage = 'client_confirmed' then now() else client_confirmed_at end,
    client_confirmed_by = case when p_to_stage = 'client_confirmed' then v_uid else client_confirmed_by end,
    selection_submitted_at = case when p_to_stage = 'selection_submitted' then now() else selection_submitted_at end,
    selection_decided_at = case when p_to_stage in ('selection_approved', 'selection_changes_requested') then now() else selection_decided_at end,
    selection_decided_by = case when p_to_stage in ('selection_approved', 'selection_changes_requested') then v_uid else selection_decided_by end,
    status = case when p_to_stage = 'admin_rejected' then 'closed'::public.requirement_status else status end,
    updated_at = now()
  where id = r.id;

  insert into public.requirement_events (requirement_id, actor_id, actor_kind, from_stage, to_stage, note, visible_to_client)
  values (r.id, v_uid, case when v_is_client then 'client' else 'staff' end, v_from, p_to_stage, v_note, case when v_is_client then true else p_note_visible end);

  -- In-app notifications (email / WhatsApp are queued by the application after this call).
  if v_is_client then
    v_title := case p_to_stage
      when 'submitted' then 'Requirement ' || (case when v_from = 'changes_requested' then 'resubmitted' else 'sent back for changes' end) || ': ' || r.name
      when 'client_confirmed' then 'Client confirmed requirement: ' || r.name
      else 'Client submitted product selection: ' || r.name end;
    perform public.notify_users('internal', r.company_id, v_title, v_note, '/crm/requirements/' || r.id);
  else
    v_title := case p_to_stage
      when 'admin_approved' then 'Your requirement was approved: ' || r.name
      when 'admin_rejected' then 'Your requirement was not accepted: ' || r.name
      when 'changes_requested' then 'Changes requested on your requirement: ' || r.name
      when 'selection_approved' then 'Your product selection was approved: ' || r.name
      else 'Changes requested on your product selection: ' || r.name end;
    v_body := case p_to_stage
      when 'admin_approved' then 'Please review and confirm it to continue.'
      when 'selection_approved' then 'We are preparing your quotation.'
      else v_note end;
    perform public.notify_users('client', r.company_id, v_title, v_body, '/portal/requirements/' || r.id);
  end if;

  return p_to_stage;
end;
$fn$;

revoke all on function public.requirement_transition(uuid, text, text, boolean) from public, anon;
grant execute on function public.requirement_transition(uuid, text, text, boolean) to authenticated;

-- Internal note: staff only, never shown to the client.
create or replace function public.requirement_add_internal_note(p_requirement_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role;
  r public.requirements%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select role into v_role from public.profiles where id = v_uid and is_active;
  if v_role is null or v_role not in ('admin', 'sales') then raise exception 'Not permitted'; end if;
  if v_note is null then raise exception 'Write a note first'; end if;
  select * into r from public.requirements where id = p_requirement_id;
  if not found then raise exception 'Requirement not found'; end if;
  if v_role = 'sales' and r.owner_id is distinct from v_uid then raise exception 'Requirement not found'; end if;
  insert into public.requirement_events (requirement_id, actor_id, actor_kind, note, visible_to_client)
  values (r.id, v_uid, 'staff', left(v_note, 2000), false);
end;
$fn$;

revoke all on function public.requirement_add_internal_note(uuid, text) from public, anon;
grant execute on function public.requirement_add_internal_note(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Quotations follow the requirement, and cannot be created early
-- ---------------------------------------------------------------------------
create or replace function public.quotation_requirement_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_stage text;
begin
  if new.requirement_id is null then return new; end if;
  select workflow_stage into v_stage from public.requirements where id = new.requirement_id;
  -- Staff-created requirements (no workflow stage) are unaffected.
  if v_stage is null then return new; end if;
  if v_stage not in ('selection_approved', 'quotation_drafted', 'quotation_sent', 'quotation_rejected') then
    raise exception 'A quotation can only be prepared after the product selection is approved (current stage: %)', v_stage;
  end if;
  return new;
end;
$fn$;

drop trigger if exists quotations_requirement_guard on public.quotations;
create trigger quotations_requirement_guard before insert on public.quotations
  for each row execute function public.quotation_requirement_guard();

create or replace function public.quotation_requirement_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r public.requirements%rowtype;
  v_to text;
  v_ok boolean := false;
begin
  if new.requirement_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;

  select * into r from public.requirements where id = new.requirement_id for update;
  if not found or r.workflow_stage is null then return new; end if;

  v_to := case new.status
    when 'draft' then 'quotation_drafted'
    when 'sent' then 'quotation_sent'
    when 'accepted' then 'quotation_accepted'
    when 'rejected' then 'quotation_rejected'
    else null end;
  if v_to is null or v_to = r.workflow_stage then return new; end if;

  v_ok := (v_to = 'quotation_drafted' and r.workflow_stage in ('selection_approved', 'quotation_rejected'))
       or (v_to = 'quotation_sent' and r.workflow_stage in ('selection_approved', 'quotation_drafted', 'quotation_rejected'))
       or (v_to in ('quotation_accepted', 'quotation_rejected') and r.workflow_stage = 'quotation_sent');
  if not v_ok then return new; end if;

  update public.requirements set
    workflow_stage = v_to,
    status = case v_to when 'quotation_sent' then 'quoted'::public.requirement_status
                       when 'quotation_accepted' then 'won'::public.requirement_status
                       when 'quotation_rejected' then 'lost'::public.requirement_status
                       else status end,
    updated_at = now()
  where id = r.id;

  insert into public.requirement_events (requirement_id, actor_id, actor_kind, from_stage, to_stage, note, visible_to_client)
  values (r.id, auth.uid(), 'system', r.workflow_stage, v_to, 'Quotation ' || new.quotation_number || ' ' || new.status::text, v_to <> 'quotation_drafted');
  return new;
end;
$fn$;

drop trigger if exists quotations_requirement_sync on public.quotations;
create trigger quotations_requirement_sync after insert or update of status on public.quotations
  for each row execute function public.quotation_requirement_sync();

-- ---------------------------------------------------------------------------
-- Verify (service role), expected: 12 stages in the check constraint; both
-- functions present; requirement_events has RLS on; anon sees 0 rows.
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'requirements_workflow_stage_check';
-- select proname from pg_proc where proname in ('requirement_transition','requirement_add_internal_note','quotation_requirement_sync');
-- select relrowsecurity from pg_class where oid = 'public.requirement_events'::regclass;
