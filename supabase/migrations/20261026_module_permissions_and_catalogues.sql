-- Phase 3: module-level permissions (C7) + Catalogues on top of campaigns (D).
-- Additive and idempotent: safe to run more than once. Run in the Supabase SQL
-- editor for project zrfetfibatcuvwogyvjn. No existing rows are changed or deleted
-- (campaigns / campaign_products / client_product_selections have 0 rows today).

-- ---------------------------------------------------------------------------
-- 1. Module access (Settings > Role Permissions). Defaults = what each role sees today.
-- ---------------------------------------------------------------------------
insert into public.permissions (key, module, description) values
  ('module.dashboard', 'Module access', 'Open Dashboard (Workspace)'),
  ('module.my_work', 'Module access', 'Open My Work (Workspace)'),
  ('module.tasks', 'Module access', 'Open Tasks (Workspace)'),
  ('module.companies', 'Module access', 'Open Companies (Customers)'),
  ('module.contacts', 'Module access', 'Open Contacts (Customers)'),
  ('module.leads', 'Module access', 'Open Leads (Sales)'),
  ('module.goals', 'Module access', 'Open Goal Tracker (Sales)'),
  ('module.requirements', 'Module access', 'Open Requirements (Sales)'),
  ('module.products', 'Module access', 'Open Products (Sales)'),
  ('module.catalogues', 'Module access', 'Open Catalogues (Sales)'),
  ('module.pricing', 'Module access', 'Open Pricing & MRP (Sales)'),
  ('module.mockups', 'Module access', 'Open Mockup Storage (Sales)'),
  ('module.quotations', 'Module access', 'Open Quotations (Sales)'),
  ('module.orders', 'Module access', 'Open Orders (Sales)'),
  ('module.samples', 'Module access', 'Open Samples (Sales)'),
  ('module.activities', 'Module access', 'Open Activities (Sales)'),
  ('module.order_management', 'Module access', 'Open Order Management (Operations)'),
  ('module.department', 'Module access', 'Open Department (Operations)'),
  ('module.suppliers', 'Module access', 'Open Suppliers (Operations)'),
  ('module.notifications', 'Module access', 'Open Notifications (Operations)'),
  ('module.printing', 'Module access', 'Open Printing vendors (Operations)'),
  ('module.delivery', 'Module access', 'Open Delivery / dispatch (Operations)'),
  ('module.invoices', 'Module access', 'Open Invoices (Finance)'),
  ('module.payments', 'Module access', 'Open Payments (Finance)'),
  ('module.receivables', 'Module access', 'Open Receivables (Finance)'),
  ('module.payables', 'Module access', 'Open Payables (Finance)'),
  ('module.gst_reports', 'Module access', 'Open GST Reports (Finance)'),
  ('module.reports', 'Module access', 'Open Reports (Management)'),
  ('module.tracking', 'Module access', 'Open Tracking (Management)'),
  ('module.reviews', 'Module access', 'Open Reviews (Management)'),
  ('module.audit_log', 'Module access', 'Open Audit Log (Management)'),
  ('module.announcements', 'Module access', 'Open Announcements (System)'),
  ('module.knowledge', 'Module access', 'Open Knowledge Center (System)'),
  ('module.team', 'Module access', 'Open My Team (Admin)'),
  ('module.permissions', 'Module access', 'Open Role Permissions (Admin)'),
  ('module.settings', 'Module access', 'Open Settings (Admin)')
on conflict (key) do nothing;

