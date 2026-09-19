-- Robust Gifting - complete database baseline
-- Captures the full schema (tables, constraints, indexes, functions, triggers,
-- RLS policies, storage buckets and grants) as applied to the Robust Gifting
-- Supabase project. The dated files in supabase/migrations/ are retained as the
-- incremental history; every change in them is already folded into this file.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.activity_status as enum ('upcoming','completed','missed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.activity_type as enum ('call','email','meeting','follow_up','message');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.app_role as enum ('admin','sales','operations','accounts','management','client_admin','client_user');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.campaign_status as enum ('planning','internal_review','published_to_client','client_viewed','client_shortlisted','client_selected','quoted','awaiting_approval','approved','rejected','order_ready','closed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.company_status as enum ('active','inactive','prospect');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.contact_type as enum ('primary','billing','procurement','other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.invoice_status as enum ('unpaid','partially_paid','paid','overdue');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.lead_source as enum ('inbound','referral','event','outbound','website','other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.lead_stage as enum ('cold','warm','hot','client','regular_client');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.mockup_status as enum ('draft','shared','approved','rejected');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.notification_audience as enum ('internal','client');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.offering_visibility as enum ('draft','published','unpublished','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.order_status as enum ('created','confirmed','in_progress','dispatched','delivered','cancelled','procurement','printing','quality_check','ready_to_dispatch');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_method as enum ('bank_transfer','cheque','upi','card','cash','other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.product_status as enum ('active','discontinued');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.quotation_status as enum ('draft','sent','accepted','rejected','expired','viewed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.requirement_status as enum ('draft','active','quoted','won','lost','closed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.selection_kind as enum ('none','shortlisted','selected','rejected');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Sequences
-- ---------------------------------------------------------------------------
create sequence if not exists public.invoice_seq start with 3001;
create sequence if not exists public.order_seq start with 2001;
create sequence if not exists public.quotation_seq start with 1001;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.activities (
  id uuid default gen_random_uuid() not null,
  title text not null,
  type activity_type default 'follow_up'::activity_type not null,
  due_at timestamp with time zone,
  assigned_to uuid,
  related_type text,
  related_id uuid,
  status activity_status default 'upcoming'::activity_status not null,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.announcements (
  id uuid default gen_random_uuid() not null,
  title text not null,
  body text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.audit_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.branches (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  name text not null,
  address text,
  city text,
  state text,
  is_head_office boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.brands (
  id uuid default gen_random_uuid() not null,
  name text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.campaign_events (
  id uuid default gen_random_uuid() not null,
  campaign_id uuid not null,
  actor_id uuid,
  event_type text not null,
  payload jsonb,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.campaign_products (
  id uuid default gen_random_uuid() not null,
  campaign_id uuid not null,
  product_id uuid not null,
  display_name text not null,
  client_description text,
  client_image_url text,
  selling_price numeric(12,2) not null,
  discount_percent numeric(5,2) default 0 not null,
  quantity_limit integer,
  moq integer,
  personalization_options text,
  variant_availability text,
  estimated_delivery text,
  client_specs text,
  display_order integer default 0 not null,
  visibility offering_visibility default 'draft'::offering_visibility not null,
  published_at timestamp with time zone,
  published_by uuid,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.campaigns (
  id uuid default gen_random_uuid() not null,
  name text not null,
  company_id uuid not null,
  requirement_id uuid,
  owner_id uuid,
  occasion text,
  description text,
  employee_quantity integer default 1 not null,
  budget_per_employee numeric(12,2) default 0 not null,
  total_budget numeric(14,2) default 0 not null,
  required_delivery_date date,
  delivery_locations text,
  preferred_categories text,
  branding_requirements text,
  packaging_requirements text,
  custom_requirements text,
  status campaign_status default 'planning'::campaign_status not null,
  published_to_client_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.categories (
  id uuid default gen_random_uuid() not null,
  name text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.client_comments (
  id uuid default gen_random_uuid() not null,
  campaign_id uuid not null,
  campaign_product_id uuid,
  quotation_id uuid,
  company_id uuid not null,
  user_id uuid not null,
  body text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.client_product_selections (
  id uuid default gen_random_uuid() not null,
  campaign_id uuid not null,
  campaign_product_id uuid not null,
  company_id uuid not null,
  user_id uuid not null,
  kind selection_kind default 'shortlisted'::selection_kind not null,
  quantity integer,
  preference_rank integer,
  comment text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.companies (
  id uuid default gen_random_uuid() not null,
  name text not null,
  industry text,
  website text,
  address text,
  city text,
  state text,
  country text default 'India'::text not null,
  owner_id uuid,
  status company_status default 'prospect'::company_status not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  logo_path text,
  gst_number text,
  company_type text
);

create table if not exists public.company_product_access (
  company_id uuid not null,
  product_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.contacts (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  branch_id uuid,
  full_name text not null,
  designation text,
  email text,
  phone text,
  contact_type contact_type default 'primary'::contact_type not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  linkedin text,
  kind text default 'corporate'::text not null,
  department_name text
);

create table if not exists public.courier_partners (
  id uuid default gen_random_uuid() not null,
  name text not null,
  contact_person text,
  phone text,
  email text,
  service_type text,
  notes text,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  city text,
  tracking_supported boolean default true not null
);

create table if not exists public.department_members (
  department_id uuid not null,
  user_id uuid not null
);

create table if not exists public.departments (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  name text not null,
  manager_id uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.goals (
  id uuid default gen_random_uuid() not null,
  title text not null,
  period_type text not null,
  period_start date not null,
  metric text not null,
  target numeric(14,2) not null,
  owner_id uuid,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.invoices (
  id uuid default gen_random_uuid() not null,
  invoice_number text not null,
  order_id uuid not null,
  company_id uuid not null,
  invoice_date date default CURRENT_DATE not null,
  due_date date not null,
  amount numeric(14,2) not null,
  status invoice_status default 'unpaid'::invoice_status not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.lead_stage_history (
  id uuid default gen_random_uuid() not null,
  lead_id uuid not null,
  from_stage lead_stage,
  to_stage lead_stage not null,
  changed_by uuid,
  changed_at timestamp with time zone default now() not null,
  note text
);

create table if not exists public.leads (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  contact_id uuid,
  owner_id uuid,
  source lead_source default 'inbound'::lead_source not null,
  stage lead_stage default 'cold'::lead_stage not null,
  estimated_value numeric(14,2) default 0 not null,
  expected_conversion_date date,
  notes text,
  last_activity_at timestamp with time zone,
  next_follow_up_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.mockups (
  id uuid default gen_random_uuid() not null,
  requirement_id uuid,
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes integer not null,
  status mockup_status default 'draft'::mockup_status not null,
  uploaded_by uuid,
  created_at timestamp with time zone default now() not null,
  order_id uuid,
  product_id uuid
);

create table if not exists public.notifications (
  id uuid default gen_random_uuid() not null,
  audience notification_audience not null,
  company_id uuid,
  user_id uuid,
  title text not null,
  body text,
  link text,
  read_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.order_assignments (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  department_id uuid,
  assigned_to uuid,
  assigned_by uuid,
  note text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.order_items (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  product_id uuid not null,
  description text,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  line_total numeric(14,2) default 0 not null
);

create table if not exists public.order_status_history (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  from_status order_status,
  to_status order_status not null,
  changed_by uuid,
  changed_at timestamp with time zone default now() not null,
  note text
);

create table if not exists public.orders (
  id uuid default gen_random_uuid() not null,
  order_number text not null,
  company_id uuid not null,
  contact_id uuid,
  quotation_id uuid,
  owner_id uuid,
  operations_user_id uuid,
  supplier_id uuid,
  printing_vendor_id uuid,
  courier_partner_id uuid,
  order_value numeric(14,2) default 0 not null,
  po_number text,
  expected_delivery_date date,
  actual_delivery_date date,
  status order_status default 'created'::order_status not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  assigned_to uuid,
  current_department_id uuid,
  stage_due_at date,
  next_action text,
  priority integer default 3 not null,
  requirement_id uuid,
  tracking_number text,
  dispatch_date date,
  product_cost numeric(14,2) default 0 not null,
  printing_cost numeric(14,2) default 0 not null,
  courier_cost numeric(14,2) default 0 not null,
  other_cost numeric(14,2) default 0 not null,
  total_cost numeric(14,2) default 0 not null,
  gross_profit numeric(14,2) default 0 not null,
  campaign_id uuid
);

create table if not exists public.org_settings (
  id integer default 1 not null,
  organisation_name text default 'Robust Gifting'::text not null,
  default_tax_percent numeric(5,2) default 18 not null,
  currency text default 'INR'::text not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.payables (
  id uuid default gen_random_uuid() not null,
  vendor_type text not null,
  vendor_name text not null,
  order_id uuid,
  amount numeric(14,2) not null,
  amount_paid numeric(14,2) default 0 not null,
  due_date date,
  status text default 'unpaid'::text not null,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.payments (
  id uuid default gen_random_uuid() not null,
  invoice_id uuid not null,
  payment_date date default CURRENT_DATE not null,
  amount numeric(14,2) not null,
  method payment_method default 'bank_transfer'::payment_method not null,
  reference text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.printing_vendors (
  id uuid default gen_random_uuid() not null,
  name text not null,
  contact_person text,
  phone text,
  email text,
  service_type text,
  notes text,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  city text
);

create table if not exists public.product_variants (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  colour text,
  size text,
  gender text,
  material text,
  sku text,
  extra_price numeric(12,2) default 0 not null,
  created_at timestamp with time zone default now() not null,
  display_name text,
  status text default 'active'::text not null,
  sort_order integer default 0 not null
);

-- One product can have many photos, optionally scoped to a single colour
-- variant (variant_id null = shown regardless of colour).
create table if not exists public.product_images (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  variant_id uuid,
  image_url text not null,
  storage_path text,
  sort_order integer default 0 not null,
  is_primary boolean default false not null,
  alt_text text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.products (
  id uuid default gen_random_uuid() not null,
  name text not null,
  brand_id uuid,
  category_id uuid,
  subcategory_id uuid,
  description text,
  price numeric(12,2) not null,
  moq integer default 1 not null,
  hsn_code text,
  supplier_id uuid,
  image_url text,
  status product_status default 'active'::product_status not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  supplier_cost numeric(12,2),
  internal_margin numeric(12,2),
  internal_notes text,
  visibility text default 'internal_only'::text not null,
  sku text not null,
  catalogue_access text default 'all'::text not null
);

create table if not exists public.profiles (
  id uuid not null,
  full_name text not null,
  email text not null,
  role app_role default 'sales'::app_role not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  company_id uuid,
  department_id uuid,
  must_change_password boolean default false not null
);

create table if not exists public.quotation_history (
  id uuid default gen_random_uuid() not null,
  quotation_id uuid not null,
  from_status quotation_status,
  to_status quotation_status not null,
  changed_by uuid,
  changed_at timestamp with time zone default now() not null,
  note text
);

create table if not exists public.quotation_items (
  id uuid default gen_random_uuid() not null,
  quotation_id uuid not null,
  product_id uuid not null,
  description text,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  discount_percent numeric(5,2) default 0 not null,
  tax_percent numeric(5,2) default 18 not null,
  line_total numeric(14,2) default 0 not null
);

create table if not exists public.quotations (
  id uuid default gen_random_uuid() not null,
  quotation_number text not null,
  requirement_id uuid,
  company_id uuid not null,
  contact_id uuid,
  owner_id uuid,
  discount_percent numeric(5,2) default 0 not null,
  tax_percent numeric(5,2) default 18 not null,
  subtotal numeric(14,2) default 0 not null,
  discount_amount numeric(14,2) default 0 not null,
  tax_amount numeric(14,2) default 0 not null,
  total numeric(14,2) default 0 not null,
  valid_until date,
  status quotation_status default 'draft'::quotation_status not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  campaign_id uuid,
  client_comment text,
  responded_at timestamp with time zone,
  responded_by uuid
);

create table if not exists public.requirement_products (
  id uuid default gen_random_uuid() not null,
  requirement_id uuid not null,
  product_id uuid not null,
  quantity integer default 1 not null,
  notes text
);

create table if not exists public.requirements (
  id uuid default gen_random_uuid() not null,
  name text not null,
  company_id uuid not null,
  contact_id uuid,
  lead_id uuid,
  owner_id uuid,
  quantity integer default 1 not null,
  budget numeric(14,2),
  deadline date,
  delivery_city text,
  purpose text,
  payment_terms text,
  description text,
  revenue_opportunity numeric(14,2) default 0 not null,
  status requirement_status default 'draft'::requirement_status not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  branch_id uuid,
  department_name text
);

create table if not exists public.reviews (
  id uuid default gen_random_uuid() not null,
  company_id uuid,
  order_id uuid,
  contact_id uuid,
  rating integer,
  feedback text,
  status text default 'pending'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.sample_movements (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  quantity integer not null,
  from_holder text not null,
  to_holder text not null,
  company_id uuid,
  requirement_id uuid,
  cost numeric(12,2) default 0 not null,
  note text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.sample_stock (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  in_office integer default 0 not null,
  with_client integer default 0 not null,
  pending_supplier integer default 0 not null,
  unit_cost numeric(12,2) default 0 not null,
  with_team integer default 0 not null
);

create table if not exists public.subcategories (
  id uuid default gen_random_uuid() not null,
  category_id uuid not null,
  name text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.suppliers (
  id uuid default gen_random_uuid() not null,
  name text not null,
  contact_person text,
  email text,
  phone text,
  city text,
  category text,
  credit_period_days integer default 0 not null,
  notes text,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  credit_limit numeric(14,2) default 0 not null
);

create table if not exists public.tasks (
  id uuid default gen_random_uuid() not null,
  title text not null,
  description text,
  order_id uuid,
  department_id uuid,
  assigned_to uuid,
  created_by uuid,
  due_at date,
  completed_at timestamp with time zone,
  status text default 'open'::text not null,
  created_at timestamp with time zone default now() not null,
  priority integer default 3 not null,
  company_id uuid,
  requirement_id uuid
);

-- ---------------------------------------------------------------------------
-- Primary keys
-- ---------------------------------------------------------------------------
alter table public.activities add constraint activities_pkey PRIMARY KEY (id);
alter table public.announcements add constraint announcements_pkey PRIMARY KEY (id);
alter table public.audit_logs add constraint audit_logs_pkey PRIMARY KEY (id);
alter table public.branches add constraint branches_pkey PRIMARY KEY (id);
alter table public.brands add constraint brands_pkey PRIMARY KEY (id);
alter table public.campaign_events add constraint campaign_events_pkey PRIMARY KEY (id);
alter table public.campaign_products add constraint campaign_products_pkey PRIMARY KEY (id);
alter table public.campaigns add constraint campaigns_pkey PRIMARY KEY (id);
alter table public.categories add constraint categories_pkey PRIMARY KEY (id);
alter table public.client_comments add constraint client_comments_pkey PRIMARY KEY (id);
alter table public.client_product_selections add constraint client_product_selections_pkey PRIMARY KEY (id);
alter table public.companies add constraint companies_pkey PRIMARY KEY (id);
alter table public.company_product_access add constraint company_product_access_pkey PRIMARY KEY (company_id, product_id);
alter table public.contacts add constraint contacts_pkey PRIMARY KEY (id);
alter table public.courier_partners add constraint courier_partners_pkey PRIMARY KEY (id);
alter table public.department_members add constraint department_members_pkey PRIMARY KEY (department_id, user_id);
alter table public.departments add constraint departments_pkey PRIMARY KEY (id);
alter table public.goals add constraint goals_pkey PRIMARY KEY (id);
alter table public.invoices add constraint invoices_pkey PRIMARY KEY (id);
alter table public.lead_stage_history add constraint lead_stage_history_pkey PRIMARY KEY (id);
alter table public.leads add constraint leads_pkey PRIMARY KEY (id);
alter table public.mockups add constraint mockups_pkey PRIMARY KEY (id);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.order_assignments add constraint order_assignments_pkey PRIMARY KEY (id);
alter table public.order_items add constraint order_items_pkey PRIMARY KEY (id);
alter table public.order_status_history add constraint order_status_history_pkey PRIMARY KEY (id);
alter table public.orders add constraint orders_pkey PRIMARY KEY (id);
alter table public.org_settings add constraint org_settings_pkey PRIMARY KEY (id);
alter table public.payables add constraint payables_pkey PRIMARY KEY (id);
alter table public.payments add constraint payments_pkey PRIMARY KEY (id);
alter table public.printing_vendors add constraint printing_vendors_pkey PRIMARY KEY (id);
alter table public.product_images add constraint product_images_pkey PRIMARY KEY (id);
alter table public.product_variants add constraint product_variants_pkey PRIMARY KEY (id);
alter table public.products add constraint products_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.quotation_history add constraint quotation_history_pkey PRIMARY KEY (id);
alter table public.quotation_items add constraint quotation_items_pkey PRIMARY KEY (id);
alter table public.quotations add constraint quotations_pkey PRIMARY KEY (id);
alter table public.requirement_products add constraint requirement_products_pkey PRIMARY KEY (id);
alter table public.requirements add constraint requirements_pkey PRIMARY KEY (id);
alter table public.reviews add constraint reviews_pkey PRIMARY KEY (id);
alter table public.sample_movements add constraint sample_movements_pkey PRIMARY KEY (id);
alter table public.sample_stock add constraint sample_stock_pkey PRIMARY KEY (id);
alter table public.subcategories add constraint subcategories_pkey PRIMARY KEY (id);
alter table public.suppliers add constraint suppliers_pkey PRIMARY KEY (id);
alter table public.tasks add constraint tasks_pkey PRIMARY KEY (id);

-- ---------------------------------------------------------------------------
-- Unique constraints
-- ---------------------------------------------------------------------------
alter table public.brands add constraint brands_name_key UNIQUE (name);
alter table public.campaign_products add constraint campaign_products_campaign_id_product_id_key UNIQUE (campaign_id, product_id);
alter table public.categories add constraint categories_name_key UNIQUE (name);
alter table public.client_product_selections add constraint client_product_selections_campaign_product_id_user_id_key UNIQUE (campaign_product_id, user_id);
alter table public.departments add constraint departments_slug_key UNIQUE (slug);
alter table public.invoices add constraint invoices_invoice_number_key UNIQUE (invoice_number);
alter table public.invoices add constraint invoices_order_id_key UNIQUE (order_id);
alter table public.mockups add constraint mockups_storage_path_key UNIQUE (storage_path);
alter table public.orders add constraint orders_order_number_key UNIQUE (order_number);
alter table public.orders add constraint orders_quotation_id_key UNIQUE (quotation_id);
alter table public.product_variants add constraint product_variants_sku_key UNIQUE (sku);
alter table public.profiles add constraint profiles_email_key UNIQUE (email);
alter table public.quotations add constraint quotations_quotation_number_key UNIQUE (quotation_number);
alter table public.requirement_products add constraint requirement_products_requirement_id_product_id_key UNIQUE (requirement_id, product_id);
alter table public.sample_stock add constraint sample_stock_product_id_key UNIQUE (product_id);
alter table public.subcategories add constraint subcategories_category_id_name_key UNIQUE (category_id, name);

-- ---------------------------------------------------------------------------
-- Check constraints
-- ---------------------------------------------------------------------------
alter table public.campaign_products add constraint campaign_products_discount_percent_check CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric)));
alter table public.campaign_products add constraint campaign_products_selling_price_check CHECK ((selling_price >= (0)::numeric));
alter table public.campaigns add constraint campaigns_budget_per_employee_check CHECK ((budget_per_employee >= (0)::numeric));
alter table public.campaigns add constraint campaigns_employee_quantity_check CHECK ((employee_quantity >= 1));
alter table public.campaigns add constraint campaigns_total_budget_check CHECK ((total_budget >= (0)::numeric));
alter table public.client_product_selections add constraint client_product_selections_quantity_check CHECK (((quantity IS NULL) OR (quantity >= 1)));
alter table public.contacts add constraint contacts_kind_check CHECK ((kind = ANY (ARRAY['corporate'::text, 'direct'::text])));
alter table public.goals add constraint goals_metric_check CHECK ((metric = ANY (ARRAY['revenue'::text, 'order_value'::text, 'requirement_value'::text, 'conversion_pct'::text])));
alter table public.goals add constraint goals_period_type_check CHECK ((period_type = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'yearly'::text])));
alter table public.goals add constraint goals_target_check CHECK ((target >= (0)::numeric));
alter table public.invoices add constraint invoices_amount_check CHECK ((amount > (0)::numeric));
alter table public.leads add constraint leads_estimated_value_check CHECK ((estimated_value >= (0)::numeric));
alter table public.mockups add constraint mockups_file_size_bytes_check CHECK (((file_size_bytes > 0) AND (file_size_bytes <= 10485760)));
alter table public.order_items add constraint order_items_quantity_check CHECK ((quantity >= 1));
alter table public.order_items add constraint order_items_unit_price_check CHECK ((unit_price >= (0)::numeric));
alter table public.org_settings add constraint org_settings_id_check CHECK ((id = 1));
alter table public.payables add constraint payables_amount_check CHECK ((amount > (0)::numeric));
alter table public.payables add constraint payables_amount_paid_check CHECK ((amount_paid >= (0)::numeric));
alter table public.payables add constraint payables_status_check CHECK ((status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text])));
alter table public.payables add constraint payables_vendor_type_check CHECK ((vendor_type = ANY (ARRAY['supplier'::text, 'printing'::text, 'courier'::text, 'sample'::text, 'other'::text])));
alter table public.payments add constraint payments_amount_check CHECK ((amount > (0)::numeric));
alter table public.products add constraint products_catalogue_access_check CHECK ((catalogue_access = ANY (ARRAY['all'::text, 'selected'::text, 'none'::text])));
alter table public.products add constraint products_moq_check CHECK ((moq >= 1));
alter table public.products add constraint products_price_check CHECK ((price >= (0)::numeric));
alter table public.products add constraint products_supplier_cost_check CHECK (((supplier_cost IS NULL) OR (supplier_cost >= (0)::numeric)));
alter table public.quotation_items add constraint quotation_items_quantity_check CHECK ((quantity >= 1));
alter table public.quotation_items add constraint quotation_items_unit_price_check CHECK ((unit_price >= (0)::numeric));
alter table public.quotations add constraint quotations_discount_percent_check CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric)));
alter table public.quotations add constraint quotations_tax_percent_check CHECK ((tax_percent >= (0)::numeric));
alter table public.requirement_products add constraint requirement_products_quantity_check CHECK ((quantity >= 1));
alter table public.requirements add constraint requirements_budget_check CHECK (((budget IS NULL) OR (budget >= (0)::numeric)));
alter table public.requirements add constraint requirements_quantity_check CHECK ((quantity >= 1));
alter table public.reviews add constraint reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
alter table public.sample_movements add constraint sample_movements_from_holder_check CHECK ((from_holder = ANY (ARRAY['supplier'::text, 'office'::text, 'client'::text])));
alter table public.sample_movements add constraint sample_movements_quantity_check CHECK ((quantity > 0));
alter table public.sample_movements add constraint sample_movements_to_holder_check CHECK ((to_holder = ANY (ARRAY['supplier'::text, 'office'::text, 'client'::text])));
alter table public.sample_stock add constraint sample_stock_in_office_check CHECK ((in_office >= 0));
alter table public.sample_stock add constraint sample_stock_pending_supplier_check CHECK ((pending_supplier >= 0));
alter table public.sample_stock add constraint sample_stock_with_client_check CHECK ((with_client >= 0));
alter table public.suppliers add constraint suppliers_credit_period_days_check CHECK ((credit_period_days >= 0));
alter table public.tasks add constraint tasks_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'done'::text, 'cancelled'::text])));

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------
alter table public.activities add constraint activities_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id);
alter table public.activities add constraint activities_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.announcements add constraint announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.audit_logs add constraint audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.branches add constraint branches_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.campaign_events add constraint campaign_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id);
alter table public.campaign_events add constraint campaign_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
alter table public.campaign_products add constraint campaign_products_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
alter table public.campaign_products add constraint campaign_products_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.campaign_products add constraint campaign_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
alter table public.campaign_products add constraint campaign_products_published_by_fkey FOREIGN KEY (published_by) REFERENCES profiles(id);
alter table public.campaigns add constraint campaigns_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.campaigns add constraint campaigns_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id);
alter table public.campaigns add constraint campaigns_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE SET NULL;
alter table public.client_comments add constraint client_comments_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
alter table public.client_comments add constraint client_comments_campaign_product_id_fkey FOREIGN KEY (campaign_product_id) REFERENCES campaign_products(id) ON DELETE CASCADE;
alter table public.client_comments add constraint client_comments_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.client_comments add constraint client_comments_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE;
alter table public.client_comments add constraint client_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.client_product_selections add constraint client_product_selections_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
alter table public.client_product_selections add constraint client_product_selections_campaign_product_id_fkey FOREIGN KEY (campaign_product_id) REFERENCES campaign_products(id) ON DELETE CASCADE;
alter table public.client_product_selections add constraint client_product_selections_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.client_product_selections add constraint client_product_selections_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.companies add constraint companies_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id);
alter table public.company_product_access add constraint company_product_access_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.company_product_access add constraint company_product_access_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.contacts add constraint contacts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
alter table public.contacts add constraint contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.department_members add constraint department_members_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
alter table public.department_members add constraint department_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.departments add constraint departments_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.goals add constraint goals_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.goals add constraint goals_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.invoices add constraint invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.invoices add constraint invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
alter table public.lead_stage_history add constraint lead_stage_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id);
alter table public.lead_stage_history add constraint lead_stage_history_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
alter table public.leads add constraint leads_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.leads add constraint leads_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);
alter table public.leads add constraint leads_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id);
alter table public.mockups add constraint mockups_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public.mockups add constraint mockups_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public.mockups add constraint mockups_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE;
alter table public.mockups add constraint mockups_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES profiles(id);
alter table public.notifications add constraint notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.order_assignments add constraint order_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.order_assignments add constraint order_assignments_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.order_assignments add constraint order_assignments_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
alter table public.order_assignments add constraint order_assignments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.order_items add constraint order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.order_items add constraint order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
alter table public.order_status_history add constraint order_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id);
alter table public.order_status_history add constraint order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.orders add constraint orders_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.orders add constraint orders_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id);
alter table public.orders add constraint orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.orders add constraint orders_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);
alter table public.orders add constraint orders_courier_partner_id_fkey FOREIGN KEY (courier_partner_id) REFERENCES courier_partners(id);
alter table public.orders add constraint orders_current_department_id_fkey FOREIGN KEY (current_department_id) REFERENCES departments(id) ON DELETE SET NULL;
alter table public.orders add constraint orders_operations_user_id_fkey FOREIGN KEY (operations_user_id) REFERENCES profiles(id);
alter table public.orders add constraint orders_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id);
alter table public.orders add constraint orders_printing_vendor_id_fkey FOREIGN KEY (printing_vendor_id) REFERENCES printing_vendors(id);
alter table public.orders add constraint orders_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES quotations(id);
alter table public.orders add constraint orders_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE SET NULL;
alter table public.orders add constraint orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
alter table public.payables add constraint payables_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.payables add constraint payables_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public.payments add constraint payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.payments add constraint payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
alter table public.product_images add constraint product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.product_images add constraint product_images_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;
alter table public.product_variants add constraint product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.products add constraint products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id);
alter table public.products add constraint products_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);
alter table public.products add constraint products_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES subcategories(id);
alter table public.products add constraint products_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
alter table public.profiles add constraint profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.quotation_history add constraint quotation_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id);
alter table public.quotation_history add constraint quotation_history_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE;
alter table public.quotation_items add constraint quotation_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
alter table public.quotation_items add constraint quotation_items_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE;
alter table public.quotations add constraint quotations_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
alter table public.quotations add constraint quotations_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.quotations add constraint quotations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);
alter table public.quotations add constraint quotations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id);
alter table public.quotations add constraint quotations_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES requirements(id);
alter table public.quotations add constraint quotations_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES profiles(id);
alter table public.requirement_products add constraint requirement_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
alter table public.requirement_products add constraint requirement_products_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE;
alter table public.requirements add constraint requirements_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
alter table public.requirements add constraint requirements_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.requirements add constraint requirements_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);
alter table public.requirements add constraint requirements_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id);
alter table public.requirements add constraint requirements_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id);
alter table public.reviews add constraint reviews_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.reviews add constraint reviews_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);
alter table public.reviews add constraint reviews_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
alter table public.sample_movements add constraint sample_movements_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.sample_movements add constraint sample_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.sample_movements add constraint sample_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
alter table public.sample_movements add constraint sample_movements_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES requirements(id);
alter table public.sample_stock add constraint sample_stock_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.subcategories add constraint subcategories_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
alter table public.tasks add constraint tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.tasks add constraint tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
alter table public.tasks add constraint tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.tasks add constraint tasks_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
alter table public.tasks add constraint tasks_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.tasks add constraint tasks_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS activities_due_idx ON public.activities USING btree (due_at);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs USING btree (entity, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON public.audit_logs USING btree (user_id);
CREATE INDEX IF NOT EXISTS branches_company_idx ON public.branches USING btree (company_id);
CREATE INDEX IF NOT EXISTS campaign_events_campaign_idx ON public.campaign_events USING btree (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_products_campaign_idx ON public.campaign_products USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS campaigns_company_idx ON public.campaigns USING btree (company_id);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON public.campaigns USING btree (status);
CREATE INDEX IF NOT EXISTS client_comments_campaign_idx ON public.client_comments USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS companies_name_idx ON public.companies USING btree (name);
CREATE INDEX IF NOT EXISTS companies_owner_idx ON public.companies USING btree (owner_id);
CREATE INDEX IF NOT EXISTS company_product_access_product_idx ON public.company_product_access USING btree (product_id);
CREATE INDEX IF NOT EXISTS contacts_company_idx ON public.contacts USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_cpa_company ON public.company_product_access USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_cpa_product ON public.company_product_access USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_order_assignments_order ON public.order_assignments USING btree (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON public.orders USING btree (assigned_to);
CREATE INDEX IF NOT EXISTS idx_orders_dept ON public.orders USING btree (current_department_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON public.tasks USING btree (assigned_to, status);
CREATE INDEX IF NOT EXISTS leads_owner_idx ON public.leads USING btree (owner_id);
CREATE INDEX IF NOT EXISTS leads_stage_idx ON public.leads USING btree (stage);
CREATE INDEX IF NOT EXISTS mockups_requirement_idx ON public.mockups USING btree (requirement_id);
CREATE INDEX IF NOT EXISTS notifications_audience_idx ON public.notifications USING btree (audience, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_company_idx ON public.notifications USING btree (company_id);
CREATE INDEX IF NOT EXISTS notifications_created_idx ON public.notifications USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS order_assignments_assigned_to_idx ON public.order_assignments USING btree (assigned_to);
CREATE INDEX IF NOT EXISTS orders_assigned_to_idx ON public.orders USING btree (assigned_to);
CREATE INDEX IF NOT EXISTS orders_campaign_idx ON public.orders USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS orders_company_idx ON public.orders USING btree (company_id);
CREATE INDEX IF NOT EXISTS orders_delivery_idx ON public.orders USING btree (expected_delivery_date);
CREATE INDEX IF NOT EXISTS orders_department_idx ON public.orders USING btree (current_department_id);
CREATE INDEX IF NOT EXISTS orders_owner_idx ON public.orders USING btree (owner_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders USING btree (status);
CREATE INDEX IF NOT EXISTS product_images_product_id_idx ON public.product_images USING btree (product_id);
CREATE INDEX IF NOT EXISTS product_images_variant_id_idx ON public.product_images USING btree (variant_id);
CREATE INDEX IF NOT EXISTS products_catalogue_browse_idx ON public.products USING btree (status, catalogue_access);
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products USING btree (category_id);
CREATE INDEX IF NOT EXISTS products_name_lower_idx ON public.products USING btree (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique ON public.products USING btree (sku);
CREATE INDEX IF NOT EXISTS products_status_idx ON public.products USING btree (status);
CREATE INDEX IF NOT EXISTS profiles_company_idx ON public.profiles USING btree (company_id);
CREATE INDEX IF NOT EXISTS quotations_owner_idx ON public.quotations USING btree (owner_id);
CREATE INDEX IF NOT EXISTS quotations_status_idx ON public.quotations USING btree (status);
CREATE INDEX IF NOT EXISTS requirements_owner_idx ON public.requirements USING btree (owner_id);
CREATE INDEX IF NOT EXISTS requirements_status_idx ON public.requirements USING btree (status);
CREATE INDEX IF NOT EXISTS selections_campaign_idx ON public.client_product_selections USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS tasks_assigned_due_idx ON public.tasks USING btree (assigned_to, due_at);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.has_any_role(roles app_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select role = any(roles) from public.profiles where id = auth.uid()), false);
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$function$;

CREATE OR REPLACE FUNCTION public.is_client()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select role in ('client_admin','client_user')
     from public.profiles where id = auth.uid() and is_active),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_internal()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select role in ('admin','sales','operations','accounts','management')
     from public.profiles where id = auth.uid() and is_active),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public."current_role"()
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from public.profiles where id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.can_client_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select role = 'client_admin' from public.profiles where id = auth.uid() and is_active),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_crm()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_any_role(array['admin','sales']::public.app_role[]);
$function$;

CREATE OR REPLACE FUNCTION public.can_finance()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_any_role(array['admin','accounts']::public.app_role[]);
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_team()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_admin();
$function$;

CREATE OR REPLACE FUNCTION public.can_management_read()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_any_role(array['admin','management']::public.app_role[]);
$function$;

CREATE OR REPLACE FUNCTION public.can_ops()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_any_role(array['admin','operations']::public.app_role[]);
$function$;

CREATE OR REPLACE FUNCTION public.can_orders_read()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_any_role(array['admin','sales','operations','accounts','management']::public.app_role[]);
$function$;

CREATE OR REPLACE FUNCTION public.can_orders_write()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_any_role(array['admin','operations']::public.app_role[]);
$function$;

CREATE OR REPLACE FUNCTION public.can_sales()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_any_role(array['admin','sales']::public.app_role[]);
$function$;

CREATE OR REPLACE FUNCTION public.client_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select company_id from public.profiles
  where id = auth.uid() and role in ('client_admin','client_user') and is_active;
$function$;

CREATE OR REPLACE FUNCTION public.lead_stage_rank(stage lead_stage)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case stage when 'cold' then 1 when 'warm' then 2 when 'hot' then 3 when 'client' then 4 when 'regular_client' then 5 end;
$function$;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
 RETURNS text
 LANGUAGE sql
AS $function$ select 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_seq')::text, 4, '0'); $function$;

CREATE OR REPLACE FUNCTION public.next_order_number()
 RETURNS text
 LANGUAGE sql
AS $function$ select 'SO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.order_seq')::text, 4, '0'); $function$;

CREATE OR REPLACE FUNCTION public.next_quotation_number()
 RETURNS text
 LANGUAGE sql
AS $function$ select 'Q-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.quotation_seq')::text, 4, '0'); $function$;

CREATE OR REPLACE FUNCTION public.notify_users(p_audience notification_audience, p_company_id uuid, p_title text, p_body text, p_link text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.notifications (audience, company_id, title, body, link)
  values (p_audience, p_company_id, p_title, p_body, p_link);
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_campaign_event(p_campaign_id uuid, p_event_type text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.campaign_events (campaign_id, actor_id, event_type, payload)
  values (p_campaign_id, auth.uid(), p_event_type, coalesce(p_payload, '{}'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, email, role, company_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'sales'),
    nullif(new.raw_user_meta_data->>'company_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.write_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_action text;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs(user_id, action, entity, entity_id, new_value) values (auth.uid(), 'create', tg_table_name, new.id, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    if to_jsonb(new) ? 'status' and (to_jsonb(new)->>'status') is distinct from (to_jsonb(old)->>'status') then v_action := 'status_change';
    elsif to_jsonb(new) ? 'owner_id' and (to_jsonb(new)->>'owner_id') is distinct from (to_jsonb(old)->>'owner_id') then v_action := 'assignment_change'; end if;
    insert into public.audit_logs(user_id, action, entity, entity_id, previous_value, new_value) values (auth.uid(), v_action, tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.audit_logs(user_id, action, entity, entity_id, previous_value) values (auth.uid(), 'delete', tg_table_name, old.id, to_jsonb(old));
    return old;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.write_catalogue_access_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.company_product_access;
  v_sku text;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  select sku into v_sku from public.products where id = v_row.product_id;
  insert into public.audit_logs (user_id, action, entity, entity_id, previous_value, new_value)
  values (auth.uid(),
    case when tg_op = 'INSERT' then 'catalogue_client_added' else 'catalogue_client_removed' end,
    'company_product_access', v_row.product_id,
    case when tg_op = 'DELETE' then jsonb_build_object('company_id', old.company_id, 'product_id', old.product_id, 'sku', v_sku) end,
    case when tg_op = 'INSERT' then jsonb_build_object('company_id', new.company_id, 'product_id', new.product_id, 'sku', v_sku) end);
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_lead_hot_downgrade()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  rank_old int;
  rank_new int;
BEGIN
  rank_old := CASE OLD.stage
    WHEN 'cold' THEN 0 WHEN 'warm' THEN 1 WHEN 'hot' THEN 2
    WHEN 'client' THEN 3 WHEN 'regular_client' THEN 4 ELSE 0 END;
  rank_new := CASE NEW.stage
    WHEN 'cold' THEN 0 WHEN 'warm' THEN 1 WHEN 'hot' THEN 2
    WHEN 'client' THEN 3 WHEN 'regular_client' THEN 4 ELSE 0 END;
  IF rank_old >= 2 AND rank_new < 2 THEN
    RAISE EXCEPTION 'Hot or converted leads cannot move back to cold/warm';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_lead_regression()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    if public.lead_stage_rank(old.stage) >= 3
       and public.lead_stage_rank(new.stage) < public.lead_stage_rank(old.stage)
       and not public.has_any_role(array['admin','management']::public.app_role[]) then
      raise exception 'Hot or client leads cannot move backward without admin or management permission';
    end if;
    insert into public.lead_stage_history (lead_id, from_stage, to_stage, changed_by)
    values (new.id, old.stage, new.stage, auth.uid());
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.protect_catalogue_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.catalogue_access IS DISTINCT FROM OLD.catalogue_access
    OR NEW.visibility IS DISTINCT FROM OLD.visibility
  ) THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admin can change product catalogue visibility';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.track_order_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by) values (new.id, old.status, new.status, auth.uid());
    if new.status = 'delivered' and new.actual_delivery_date is null then new.actual_delivery_date := current_date; end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_invoice_status(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_amount numeric(14,2); v_paid numeric(14,2); v_due date; v_status public.invoice_status;
begin
  select amount, due_date into v_amount, v_due from public.invoices where id = p_invoice_id;
  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = p_invoice_id;
  if v_paid >= v_amount then v_status := 'paid';
  elsif v_paid > 0 then v_status := 'partially_paid';
  elsif v_due < current_date then v_status := 'overdue';
  else v_status := 'unpaid'; end if;
  update public.invoices set status = v_status where id = p_invoice_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.payments_refresh_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin perform public.refresh_invoice_status(coalesce(new.invoice_id, old.invoice_id)); return coalesce(new, old); end;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_order_cost(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.orders SET
    total_cost = COALESCE(product_cost,0)+COALESCE(printing_cost,0)+COALESCE(courier_cost,0)+COALESCE(other_cost,0),
    gross_profit = COALESCE(order_value,0) - (COALESCE(product_cost,0)+COALESCE(printing_cost,0)+COALESCE(courier_cost,0)+COALESCE(other_cost,0))
  WHERE id = p_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_quotation_totals(p_quotation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_subtotal numeric(14,2); v_discount numeric(14,2); v_tax numeric(14,2); v_header public.quotations%rowtype;
begin
  select * into v_header from public.quotations where id = p_quotation_id;
  select coalesce(sum(quantity * unit_price), 0) into v_subtotal from public.quotation_items where quotation_id = p_quotation_id;
  v_discount := round(v_subtotal * v_header.discount_percent / 100, 2);
  v_tax := round((v_subtotal - v_discount) * v_header.tax_percent / 100, 2);
  update public.quotations set subtotal = v_subtotal, discount_amount = v_discount, tax_amount = v_tax, total = v_subtotal - v_discount + v_tax where id = p_quotation_id;
  update public.quotation_items set line_total = round(quantity * unit_price * (1 - discount_percent/100) * (1 + tax_percent/100), 2) where quotation_id = p_quotation_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.duplicate_quotation(p_quotation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE q public.quotations%ROWTYPE; v_id uuid; v_num text;
BEGIN
  IF NOT public.has_any_role(array['admin','sales']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  SELECT * INTO q FROM public.quotations WHERE id = p_quotation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found'; END IF;
  v_num := public.next_quotation_number();
  INSERT INTO public.quotations (
    quotation_number, requirement_id, campaign_id, company_id, contact_id, owner_id,
    discount_percent, tax_percent, valid_until, status, notes
  ) VALUES (
    v_num, q.requirement_id, q.campaign_id, q.company_id, q.contact_id, COALESCE(auth.uid(), q.owner_id),
    q.discount_percent, q.tax_percent, q.valid_until, 'draft', COALESCE(q.notes,'') || ' (revision)'
  ) RETURNING id INTO v_id;
  INSERT INTO public.quotation_items (quotation_id, product_id, description, quantity, unit_price)
  SELECT v_id, product_id, description, quantity, unit_price FROM public.quotation_items WHERE quotation_id = p_quotation_id;
  PERFORM public.recalc_quotation_totals(v_id);
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.client_mark_quotation_viewed(p_quotation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare q public.quotations%rowtype;
begin
  if not public.is_client() then return; end if;
  select * into q from public.quotations where id = p_quotation_id;
  if not found then return; end if;
  if q.company_id is distinct from public.client_company_id() then return; end if;
  if q.status = 'sent' then
    update public.quotations set status = 'viewed' where id = p_quotation_id;
    insert into public.quotation_history (quotation_id, from_status, to_status, changed_by)
    values (p_quotation_id, 'sent', 'viewed', auth.uid());
    perform public.notify_users('internal', q.company_id, 'Client viewed quotation', '', '/quotations/' || p_quotation_id);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.client_respond_quotation(p_quotation_id uuid, p_accept boolean, p_comment text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q public.quotations%rowtype;
  v_status public.quotation_status;
begin
  if not public.is_client() then raise exception 'Not permitted'; end if;
  select * into q from public.quotations where id = p_quotation_id;
  if not found then raise exception 'Quotation not found'; end if;
  if q.company_id is distinct from public.client_company_id() then raise exception 'Quotation not found'; end if;
  if q.status not in ('sent','viewed') then raise exception 'This quotation can no longer be answered'; end if;
  v_status := case when p_accept then 'accepted'::public.quotation_status else 'rejected'::public.quotation_status end;
  update public.quotations
    set status = v_status,
        client_comment = p_comment,
        responded_at = now(),
        responded_by = auth.uid()
    where id = p_quotation_id;
  insert into public.quotation_history (quotation_id, from_status, to_status, changed_by, note)
  values (p_quotation_id, q.status, v_status, auth.uid(), p_comment);
  if q.campaign_id is not null then
    update public.campaigns set status = case when p_accept then 'approved'::public.campaign_status else 'rejected'::public.campaign_status end
    where id = q.campaign_id;
    perform public.record_campaign_event(q.campaign_id, case when p_accept then 'quotation_accepted' else 'quotation_rejected' end, jsonb_build_object('quotation_id', p_quotation_id));
  end if;
  perform public.notify_users('internal', q.company_id, case when p_accept then 'Quotation accepted' else 'Quotation rejected' end, coalesce(p_comment, ''), '/quotations/' || p_quotation_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.client_set_campaign_status(p_campaign_id uuid, p_status campaign_status)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.campaigns%rowtype;
begin
  if not public.is_client() then raise exception 'Not permitted'; end if;
  select * into c from public.campaigns where id = p_campaign_id;
  if not found or c.company_id is distinct from public.client_company_id() then
    raise exception 'Campaign not found';
  end if;
  if c.published_to_client_at is null then raise exception 'Campaign not found'; end if;
  if p_status not in ('client_viewed','client_shortlisted','client_selected') then
    raise exception 'Invalid status';
  end if;
  update public.campaigns set status = p_status where id = p_campaign_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.convert_quotation_to_order(p_quotation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q public.quotations%rowtype;
  v_order_id uuid;
  v_ops uuid;
  v_cost numeric := 0;
  v_item_count integer := 0;
begin
  if not public.has_any_role(array['admin','sales','operations']::public.app_role[]) then
    raise exception 'Not permitted to convert quotations';
  end if;
  select * into q from public.quotations where id = p_quotation_id;
  if not found then raise exception 'Quotation not found'; end if;
  if q.status <> 'accepted' then raise exception 'Only accepted quotations can become orders'; end if;
  if exists (select 1 from public.orders where quotation_id = q.id) then
    select id into v_order_id from public.orders where quotation_id = q.id;
    return v_order_id;
  end if;

  select count(*) into v_item_count
  from public.quotation_items qi
  join public.products p on p.id = qi.product_id
  where qi.quotation_id = q.id
    and p.status = 'active'
    and coalesce(p.catalogue_access, 'all') <> 'none';
  if v_item_count = 0 then
    raise exception 'Quotation has no active catalogue products to convert';
  end if;

  select id into v_ops from public.departments where slug = 'operations';
  select coalesce(sum(coalesce(p.supplier_cost, p.price * 0.62) * qi.quantity), 0) into v_cost
  from public.quotation_items qi
  join public.products p on p.id = qi.product_id
  where qi.quotation_id = q.id
    and p.status = 'active'
    and coalesce(p.catalogue_access, 'all') <> 'none';

  insert into public.orders (
    order_number, company_id, contact_id, quotation_id, requirement_id, owner_id,
    order_value, expected_delivery_date, status, current_department_id, next_action,
    product_cost, total_cost, gross_profit, campaign_id
  ) values (
    public.next_order_number(), q.company_id, q.contact_id, q.id, q.requirement_id, q.owner_id,
    q.total, current_date + 21, 'created', v_ops, 'Confirm PO and assign operations',
    v_cost, v_cost, q.total - v_cost, q.campaign_id
  ) returning id into v_order_id;

  insert into public.order_items (order_id, product_id, description, quantity, unit_price, line_total)
  select v_order_id, qi.product_id, coalesce(qi.description, p.name), qi.quantity, qi.unit_price, round(qi.quantity * qi.unit_price, 2)
  from public.quotation_items qi
  join public.products p on p.id = qi.product_id
  where qi.quotation_id = q.id
    and p.status = 'active'
    and coalesce(p.catalogue_access, 'all') <> 'none';

  insert into public.order_assignments (order_id, department_id, assigned_by, note)
  values (v_order_id, v_ops, auth.uid(), 'Order received from accepted quotation');
  insert into public.tasks (title, order_id, department_id, created_by, due_at, description)
  values ('Confirm order and assign operations', v_order_id, v_ops, auth.uid(), current_date + 1, 'New order from quotation');

  if q.requirement_id is not null then
    update public.requirements set status = 'won' where id = q.requirement_id;
  end if;
  if q.campaign_id is not null then
    update public.campaigns set status = 'order_ready' where id = q.campaign_id;
    perform public.record_campaign_event(q.campaign_id, 'order_created', jsonb_build_object('order_id', v_order_id));
  end if;
  perform public.notify_users('internal', q.company_id, 'New order from accepted quotation', '', '/orders/' || v_order_id::text);
  perform public.notify_users('client', q.company_id, 'Your order is confirmed', 'We have started fulfilment.', '/portal/orders');
  return v_order_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assign_order(p_order_id uuid, p_assigned_to uuid, p_department_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_role public.app_role; v_company uuid; v_ord text;
BEGIN
  v_role := public.current_role();
  IF v_role NOT IN ('admin','operations','management') THEN
    RAISE EXCEPTION 'Not allowed to assign orders';
  END IF;
  SELECT company_id, order_number INTO v_company, v_ord FROM public.orders WHERE id = p_order_id;
  UPDATE public.orders SET assigned_to = p_assigned_to, current_department_id = p_department_id, operations_user_id = COALESCE(p_assigned_to, operations_user_id), updated_at = now() WHERE id = p_order_id;
  INSERT INTO public.order_assignments (order_id, department_id, assigned_to, assigned_by, note)
  VALUES (p_order_id, p_department_id, p_assigned_to, auth.uid(), p_note);
  PERFORM public.notify_users('internal', v_company, 'Order ' || coalesce(v_ord,'') || ' was reassigned', coalesce(p_note,''), '/orders/' || p_order_id::text);
END;
$function$;

CREATE OR REPLACE FUNCTION public.advance_order_stage(p_order_id uuid, p_status order_status DEFAULT NULL::order_status, p_assigned_to uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_comment text DEFAULT NULL::text, p_stage_due date DEFAULT NULL::date, p_next_action text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role public.app_role;
  v_old public.order_status;
  v_company uuid;
  v_ord text;
  v_client_label text;
  v_new public.order_status;
  v_dept uuid;
BEGIN
  v_role := public.current_role();
  IF v_role IS NULL OR v_role IN ('client_admin','client_user','sales','management') THEN
    RAISE EXCEPTION 'Not permitted to change order stages';
  END IF;
  IF v_role = 'accounts' AND coalesce(p_status, 'delivered') NOT IN ('delivered') THEN
    RAISE EXCEPTION 'Accounts cannot change this operational stage';
  END IF;
  IF v_role NOT IN ('admin','operations','accounts') THEN
    RAISE EXCEPTION 'Not permitted to change order stages';
  END IF;

  SELECT status, company_id, order_number, current_department_id
    INTO v_old, v_company, v_ord, v_dept
  FROM public.orders WHERE id = p_order_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;

  v_new := coalesce(p_status, v_old);
  v_dept := coalesce(p_department_id, v_dept);

  UPDATE public.orders SET
    status = v_new,
    assigned_to = COALESCE(p_assigned_to, assigned_to),
    current_department_id = COALESCE(p_department_id, current_department_id),
    operations_user_id = COALESCE(p_assigned_to, operations_user_id),
    stage_due_at = COALESCE(p_stage_due, stage_due_at),
    next_action = COALESCE(p_next_action, next_action),
    actual_delivery_date = CASE WHEN v_new = 'delivered' THEN COALESCE(actual_delivery_date, CURRENT_DATE) ELSE actual_delivery_date END,
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, note, changed_at)
  VALUES (p_order_id, v_old, v_new, auth.uid(), p_comment, now());

  IF p_department_id IS NOT NULL OR p_assigned_to IS NOT NULL THEN
    INSERT INTO public.order_assignments (order_id, department_id, assigned_to, assigned_by, note)
    VALUES (p_order_id, p_department_id, p_assigned_to, auth.uid(), COALESCE(p_comment, 'Stage changed to ' || v_new::text));
  END IF;

  IF v_new IS DISTINCT FROM v_old THEN
    IF v_new = 'procurement' THEN
      INSERT INTO public.tasks (title, order_id, department_id, assigned_to, created_by, due_at, description, status, priority)
      VALUES ('Confirm supplier availability', p_order_id, v_dept, p_assigned_to, auth.uid(), COALESCE(p_stage_due, CURRENT_DATE + 2), p_comment, 'open', 2);
    ELSIF v_new = 'printing' THEN
      INSERT INTO public.tasks (title, order_id, department_id, assigned_to, created_by, due_at, description, status, priority)
      VALUES ('Complete logo printing / customization', p_order_id, v_dept, p_assigned_to, auth.uid(), COALESCE(p_stage_due, CURRENT_DATE + 3), p_comment, 'open', 2);
    ELSIF v_new = 'quality_check' THEN
      INSERT INTO public.tasks (title, order_id, department_id, assigned_to, created_by, due_at, description, status, priority)
      VALUES ('Quality check finished goods', p_order_id, v_dept, p_assigned_to, auth.uid(), COALESCE(p_stage_due, CURRENT_DATE + 1), p_comment, 'open', 1);
    ELSIF v_new IN ('ready_to_dispatch','dispatched') THEN
      INSERT INTO public.tasks (title, order_id, department_id, assigned_to, created_by, due_at, description, status, priority)
      VALUES ('Book courier and upload tracking', p_order_id, v_dept, p_assigned_to, auth.uid(), COALESCE(p_stage_due, CURRENT_DATE + 1), p_comment, 'open', 2);
    ELSIF v_new = 'delivered' THEN
      INSERT INTO public.tasks (title, order_id, department_id, assigned_to, created_by, due_at, description, status, priority)
      VALUES ('Generate invoice', p_order_id, (SELECT id FROM departments WHERE slug='accounts' LIMIT 1), (SELECT manager_id FROM departments WHERE slug='accounts' LIMIT 1), auth.uid(), CURRENT_DATE + 1, p_comment, 'open', 1);
    END IF;
  END IF;

  PERFORM public.notify_users('internal', v_company, 'Order ' || v_ord || ' moved to ' || replace(v_new::text, '_', ' '), coalesce(p_comment,''), '/crm/orders/' || p_order_id::text);

  v_client_label := CASE v_new
      WHEN 'created' THEN 'received'
      WHEN 'confirmed' THEN 'confirmed'
      WHEN 'procurement' THEN 'in procurement'
      WHEN 'printing' THEN 'printing in progress'
      WHEN 'quality_check' THEN 'in quality check'
      WHEN 'ready_to_dispatch' THEN 'ready to dispatch'
      WHEN 'dispatched' THEN 'dispatched'
      WHEN 'delivered' THEN 'delivered'
      WHEN 'in_progress' THEN 'in production'
      ELSE replace(v_new::text, '_', ' ')
    END;
  PERFORM public.notify_users('client', v_company, 'Your order ' || v_ord || ' is now ' || v_client_label, '', '/portal/orders/' || p_order_id::text);
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_sample(p_product_id uuid, p_quantity integer, p_from text, p_to text, p_company_id uuid DEFAULT NULL::uuid, p_requirement_id uuid DEFAULT NULL::uuid, p_cost numeric DEFAULT 0, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.sample_stock%ROWTYPE;
BEGIN
  IF NOT public.has_any_role(array['admin','sales','operations']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  INSERT INTO public.sample_stock (product_id) VALUES (p_product_id)
  ON CONFLICT (product_id) DO NOTHING;
  SELECT * INTO v_row FROM public.sample_stock WHERE product_id = p_product_id FOR UPDATE;
  IF p_from = 'office' AND v_row.in_office < p_quantity THEN RAISE EXCEPTION 'Not enough samples in office'; END IF;
  IF p_from = 'client' AND v_row.with_client < p_quantity THEN RAISE EXCEPTION 'Not enough samples with client'; END IF;
  IF p_from = 'supplier' AND v_row.pending_supplier < p_quantity THEN RAISE EXCEPTION 'Not enough samples pending supplier'; END IF;
  UPDATE public.sample_stock SET
    in_office = in_office + CASE WHEN p_to='office' THEN p_quantity ELSE 0 END - CASE WHEN p_from='office' THEN p_quantity ELSE 0 END,
    with_client = with_client + CASE WHEN p_to='client' THEN p_quantity ELSE 0 END - CASE WHEN p_from='client' THEN p_quantity ELSE 0 END,
    pending_supplier = pending_supplier + CASE WHEN p_to='supplier' THEN p_quantity ELSE 0 END - CASE WHEN p_from='supplier' THEN p_quantity ELSE 0 END
  WHERE product_id = p_product_id;
  INSERT INTO public.sample_movements (product_id, quantity, from_holder, to_holder, company_id, requirement_id, cost, note, created_by)
  VALUES (p_product_id, p_quantity, p_from, p_to, p_company_id, p_requirement_id, COALESCE(p_cost,0), p_note, auth.uid());
END;
$function$;

CREATE OR REPLACE FUNCTION public.provision_client_user(p_email text, p_full_name text, p_password text, p_company_id uuid, p_role app_role DEFAULT 'client_admin'::app_role)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
declare
  v_id uuid := gen_random_uuid();
begin
  if not public.has_any_role(array['admin','sales']::public.app_role[]) then
    raise exception 'Not permitted to create client users';
  end if;
  if p_role not in ('client_admin','client_user') then
    raise exception 'Role must be client_admin or client_user';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Company not found';
  end if;
  if exists (select 1 from auth.users where email = lower(p_email)) then
    raise exception 'A user with that email already exists';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_id,
    'authenticated',
    'authenticated',
    lower(p_email),
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'role', p_role::text, 'company_id', p_company_id::text),
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
  ) values (
    gen_random_uuid(),
    v_id,
    jsonb_build_object('sub', v_id::text, 'email', lower(p_email)),
    'email',
    now(), now(), now(),
    v_id::text
  );

  update public.profiles
    set company_id = p_company_id, role = p_role, full_name = p_full_name
    where id = v_id;

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER activities_updated_at BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_campaign_products AFTER INSERT OR DELETE OR UPDATE ON public.campaign_products FOR EACH ROW EXECUTE FUNCTION write_audit();
CREATE TRIGGER campaign_products_updated_at BEFORE UPDATE ON public.campaign_products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_campaigns AFTER INSERT OR DELETE OR UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION write_audit();
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER selections_updated_at BEFORE UPDATE ON public.client_product_selections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_companies AFTER INSERT OR DELETE OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION write_audit();
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_company_product_access AFTER INSERT OR DELETE ON public.company_product_access FOR EACH ROW EXECUTE FUNCTION write_catalogue_access_audit();
CREATE TRIGGER audit_contacts AFTER INSERT OR DELETE OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION write_audit();
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER courier_partners_updated_at BEFORE UPDATE ON public.courier_partners FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_invoices AFTER INSERT OR DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION write_audit();
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_leads AFTER INSERT OR DELETE OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION write_audit();
CREATE TRIGGER leads_stage_guard BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION prevent_lead_regression();
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_prevent_lead_hot_downgrade BEFORE UPDATE OF stage ON public.leads FOR EACH ROW EXECUTE FUNCTION prevent_lead_hot_downgrade();
CREATE TRIGGER audit_mockups AFTER INSERT OR DELETE OR UPDATE ON public.mockups FOR EACH ROW EXECUTE FUNCTION write_audit();
CREATE TRIGGER audit_orders AFTER INSERT OR DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION write_audit();
CREATE TRIGGER orders_status_history BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION track_order_status();
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_payments AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION write_audit();
CREATE TRIGGER payments_after_change AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION payments_refresh_invoice();
CREATE TRIGGER printing_vendors_updated_at BEFORE UPDATE ON public.printing_vendors FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_products AFTER INSERT OR DELETE OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION write_audit();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_protect_catalogue_access BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION protect_catalogue_access();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_quotations AFTER INSERT OR DELETE OR UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION write_audit();
CREATE TRIGGER quotations_updated_at BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_requirements AFTER INSERT OR DELETE OR UPDATE ON public.requirements FOR EACH ROW EXECUTE FUNCTION write_audit();
CREATE TRIGGER requirements_updated_at BEFORE UPDATE ON public.requirements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Grants (matches Supabase defaults)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
create policy activities_delete on public.activities as PERMISSIVE for DELETE to public using (is_admin());
create policy activities_insert on public.activities as PERMISSIVE for INSERT to public with check (is_internal());
create policy activities_select on public.activities as PERMISSIVE for SELECT to public using ((can_management_read() OR (assigned_to = auth.uid()) OR (created_by = auth.uid())));
create policy activities_update on public.activities as PERMISSIVE for UPDATE to public using ((can_management_read() OR (assigned_to = auth.uid()) OR (created_by = auth.uid()))) with check ((can_management_read() OR (assigned_to = auth.uid()) OR (created_by = auth.uid())));
create policy announcements_select on public.announcements as PERMISSIVE for SELECT to authenticated using (is_internal());
create policy announcements_write on public.announcements as PERMISSIVE for ALL to authenticated using (has_any_role(ARRAY['admin'::app_role, 'management'::app_role])) with check (has_any_role(ARRAY['admin'::app_role, 'management'::app_role]));
create policy audit_insert on public.audit_logs as PERMISSIVE for INSERT to authenticated with check (true);
create policy audit_select on public.audit_logs as PERMISSIVE for SELECT to public using ((can_management_read() OR (user_id = auth.uid())));
create policy branches_select on public.branches as PERMISSIVE for SELECT to authenticated using ((can_crm() OR can_orders_read() OR can_finance()));
create policy branches_write on public.branches as PERMISSIVE for ALL to authenticated using (can_crm()) with check (can_crm());
create policy brands_public_select on public.brands as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy brands_select on public.brands as PERMISSIVE for SELECT to authenticated using (is_internal());
create policy brands_write on public.brands as PERMISSIVE for ALL to authenticated using (can_sales()) with check (can_sales());
create policy campaign_events_insert on public.campaign_events as PERMISSIVE for INSERT to authenticated with check ((is_internal() OR is_client()));
create policy campaign_events_select on public.campaign_events as PERMISSIVE for SELECT to authenticated using ((can_crm() OR can_ops() OR (EXISTS ( SELECT 1
   FROM campaigns c
  WHERE ((c.id = campaign_events.campaign_id) AND is_client() AND (c.company_id = client_company_id()))))));
create policy campaign_products_select_client on public.campaign_products as PERMISSIVE for SELECT to authenticated using (((visibility = 'published'::offering_visibility) AND (EXISTS ( SELECT 1
   FROM campaigns c
  WHERE ((c.id = campaign_products.campaign_id) AND (c.company_id = client_company_id()) AND (c.published_to_client_at IS NOT NULL))))));
create policy campaign_products_select_internal on public.campaign_products as PERMISSIVE for SELECT to authenticated using ((can_crm() OR can_ops() OR can_finance()));
create policy campaign_products_write on public.campaign_products as PERMISSIVE for ALL to authenticated using (can_crm()) with check (can_crm());
create policy campaigns_select_client on public.campaigns as PERMISSIVE for SELECT to authenticated using ((is_client() AND (company_id = client_company_id()) AND (published_to_client_at IS NOT NULL)));
create policy campaigns_select_internal on public.campaigns as PERMISSIVE for SELECT to authenticated using ((can_crm() OR can_ops() OR can_finance()));
create policy campaigns_write on public.campaigns as PERMISSIVE for ALL to authenticated using (can_crm()) with check (can_crm());
create policy cat_select on public.categories as PERMISSIVE for SELECT to authenticated using (is_internal());
create policy cat_write on public.categories as PERMISSIVE for ALL to authenticated using (can_sales()) with check (can_sales());
create policy categories_public_select on public.categories as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy comments_insert on public.client_comments as PERMISSIVE for INSERT to authenticated with check ((is_client() AND (company_id = client_company_id()) AND (user_id = auth.uid())));
create policy comments_select on public.client_comments as PERMISSIVE for SELECT to authenticated using ((can_crm() OR can_ops() OR (is_client() AND (company_id = client_company_id()))));
create policy selections_delete on public.client_product_selections as PERMISSIVE for DELETE to authenticated using ((is_client() AND (user_id = auth.uid()) AND (company_id = client_company_id())));
create policy selections_insert on public.client_product_selections as PERMISSIVE for INSERT to authenticated with check ((is_client() AND (company_id = client_company_id()) AND (user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM campaigns c
  WHERE ((c.id = client_product_selections.campaign_id) AND (c.company_id = client_company_id()) AND (c.published_to_client_at IS NOT NULL))))));
create policy selections_select on public.client_product_selections as PERMISSIVE for SELECT to authenticated using ((can_crm() OR can_ops() OR (is_client() AND (company_id = client_company_id()))));
create policy selections_update on public.client_product_selections as PERMISSIVE for UPDATE to authenticated using ((is_client() AND (user_id = auth.uid()) AND (company_id = client_company_id()))) with check ((is_client() AND (user_id = auth.uid()) AND (company_id = client_company_id())));
create policy companies_delete on public.companies as PERMISSIVE for DELETE to authenticated using (is_admin());
create policy companies_select on public.companies as PERMISSIVE for SELECT to public using ((can_management_read() OR can_ops() OR can_finance() OR ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'sales'::app_role)))) AND (owner_id = auth.uid())) OR (is_client() AND (id = client_company_id()))));
create policy companies_update on public.companies as PERMISSIVE for UPDATE to public using ((is_admin() OR (can_crm() AND (owner_id = auth.uid())))) with check ((is_admin() OR (can_crm() AND (owner_id = auth.uid()))));
create policy companies_write on public.companies as PERMISSIVE for INSERT to authenticated with check (can_crm());
create policy cpa_select on public.company_product_access as PERMISSIVE for SELECT to public using ((is_internal() OR (company_id = client_company_id())));
create policy cpa_write on public.company_product_access as PERMISSIVE for ALL to public using (is_admin()) with check (is_admin());
create policy contacts_delete on public.contacts as PERMISSIVE for DELETE to public using (is_admin());
create policy contacts_insert on public.contacts as PERMISSIVE for INSERT to public with check ((can_crm() AND (is_admin() OR (company_id IN ( SELECT companies.id
   FROM companies
  WHERE (companies.owner_id = auth.uid()))))));
create policy contacts_select on public.contacts as PERMISSIVE for SELECT to public using ((can_management_read() OR can_ops() OR can_finance() OR ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'sales'::app_role)))) AND (company_id IN ( SELECT companies.id
   FROM companies
  WHERE (companies.owner_id = auth.uid())))) OR (is_client() AND (company_id = client_company_id()))));
create policy contacts_update on public.contacts as PERMISSIVE for UPDATE to public using ((can_crm() AND (is_admin() OR (company_id IN ( SELECT companies.id
   FROM companies
  WHERE (companies.owner_id = auth.uid())))))) with check ((can_crm() AND (is_admin() OR (company_id IN ( SELECT companies.id
   FROM companies
  WHERE (companies.owner_id = auth.uid()))))));
create policy courier_select on public.courier_partners as PERMISSIVE for SELECT to authenticated using ((can_ops() OR is_admin() OR can_management_read()));
create policy courier_write on public.courier_partners as PERMISSIVE for ALL to authenticated using (can_ops()) with check (can_ops());
create policy internal_all_dept_members on public.department_members as PERMISSIVE for ALL to authenticated using ((NOT is_client())) with check ((NOT is_client()));
create policy internal_all_departments on public.departments as PERMISSIVE for ALL to authenticated using ((NOT is_client())) with check ((NOT is_client()));
create policy goals_select on public.goals as PERMISSIVE for SELECT to public using ((can_management_read() OR (owner_id = auth.uid()) OR (owner_id IS NULL)));
create policy goals_write on public.goals as PERMISSIVE for ALL to public using (can_management_read()) with check (can_management_read());
create policy invoices_select on public.invoices as PERMISSIVE for SELECT to authenticated using ((can_finance() OR can_management_read()));
create policy invoices_select_client on public.invoices as PERMISSIVE for SELECT to public using ((is_client() AND (company_id = client_company_id())));
create policy invoices_write on public.invoices as PERMISSIVE for ALL to authenticated using (can_finance()) with check (can_finance());
create policy lead_hist_select on public.lead_stage_history as PERMISSIVE for SELECT to authenticated using ((can_crm() OR can_management_read()));
create policy leads_delete on public.leads as PERMISSIVE for DELETE to public using (is_admin());
create policy leads_insert on public.leads as PERMISSIVE for INSERT to public with check ((can_crm() AND (is_admin() OR (owner_id = auth.uid()))));
create policy leads_select on public.leads as PERMISSIVE for SELECT to public using ((can_management_read() OR (can_crm() AND (is_admin() OR (owner_id = auth.uid())))));
create policy leads_update on public.leads as PERMISSIVE for UPDATE to public using ((can_crm() AND (is_admin() OR (owner_id = auth.uid())))) with check ((can_crm() AND (is_admin() OR (owner_id = auth.uid()))));
create policy mockups_select on public.mockups as PERMISSIVE for SELECT to authenticated using ((can_sales() OR can_ops() OR is_admin()));
create policy mockups_select_client on public.mockups as PERMISSIVE for SELECT to public using ((is_client() AND (status = 'shared'::mockup_status) AND ((requirement_id IN ( SELECT requirements.id
   FROM requirements
  WHERE (requirements.company_id = client_company_id()))) OR (order_id IN ( SELECT orders.id
   FROM orders
  WHERE (orders.company_id = client_company_id()))))));
create policy mockups_write on public.mockups as PERMISSIVE for ALL to authenticated using (can_sales()) with check (can_sales());
create policy notifications_insert_internal on public.notifications as PERMISSIVE for INSERT to authenticated with check ((is_internal() OR is_client()));
create policy notifications_select on public.notifications as PERMISSIVE for SELECT to authenticated using ((((audience = 'internal'::notification_audience) AND is_internal()) OR ((audience = 'client'::notification_audience) AND is_client() AND (company_id = client_company_id()) AND ((user_id IS NULL) OR (user_id = auth.uid())))));
create policy notifications_update on public.notifications as PERMISSIVE for UPDATE to authenticated using ((((audience = 'internal'::notification_audience) AND is_internal()) OR ((audience = 'client'::notification_audience) AND is_client() AND (company_id = client_company_id())))) with check (true);
create policy internal_all_order_assignments on public.order_assignments as PERMISSIVE for ALL to authenticated using ((NOT is_client())) with check ((NOT is_client()));
create policy order_items_select on public.order_items as PERMISSIVE for SELECT to authenticated using ((can_orders_read() OR (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND is_client() AND (o.company_id = client_company_id()))))));
create policy order_items_write on public.order_items as PERMISSIVE for ALL to authenticated using (can_orders_write()) with check (can_orders_write());
create policy order_hist_select on public.order_status_history as PERMISSIVE for SELECT to authenticated using (can_orders_read());
create policy orders_delete on public.orders as PERMISSIVE for DELETE to authenticated using (is_admin());
create policy orders_insert on public.orders as PERMISSIVE for INSERT to authenticated with check (has_any_role(ARRAY['admin'::app_role, 'sales'::app_role, 'operations'::app_role]));
create policy orders_select on public.orders as PERMISSIVE for SELECT to public using ((can_management_read() OR can_finance() OR ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'sales'::app_role)))) AND ((owner_id = auth.uid()) OR (assigned_to = auth.uid()))) OR ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'operations'::app_role)))) AND ((assigned_to = auth.uid()) OR (operations_user_id = auth.uid()) OR (current_department_id = ( SELECT profiles.department_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM order_assignments oa
  WHERE ((oa.order_id = orders.id) AND (oa.assigned_to = auth.uid()))))))));