insert into public.role_permissions (role, permission_key) values
  ('admin'::public.app_role, 'module.dashboard'),
  ('sales'::public.app_role, 'module.dashboard'),
  ('operations'::public.app_role, 'module.dashboard'),
  ('accounts'::public.app_role, 'module.dashboard'),
  ('management'::public.app_role, 'module.dashboard'),
  ('admin'::public.app_role, 'module.my_work'),
  ('sales'::public.app_role, 'module.my_work'),
  ('operations'::public.app_role, 'module.my_work'),
  ('accounts'::public.app_role, 'module.my_work'),
  ('management'::public.app_role, 'module.my_work'),
  ('admin'::public.app_role, 'module.tasks'),
  ('sales'::public.app_role, 'module.tasks'),
  ('operations'::public.app_role, 'module.tasks'),
  ('accounts'::public.app_role, 'module.tasks'),
  ('management'::public.app_role, 'module.tasks'),
  ('admin'::public.app_role, 'module.companies'),
  ('sales'::public.app_role, 'module.companies'),
  ('management'::public.app_role, 'module.companies'),
  ('admin'::public.app_role, 'module.contacts'),
  ('sales'::public.app_role, 'module.contacts'),
  ('management'::public.app_role, 'module.contacts'),
  ('admin'::public.app_role, 'module.leads'),
  ('sales'::public.app_role, 'module.leads'),
  ('management'::public.app_role, 'module.leads'),
  ('admin'::public.app_role, 'module.goals'),
  ('sales'::public.app_role, 'module.goals'),
  ('management'::public.app_role, 'module.goals'),
  ('admin'::public.app_role, 'module.requirements'),
  ('sales'::public.app_role, 'module.requirements'),
  ('management'::public.app_role, 'module.requirements'),
  ('admin'::public.app_role, 'module.products'),
  ('sales'::public.app_role, 'module.products'),
  ('management'::public.app_role, 'module.products'),
  ('operations'::public.app_role, 'module.products'),
  ('admin'::public.app_role, 'module.catalogues'),
  ('sales'::public.app_role, 'module.catalogues'),
  ('management'::public.app_role, 'module.catalogues'),
  ('admin'::public.app_role, 'module.pricing'),
  ('sales'::public.app_role, 'module.pricing'),
  ('management'::public.app_role, 'module.pricing'),
  ('admin'::public.app_role, 'module.mockups'),
  ('sales'::public.app_role, 'module.mockups'),
  ('management'::public.app_role, 'module.mockups'),
  ('admin'::public.app_role, 'module.quotations'),
  ('sales'::public.app_role, 'module.quotations'),
  ('management'::public.app_role, 'module.quotations'),
  ('admin'::public.app_role, 'module.orders'),
  ('sales'::public.app_role, 'module.orders'),
  ('management'::public.app_role, 'module.orders'),
  ('operations'::public.app_role, 'module.orders'),
  ('admin'::public.app_role, 'module.samples'),
  ('sales'::public.app_role, 'module.samples'),
  ('management'::public.app_role, 'module.samples'),
  ('operations'::public.app_role, 'module.samples'),
  ('admin'::public.app_role, 'module.activities'),
  ('sales'::public.app_role, 'module.activities'),
  ('management'::public.app_role, 'module.activities'),
  ('admin'::public.app_role, 'module.order_management'),
  ('operations'::public.app_role, 'module.order_management'),
  ('management'::public.app_role, 'module.order_management'),
  ('admin'::public.app_role, 'module.department'),
  ('operations'::public.app_role, 'module.department'),
  ('management'::public.app_role, 'module.department'),
  ('admin'::public.app_role, 'module.suppliers'),
  ('operations'::public.app_role, 'module.suppliers'),
  ('management'::public.app_role, 'module.suppliers'),
  ('admin'::public.app_role, 'module.notifications'),
  ('operations'::public.app_role, 'module.notifications'),
  ('management'::public.app_role, 'module.notifications'),
  ('admin'::public.app_role, 'module.printing'),
  ('operations'::public.app_role, 'module.printing'),
  ('management'::public.app_role, 'module.printing'),
  ('admin'::public.app_role, 'module.delivery'),
  ('operations'::public.app_role, 'module.delivery'),
  ('management'::public.app_role, 'module.delivery'),
  ('admin'::public.app_role, 'module.invoices'),
  ('accounts'::public.app_role, 'module.invoices'),
  ('management'::public.app_role, 'module.invoices'),
  ('admin'::public.app_role, 'module.payments'),
  ('accounts'::public.app_role, 'module.payments'),
  ('management'::public.app_role, 'module.payments'),
  ('admin'::public.app_role, 'module.receivables'),
  ('accounts'::public.app_role, 'module.receivables'),
  ('management'::public.app_role, 'module.receivables'),
  ('admin'::public.app_role, 'module.payables'),
  ('accounts'::public.app_role, 'module.payables'),
  ('management'::public.app_role, 'module.payables'),
  ('admin'::public.app_role, 'module.gst_reports'),
  ('accounts'::public.app_role, 'module.gst_reports'),
  ('management'::public.app_role, 'module.gst_reports'),
  ('admin'::public.app_role, 'module.reports'),
  ('management'::public.app_role, 'module.reports'),
  ('admin'::public.app_role, 'module.tracking'),
  ('management'::public.app_role, 'module.tracking'),
  ('admin'::public.app_role, 'module.reviews'),
  ('management'::public.app_role, 'module.reviews'),
  ('admin'::public.app_role, 'module.audit_log'),
  ('management'::public.app_role, 'module.audit_log'),
  ('admin'::public.app_role, 'module.announcements'),
  ('sales'::public.app_role, 'module.announcements'),
  ('operations'::public.app_role, 'module.announcements'),
  ('accounts'::public.app_role, 'module.announcements'),
  ('management'::public.app_role, 'module.announcements'),
  ('admin'::public.app_role, 'module.knowledge'),
  ('sales'::public.app_role, 'module.knowledge'),
  ('operations'::public.app_role, 'module.knowledge'),
  ('accounts'::public.app_role, 'module.knowledge'),
  ('management'::public.app_role, 'module.knowledge'),
  ('admin'::public.app_role, 'module.team'),
  ('admin'::public.app_role, 'module.permissions'),
  ('admin'::public.app_role, 'module.settings')