create policy orders_select_client on public.orders as PERMISSIVE for SELECT to public using ((is_client() AND (company_id = client_company_id())));
create policy orders_update on public.orders as PERMISSIVE for UPDATE to authenticated using (can_orders_write()) with check (can_orders_write());
create policy org_settings_read on public.org_settings as PERMISSIVE for SELECT to authenticated using (is_internal());
create policy org_settings_write on public.org_settings as PERMISSIVE for UPDATE to authenticated using (is_admin()) with check (is_admin());
create policy payables_select on public.payables as PERMISSIVE for SELECT to authenticated using ((can_finance() OR is_admin()));
create policy payables_write on public.payables as PERMISSIVE for ALL to authenticated using (has_any_role(ARRAY['admin'::app_role, 'accounts'::app_role])) with check (has_any_role(ARRAY['admin'::app_role, 'accounts'::app_role]));
create policy payments_select on public.payments as PERMISSIVE for SELECT to authenticated using ((can_finance() OR can_management_read()));
create policy payments_write on public.payments as PERMISSIVE for ALL to authenticated using (can_finance()) with check (can_finance());
create policy print_select on public.printing_vendors as PERMISSIVE for SELECT to authenticated using ((can_ops() OR is_admin() OR can_management_read()));
create policy print_write on public.printing_vendors as PERMISSIVE for ALL to authenticated using (can_ops()) with check (can_ops());
create policy product_images_select_internal on public.product_images as PERMISSIVE for SELECT to authenticated using (is_internal());
create policy product_images_public_select on public.product_images as PERMISSIVE for SELECT to anon, authenticated using ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_images.product_id) AND (p.status = 'active'::product_status) AND (p.catalogue_access = 'all'::text)))));
create policy product_images_write on public.product_images as PERMISSIVE for ALL to authenticated using (can_sales()) with check (can_sales());
create policy variants_select on public.product_variants as PERMISSIVE for SELECT to authenticated using (is_internal());
create policy variants_write on public.product_variants as PERMISSIVE for ALL to authenticated using (can_sales()) with check (can_sales());
create policy products_public_catalogue_select on public.products as PERMISSIVE for SELECT to anon, authenticated using (((status = 'active'::product_status) AND (catalogue_access = 'all'::text)));
create policy products_select on public.products as PERMISSIVE for SELECT to public using (is_internal());
create policy products_write on public.products as PERMISSIVE for ALL to authenticated using (can_sales()) with check (can_sales());
create policy profiles_admin_all on public.profiles as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy profiles_select on public.profiles as PERMISSIVE for SELECT to authenticated using ((is_internal() OR (id = auth.uid()) OR (is_client() AND (company_id = client_company_id()) AND (role = ANY (ARRAY['client_admin'::app_role, 'client_user'::app_role])))));
create policy quot_hist_select on public.quotation_history as PERMISSIVE for SELECT to authenticated using ((can_sales() OR can_ops()));
create policy quot_items_select on public.quotation_items as PERMISSIVE for SELECT to authenticated using ((can_sales() OR can_ops() OR can_finance() OR (EXISTS ( SELECT 1
   FROM quotations q
  WHERE ((q.id = quotation_items.quotation_id) AND is_client() AND (q.company_id = client_company_id()) AND (q.status = ANY (ARRAY['sent'::quotation_status, 'viewed'::quotation_status, 'accepted'::quotation_status, 'rejected'::quotation_status, 'expired'::quotation_status])))))));
create policy quot_items_write on public.quotation_items as PERMISSIVE for ALL to authenticated using (can_sales()) with check (can_sales());
create policy quot_delete on public.quotations as PERMISSIVE for DELETE to public using (is_admin());
create policy quot_insert on public.quotations as PERMISSIVE for INSERT to public with check ((can_sales() AND (is_admin() OR (owner_id = auth.uid()))));
create policy quot_select_client on public.quotations as PERMISSIVE for SELECT to public using ((is_client() AND (company_id = client_company_id()) AND (status = ANY (ARRAY['sent'::quotation_status, 'viewed'::quotation_status, 'accepted'::quotation_status, 'rejected'::quotation_status, 'expired'::quotation_status]))));
create policy quot_select_internal on public.quotations as PERMISSIVE for SELECT to public using ((can_management_read() OR (can_sales() AND (is_admin() OR (owner_id = auth.uid())))));
create policy quot_update on public.quotations as PERMISSIVE for UPDATE to public using ((can_sales() AND (is_admin() OR (owner_id = auth.uid())))) with check ((can_sales() AND (is_admin() OR (owner_id = auth.uid()))));
create policy req_prod_select on public.requirement_products as PERMISSIVE for SELECT to authenticated using ((can_crm() OR can_ops() OR can_management_read()));
create policy req_prod_write on public.requirement_products as PERMISSIVE for ALL to authenticated using (can_sales()) with check (can_sales());
create policy req_delete on public.requirements as PERMISSIVE for DELETE to public using (is_admin());
create policy req_insert on public.requirements as PERMISSIVE for INSERT to public with check ((can_crm() AND (is_admin() OR (owner_id = auth.uid()))));
create policy req_select on public.requirements as PERMISSIVE for SELECT to public using ((can_management_read() OR (can_crm() AND (is_admin() OR (owner_id = auth.uid()))) OR (is_client() AND (company_id = client_company_id()))));
create policy req_update on public.requirements as PERMISSIVE for UPDATE to public using ((can_crm() AND (is_admin() OR (owner_id = auth.uid())))) with check ((can_crm() AND (is_admin() OR (owner_id = auth.uid()))));
create policy "Admins manage reviews" on public.reviews as PERMISSIVE for ALL to public using (is_admin());
create policy "Internal users view reviews" on public.reviews as PERMISSIVE for SELECT to public using (is_internal());
create policy sample_movements_all on public.sample_movements as PERMISSIVE for ALL to authenticated using (is_internal()) with check (has_any_role(ARRAY['admin'::app_role, 'sales'::app_role, 'operations'::app_role]));
create policy sample_stock_all on public.sample_stock as PERMISSIVE for ALL to authenticated using (is_internal()) with check (has_any_role(ARRAY['admin'::app_role, 'sales'::app_role, 'operations'::app_role]));
create policy subcat_select on public.subcategories as PERMISSIVE for SELECT to authenticated using (is_internal());
create policy subcat_write on public.subcategories as PERMISSIVE for ALL to authenticated using (can_sales()) with check (can_sales());
create policy suppliers_select on public.suppliers as PERMISSIVE for SELECT to authenticated using ((can_ops() OR can_sales() OR can_finance() OR can_management_read()));
create policy suppliers_write on public.suppliers as PERMISSIVE for ALL to authenticated using (can_ops()) with check (can_ops());
create policy tasks_select on public.tasks as PERMISSIVE for SELECT to authenticated using ((is_internal() AND (has_any_role(ARRAY['admin'::app_role, 'management'::app_role]) OR (assigned_to = auth.uid()) OR (created_by = auth.uid()) OR (department_id IN ( SELECT department_members.department_id
   FROM department_members
  WHERE (department_members.user_id = auth.uid()))) OR (department_id = ( SELECT profiles.department_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))))));