on conflict (role, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Catalogues = campaigns that can be assigned to several companies.
-- ---------------------------------------------------------------------------
-- A catalogue can be a draft with no company yet.
alter table public.campaigns alter column company_id drop not null;

create table if not exists public.campaign_companies (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  primary key (campaign_id, company_id)
);
create index if not exists campaign_companies_company_idx on public.campaign_companies (company_id);

-- Existing single-company campaigns keep their company as an assignment.
insert into public.campaign_companies (campaign_id, company_id)
select id, company_id from public.campaigns where company_id is not null
on conflict do nothing;

alter table public.campaign_companies enable row level security;

drop policy if exists campaign_companies_select on public.campaign_companies;
create policy campaign_companies_select on public.campaign_companies for select
  using (can_crm() or can_ops() or can_finance() or can_management_read() or (is_client() and company_id = client_company_id()));

drop policy if exists campaign_companies_write on public.campaign_companies;
create policy campaign_companies_write on public.campaign_companies for all
  using (can_crm() and (is_admin() or has_permission('module.catalogues')))
  with check (can_crm() and (is_admin() or has_permission('module.catalogues')));

-- Management could not read campaigns before; it can open Catalogues by default now.
drop policy if exists campaigns_select_internal on public.campaigns;
create policy campaigns_select_internal on public.campaigns for select
  using (can_crm() or can_ops() or can_finance() or can_management_read());

drop policy if exists campaign_products_select_internal on public.campaign_products;
create policy campaign_products_select_internal on public.campaign_products for select
  using (can_crm() or can_ops() or can_finance() or can_management_read());

-- Clients: only published catalogues assigned to their company.
drop policy if exists campaigns_select_client on public.campaigns;
create policy campaigns_select_client on public.campaigns for select
  using (
    is_client()
    and published_to_client_at is not null
    and (
      company_id = client_company_id()
      or exists (select 1 from public.campaign_companies cc where cc.campaign_id = campaigns.id and cc.company_id = client_company_id())
    )
  );

-- Clients: only published offerings, in a catalogue they can see, for products
-- their company is allowed to see (client_products applies the product
-- visibility rules: all / selected companies / internal only).
drop policy if exists campaign_products_select_client on public.campaign_products;
create policy campaign_products_select_client on public.campaign_products for select
  using (
    visibility = 'published'::offering_visibility
    and exists (
      select 1 from public.campaigns c
      where c.id = campaign_products.campaign_id
        and c.published_to_client_at is not null
        and (
          c.company_id = client_company_id()
          or exists (select 1 from public.campaign_companies cc where cc.campaign_id = c.id and cc.company_id = client_company_id())
        )
    )
    and campaign_products.product_id in (select cp.id from public.client_products cp)
  );

drop policy if exists campaign_events_select on public.campaign_events;
create policy campaign_events_select on public.campaign_events for select
  using (
    can_crm() or can_ops()
    or (
      is_client() and exists (
        select 1 from public.campaigns c
        where c.id = campaign_events.campaign_id
          and (
            c.company_id = client_company_id()
            or exists (select 1 from public.campaign_companies cc where cc.campaign_id = c.id and cc.company_id = client_company_id())
          )
      )
    )
  );

-- Staff writes need the Catalogues module (D6/D7). Reads stay as before so
-- order/quotation screens can still show catalogue names.
drop policy if exists campaigns_write on public.campaigns;
create policy campaigns_write on public.campaigns for all
  using (can_crm() and (is_admin() or has_permission('module.catalogues')))
  with check (can_crm() and (is_admin() or has_permission('module.catalogues')));

drop policy if exists campaign_products_write on public.campaign_products;
create policy campaign_products_write on public.campaign_products for all
  using (can_crm() and (is_admin() or has_permission('module.catalogues')))
  with check (can_crm() and (is_admin() or has_permission('module.catalogues')));

-- ---------------------------------------------------------------------------
-- 3. Shortlist rows remember which catalogue they came from (staff context).
-- ---------------------------------------------------------------------------
alter table public.company_product_interests
  add column if not exists source_campaign_product_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_product_interests_source_offering_fkey') then
    alter table public.company_product_interests
      add constraint company_product_interests_source_offering_fkey
      foreign key (source_campaign_product_id) references public.campaign_products(id) on delete set null;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Verify (service role), expected: 36 module permissions; campaign_companies
-- exists with RLS on; campaigns.company_id nullable; anon sees 0 rows.
-- select count(*) from public.permissions where key like 'module.%';
-- select relrowsecurity from pg_class where oid = 'public.campaign_companies'::regclass;
-- select is_nullable from information_schema.columns where table_name='campaigns' and column_name='company_id';