create policy tasks_write on public.tasks as PERMISSIVE for ALL to authenticated using ((has_any_role(ARRAY['admin'::app_role, 'operations'::app_role]) OR (assigned_to = auth.uid()) OR (created_by = auth.uid()))) with check ((has_any_role(ARRAY['admin'::app_role, 'operations'::app_role]) OR (assigned_to = auth.uid()) OR (created_by = auth.uid())));

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('company-logos', 'company-logos', true, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('mockups', 'mockups', false, 10485760, array['image/png','image/jpeg','image/webp','application/pdf']),
  ('product-images', 'product-images', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------
drop policy if exists company_logos_internal_delete on storage.objects;
drop policy if exists company_logos_internal_update on storage.objects;
drop policy if exists company_logos_internal_write on storage.objects;
drop policy if exists company_logos_public_read on storage.objects;
drop policy if exists mockups_storage_delete on storage.objects;
drop policy if exists mockups_storage_insert on storage.objects;
drop policy if exists mockups_storage_select on storage.objects;
drop policy if exists product_images_internal_delete on storage.objects;
drop policy if exists product_images_internal_update on storage.objects;
drop policy if exists product_images_internal_write on storage.objects;
drop policy if exists product_images_public_read on storage.objects;

create policy company_logos_internal_delete on storage.objects as PERMISSIVE for DELETE to public using (((bucket_id = 'company-logos'::text) AND is_internal()));
create policy company_logos_internal_update on storage.objects as PERMISSIVE for UPDATE to public using (((bucket_id = 'company-logos'::text) AND is_internal()));
create policy company_logos_internal_write on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = 'company-logos'::text) AND is_internal()));
create policy company_logos_public_read on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'company-logos'::text));
create policy mockups_storage_delete on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'mockups'::text) AND (can_sales() OR is_admin())));
create policy mockups_storage_insert on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'mockups'::text) AND can_sales()));
create policy mockups_storage_select on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'mockups'::text) AND (can_sales() OR can_ops() OR is_admin())));
create policy product_images_internal_delete on storage.objects as PERMISSIVE for DELETE to public using (((bucket_id = 'product-images'::text) AND is_internal()));
create policy product_images_internal_update on storage.objects as PERMISSIVE for UPDATE to public using (((bucket_id = 'product-images'::text) AND is_internal()));
create policy product_images_internal_write on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = 'product-images'::text) AND is_internal()));
create policy product_images_public_read on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'product-images'::text));


-- ---------------------------------------------------------------------------
-- Portal views
--
-- These are security-definer views: they resolve the caller's company through
-- client_company_id() inside the view body, so a client can only ever read its
-- own rows through them. The client portal reads its catalogue, campaigns,
-- offerings, orders and invoices exclusively through these.
-- ---------------------------------------------------------------------------
create or replace view public.client_products as
 SELECT p.id,
    p.name,
    p.sku,
    p.description,
    p.image_url,
    p.price,
    p.moq,
    p.category_id,
    cat.name AS category_name,
    p.subcategory_id,
    sub.name AS subcategory_name,
    p.brand_id,
    b.name AS brand_name
   FROM products p
     LEFT JOIN categories cat ON cat.id = p.category_id
     LEFT JOIN subcategories sub ON sub.id = p.subcategory_id
     LEFT JOIN brands b ON b.id = p.brand_id
  WHERE p.status = 'active'::product_status AND p.catalogue_access <> 'none'::text AND (p.catalogue_access = 'all'::text OR (EXISTS ( SELECT 1
           FROM company_product_access cpa
          WHERE cpa.product_id = p.id AND cpa.company_id = client_company_id())));

create or replace view public.client_product_variants as
 SELECT v.id, v.product_id, v.colour, v.display_name, v.sort_order, v.extra_price, v.sku
   FROM product_variants v
     JOIN products p ON p.id = v.product_id
  WHERE v.status = 'active' AND p.status = 'active'::product_status AND p.catalogue_access <> 'none'::text AND (p.catalogue_access = 'all'::text OR (EXISTS ( SELECT 1
           FROM company_product_access cpa
          WHERE cpa.product_id = p.id AND cpa.company_id = client_company_id())));

create or replace view public.client_product_images as
 SELECT i.id, i.product_id, i.variant_id, i.image_url, i.sort_order, i.is_primary
   FROM product_images i
     JOIN products p ON p.id = i.product_id
  WHERE p.status = 'active'::product_status AND p.catalogue_access <> 'none'::text AND (p.catalogue_access = 'all'::text OR (EXISTS ( SELECT 1
           FROM company_product_access cpa
          WHERE cpa.product_id = p.id AND cpa.company_id = client_company_id())));

grant select on public.client_product_variants to anon, authenticated;
grant select on public.client_product_images to anon, authenticated;

create or replace view public.portal_campaigns as
 SELECT id,
    name,
    company_id,
    occasion,
    description,
    employee_quantity,
    budget_per_employee,
    total_budget,
    required_delivery_date,
    delivery_locations,
    preferred_categories,
    branding_requirements,
    packaging_requirements,
    custom_requirements,
    status,
    published_to_client_at
   FROM campaigns c
  WHERE published_to_client_at IS NOT NULL AND company_id = client_company_id();

create or replace view public.portal_catalogue with (security_invoker=false) as
 SELECT p.id,
    p.name,
    p.description,
    p.price,
    p.moq,
    p.image_url,
    p.status,
    p.category_id,
    p.brand_id,
    c.name AS category_name,
    b.name AS brand_name
   FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN brands b ON b.id = p.brand_id
  WHERE p.status = 'active'::product_status AND client_company_id() IS NOT NULL AND (p.catalogue_access = 'all'::text OR p.catalogue_access = 'selected'::text AND (EXISTS ( SELECT 1
           FROM company_product_access a
          WHERE a.product_id = p.id AND a.company_id = client_company_id())));

create or replace view public.portal_invoices with (security_invoker=false) as
 SELECT i.id,
    i.invoice_number,
    i.company_id,
    i.amount,
    i.status,
    i.due_date,
    i.invoice_date,
    o.order_number
   FROM invoices i
     LEFT JOIN orders o ON o.id = i.order_id
  WHERE i.company_id = client_company_id() OR is_internal();

create or replace view public.portal_offerings as
 SELECT cp.id,
    cp.campaign_id,
    cp.display_name,
    cp.client_description,
    cp.client_image_url,
    cp.selling_price,
    cp.discount_percent,
    cp.quantity_limit,
    cp.moq,
    cp.personalization_options,
    cp.variant_availability,
    cp.estimated_delivery,
    cp.client_specs,
    cp.display_order,
    cp.published_at,
    c.company_id,
    c.name AS campaign_name,
    c.employee_quantity,
    c.budget_per_employee,
    c.total_budget
   FROM campaign_products cp
     JOIN campaigns c ON c.id = cp.campaign_id
  WHERE cp.visibility = 'published'::offering_visibility AND c.published_to_client_at IS NOT NULL AND c.company_id = client_company_id();

create or replace view public.portal_orders with (security_invoker=false) as
 SELECT id,
    order_number,
    company_id,
    status,
    order_value,
    expected_delivery_date,
    actual_delivery_date,
    created_at,
    tracking_number,
    dispatch_date
   FROM orders
  WHERE company_id = client_company_id() OR is_internal();

grant all on all tables in schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Organisation settings row
-- ---------------------------------------------------------------------------
insert into public.org_settings (id, organisation_name, default_tax_percent, currency)
values (1, 'Robust Gifting', 18, 'INR')
on conflict (id) do nothing;
