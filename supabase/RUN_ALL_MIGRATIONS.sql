-- =============================================================================
-- SAMA SAFETY — COMPLETE DATABASE SETUP (run AFTER SETUP_OWN_PROJECT.sql)
-- Paste this ENTIRE file into Supabase Dashboard -> SQL Editor -> Run
-- Generated 2026-09-05
-- =============================================================================


-- Ensure profiles has approval columns (safe to re-run)
alter table public.profiles add column if not exists status text not null default 'pending';
alter table public.profiles add column if not exists hidden boolean not null default false;

-- >>>>> migration: 20260828190558_7c850897-c0af-4421-80d7-e8dca7cabd2a.sql

-- ============ 1. Departments (extend existing enum, keep admin/employee) ============
alter type public.app_role add value if not exists 'sales';
alter type public.app_role add value if not exists 'project_manager';
alter type public.app_role add value if not exists 'inventory';
alter type public.app_role add value if not exists 'technician';
alter type public.app_role add value if not exists 'accounts';

-- Text-based department helper so new enum labels are usable immediately.
create or replace function private.has_dept(_user_id uuid, _dept text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role::text = _dept
  )
$$;
revoke all on function private.has_dept(uuid, text) from public, anon;
grant execute on function private.has_dept(uuid, text) to authenticated, service_role;

-- Management = admin role.
create or replace function private.is_mgmt(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role::text = 'admin'
  )
$$;
revoke all on function private.is_mgmt(uuid) from public, anon;
grant execute on function private.is_mgmt(uuid) to authenticated, service_role;

-- Any signed-in staff member with an approved profile.
create or replace function private.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = _user_id and coalesce(status,'approved') = 'approved'
  )
$$;
revoke all on function private.is_staff(uuid) from public, anon;
grant execute on function private.is_staff(uuid) to authenticated, service_role;

-- Shared updated_at trigger fn
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- ============ 2. Customers ============
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  city text not null default '',
  payment_terms text not null default '',
  credit_terms text not null default '',
  notes text not null default '',
  status text not null default 'active',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;
create policy "staff view customers" on public.customers
  for select to authenticated using (private.is_staff(auth.uid()));
create policy "sales or mgmt insert customers" on public.customers
  for insert to authenticated
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales'));
create policy "sales or mgmt update customers" on public.customers
  for update to authenticated
  using (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales'))
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales'));
create policy "mgmt delete customers" on public.customers
  for delete to authenticated using (private.is_mgmt(auth.uid()));
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- ============ 3. Projects ============
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  project_number text not null unique,
  name text not null,
  customer_id uuid references public.customers(id) on delete set null,
  site_location text not null default '',
  project_type text not null default 'installation',
  stage text not null default 'project_initiated',
  status text not null default 'active',
  contract_value numeric(14,2) not null default 0,
  currency text not null default 'SAR',
  estimated_cost numeric(14,2) not null default 0,
  start_date date,
  target_date date,
  completed_date date,
  project_manager_id uuid,
  progress_percent integer not null default 0,
  notes text not null default '',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;
create policy "staff view projects" on public.projects
  for select to authenticated using (private.is_staff(auth.uid()));
create policy "pm or mgmt insert projects" on public.projects
  for insert to authenticated
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'project_manager'));
create policy "pm or mgmt update projects" on public.projects
  for update to authenticated
  using (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'project_manager') or project_manager_id = auth.uid())
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'project_manager') or project_manager_id = auth.uid());
create policy "mgmt delete projects" on public.projects
  for delete to authenticated using (private.is_mgmt(auth.uid()));
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create index if not exists idx_projects_customer on public.projects (customer_id);

-- ============ 4. Job Numbers ============
create table if not exists public.job_numbers (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  project_id uuid not null references public.projects(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  scope_type text not null default 'installation',
  description text not null default '',
  site_location text not null default '',
  status text not null default 'draft',
  approved_at timestamptz,
  approved_by uuid,
  start_date date,
  target_date date,
  completed_date date,
  progress_percent integer not null default 0,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.job_numbers to authenticated;
grant all on public.job_numbers to service_role;
alter table public.job_numbers enable row level security;
create policy "staff view job numbers" on public.job_numbers
  for select to authenticated using (private.is_staff(auth.uid()));
create policy "pm or mgmt insert job numbers" on public.job_numbers
  for insert to authenticated
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'project_manager'));
create policy "pm or mgmt update job numbers" on public.job_numbers
  for update to authenticated
  using (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'project_manager'))
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'project_manager'));
create policy "mgmt delete job numbers" on public.job_numbers
  for delete to authenticated using (private.is_mgmt(auth.uid()));
create trigger job_numbers_updated_at before update on public.job_numbers
  for each row execute function public.set_updated_at();
create index if not exists idx_job_numbers_project on public.job_numbers (project_id);

-- ============ 5. Assets / Equipment ============
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_tag text not null unique,
  customer_id uuid references public.customers(id) on delete cascade,
  site_location text not null default '',
  system_type text not null default '',
  manufacturer text not null default '',
  model text not null default '',
  serial_number text not null default '',
  installation_date date,
  warranty_end date,
  maintenance_frequency_months integer,
  last_service_date date,
  next_service_date date,
  status text not null default 'active',
  notes text not null default '',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.assets to authenticated;
grant all on public.assets to service_role;
alter table public.assets enable row level security;
create policy "staff view assets" on public.assets
  for select to authenticated using (private.is_staff(auth.uid()));
create policy "pm sales mgmt insert assets" on public.assets
  for insert to authenticated
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'project_manager') or private.has_dept(auth.uid(),'sales'));
create policy "pm sales mgmt update assets" on public.assets
  for update to authenticated
  using (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'project_manager') or private.has_dept(auth.uid(),'sales'))
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'project_manager') or private.has_dept(auth.uid(),'sales'));
create policy "mgmt delete assets" on public.assets
  for delete to authenticated using (private.is_mgmt(auth.uid()));
create trigger assets_updated_at before update on public.assets
  for each row execute function public.set_updated_at();
create index if not exists idx_assets_customer on public.assets (customer_id);

-- ============ 6. Approvals engine (A1..A6) ============
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  approval_type text not null,
  entity_table text not null,
  entity_id uuid,
  reference text not null default '',
  project_id uuid references public.projects(id) on delete cascade,
  job_number_id uuid references public.job_numbers(id) on delete cascade,
  title text not null default '',
  details text not null default '',
  amount numeric(14,2),
  submitted_by uuid not null default auth.uid(),
  submitted_at timestamptz not null default now(),
  approver_id uuid,
  decision text not null default 'pending',
  decision_comments text not null default '',
  rejection_reason text not null default '',
  revision_requested boolean not null default false,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.approvals to authenticated;
grant all on public.approvals to service_role;
alter table public.approvals enable row level security;
create policy "staff view approvals" on public.approvals
  for select to authenticated using (private.is_staff(auth.uid()));
create policy "staff submit approvals" on public.approvals
  for insert to authenticated
  with check (private.is_staff(auth.uid()) and submitted_by = auth.uid() and decision = 'pending');
create policy "mgmt decide approvals" on public.approvals
  for update to authenticated
  using (private.is_mgmt(auth.uid())) with check (private.is_mgmt(auth.uid()));
create trigger approvals_updated_at before update on public.approvals
  for each row execute function public.set_updated_at();
create index if not exists idx_approvals_pending on public.approvals (decision, approval_type);
create index if not exists idx_approvals_project on public.approvals (project_id);

-- ============ 7. Notifications ============
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  message text not null default '',
  category text not null default 'general',
  link text not null default '',
  entity_table text not null default '',
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "view own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "staff create notifications" on public.notifications
  for insert to authenticated with check (private.is_staff(auth.uid()));
create policy "update own notifications" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own notifications" on public.notifications
  for delete to authenticated using (user_id = auth.uid());
create index if not exists idx_notifications_user on public.notifications (user_id, read_at);

-- ============ 8. Audit / activity log (append only) ============
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_name text not null default '',
  department text not null default '',
  action text not null,
  entity_table text not null default '',
  entity_id uuid,
  entity_label text not null default '',
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "mgmt view audit log" on public.audit_log
  for select to authenticated using (private.is_mgmt(auth.uid()));
create policy "staff append audit log" on public.audit_log
  for insert to authenticated with check (private.is_staff(auth.uid()));
create index if not exists idx_audit_log_created on public.audit_log (created_at desc);
create index if not exists idx_audit_log_entity on public.audit_log (entity_table, entity_id);

-- ============ 9. Link existing records into the new spine ============
alter table public.reports
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists job_number_id uuid references public.job_numbers(id) on delete set null,
  add column if not exists asset_id uuid references public.assets(id) on delete set null;

alter table public.maintenance_tasks
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists job_number_id uuid references public.job_numbers(id) on delete set null,
  add column if not exists asset_id uuid references public.assets(id) on delete set null;

create index if not exists idx_reports_job_number on public.reports (job_number_id);
create index if not exists idx_maintenance_tasks_job_number on public.maintenance_tasks (job_number_id);

-- >>>>> migration: 20260828190621_19ad92e5-beed-4307-ac0a-3ed42f4fb30a.sql

revoke execute on function public.admin_exists() from public, anon, authenticated;
grant execute on function public.admin_exists() to service_role;

-- >>>>> migration: 20260828191952_08065893-6aeb-4d3f-a5be-c08f06460507.sql

-- ============ Inquiries ============
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  contact_person text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  site_location text not null default '',
  scope_type text not null default 'installation',
  requirement_details text not null default '',
  source text not null default 'direct',
  received_date date not null default current_date,
  target_date date,
  assigned_to uuid,
  stage text not null default 'inquiry',
  status text not null default 'open',
  notes text not null default '',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.inquiries to authenticated;
grant all on public.inquiries to service_role;
alter table public.inquiries enable row level security;
create policy "staff view inquiries" on public.inquiries
  for select to authenticated using (private.is_staff(auth.uid()));
create policy "sales or mgmt insert inquiries" on public.inquiries
  for insert to authenticated
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales'));
create policy "sales or mgmt update inquiries" on public.inquiries
  for update to authenticated
  using (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales') or assigned_to = auth.uid())
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales') or assigned_to = auth.uid());
create policy "mgmt delete inquiries" on public.inquiries
  for delete to authenticated using (private.is_mgmt(auth.uid()));
create trigger inquiries_updated_at before update on public.inquiries
  for each row execute function public.set_updated_at();
create index if not exists idx_inquiries_customer on public.inquiries (customer_id);

-- ============ Quotations ============
create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  revision integer not null default 0,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  title text not null default '',
  site_location text not null default '',
  currency text not null default 'SAR',
  subtotal numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  vat_percent numeric(5,2) not null default 15,
  total_amount numeric(14,2) not null default 0,
  estimated_cost numeric(14,2) not null default 0,
  validity_days integer not null default 30,
  payment_terms text not null default '',
  delivery_terms text not null default '',
  scope_notes text not null default '',
  stage text not null default 'quotation_draft',
  status text not null default 'draft',
  sent_at timestamptz,
  decision_notes text not null default '',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.quotations to authenticated;
grant all on public.quotations to service_role;
alter table public.quotations enable row level security;
create policy "staff view quotations" on public.quotations
  for select to authenticated using (private.is_staff(auth.uid()));
create policy "sales or mgmt insert quotations" on public.quotations
  for insert to authenticated
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales'));
create policy "sales or mgmt update quotations" on public.quotations
  for update to authenticated
  using (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales'))
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales'));
create policy "mgmt delete quotations" on public.quotations
  for delete to authenticated using (private.is_mgmt(auth.uid()));
create trigger quotations_updated_at before update on public.quotations
  for each row execute function public.set_updated_at();
create index if not exists idx_quotations_customer on public.quotations (customer_id);
create index if not exists idx_quotations_inquiry on public.quotations (inquiry_id);

-- ============ Quotation items ============
create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  sequence integer not null default 1,
  description text not null default '',
  unit text not null default 'nos',
  quantity numeric(14,3) not null default 1,
  unit_price numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.quotation_items to authenticated;
grant all on public.quotation_items to service_role;
alter table public.quotation_items enable row level security;
create policy "staff view quotation items" on public.quotation_items
  for select to authenticated using (private.is_staff(auth.uid()));
create policy "sales or mgmt insert quotation items" on public.quotation_items
  for insert to authenticated
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales'));
create policy "sales or mgmt update quotation items" on public.quotation_items
  for update to authenticated
  using (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales'))
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales'));
create policy "sales or mgmt delete quotation items" on public.quotation_items
  for delete to authenticated
  using (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales'));
create trigger quotation_items_updated_at before update on public.quotation_items
  for each row execute function public.set_updated_at();
create index if not exists idx_quotation_items_quotation on public.quotation_items (quotation_id);

-- ============ Customer purchase orders ============
create table if not exists public.customer_pos (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  po_number text not null default '',
  po_date date,
  po_value numeric(14,2) not null default 0,
  currency text not null default 'SAR',
  quotation_id uuid references public.quotations(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  document_url text not null default '',
  verification_status text not null default 'pending',
  verified_by uuid,
  verified_at timestamptz,
  discrepancy_notes text not null default '',
  notes text not null default '',
  stage text not null default 'po_received',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.customer_pos to authenticated;
grant all on public.customer_pos to service_role;
alter table public.customer_pos enable row level security;
create policy "staff view customer pos" on public.customer_pos
  for select to authenticated using (private.is_staff(auth.uid()));
create policy "sales or mgmt insert customer pos" on public.customer_pos
  for insert to authenticated
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales'));
create policy "sales or mgmt update customer pos" on public.customer_pos
  for update to authenticated
  using (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales'))
  with check (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'sales'));
create policy "mgmt delete customer pos" on public.customer_pos
  for delete to authenticated using (private.is_mgmt(auth.uid()));
create trigger customer_pos_updated_at before update on public.customer_pos
  for each row execute function public.set_updated_at();
create index if not exists idx_customer_pos_customer on public.customer_pos (customer_id);
create index if not exists idx_customer_pos_quotation on public.customer_pos (quotation_id);

-- >>>>> migration: 20260828192915_159682ca-7053-406d-9342-30873d4b9c79.sql

CREATE TABLE public.boms (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  revision integer not null default 0,
  project_id uuid references public.projects(id) on delete set null,
  job_number_id uuid references public.job_numbers(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  title text not null default '',
  bom_type text not null default 'material',
  currency text not null default 'SAR',
  estimated_cost numeric not null default 0,
  stage text not null default 'bom_bos_preparation',
  status text not null default 'draft',
  notes text not null default '',
  prepared_by uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE public.bom_items (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references public.boms(id) on delete cascade,
  sequence integer not null default 0,
  description text not null default '',
  category text not null default '',
  unit text not null default 'pcs',
  quantity numeric not null default 0,
  unit_cost numeric not null default 0,
  amount numeric not null default 0,
  remarks text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  job_number_id uuid references public.job_numbers(id) on delete set null,
  sequence integer not null default 0,
  title text not null default '',
  description text not null default '',
  assigned_to uuid,
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  progress_percent integer not null default 0,
  priority text not null default 'normal',
  status text not null default 'planned',
  notes text not null default '',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.boms TO authenticated;
GRANT ALL ON public.boms TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bom_items TO authenticated;
GRANT ALL ON public.bom_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_tasks TO authenticated;
GRANT ALL ON public.project_tasks TO service_role;

ALTER TABLE public.boms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view boms" ON public.boms FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "pm or mgmt insert boms" ON public.boms FOR INSERT TO authenticated
  WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager'));
CREATE POLICY "pm or mgmt update boms" ON public.boms FOR UPDATE TO authenticated
  USING (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager'))
  WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager'));
CREATE POLICY "mgmt delete boms" ON public.boms FOR DELETE TO authenticated
  USING (private.is_mgmt(auth.uid()));

CREATE POLICY "staff view bom items" ON public.bom_items FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "pm or mgmt insert bom items" ON public.bom_items FOR INSERT TO authenticated
  WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager'));
CREATE POLICY "pm or mgmt update bom items" ON public.bom_items FOR UPDATE TO authenticated
  USING (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager'))
  WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager'));
CREATE POLICY "mgmt delete bom items" ON public.bom_items FOR DELETE TO authenticated
  USING (private.is_mgmt(auth.uid()));

CREATE POLICY "staff view project tasks" ON public.project_tasks FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "pm or mgmt insert project tasks" ON public.project_tasks FOR INSERT TO authenticated
  WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager'));
CREATE POLICY "pm or assignee update project tasks" ON public.project_tasks FOR UPDATE TO authenticated
  USING (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager') OR assigned_to = auth.uid())
  WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager') OR assigned_to = auth.uid());
CREATE POLICY "mgmt delete project tasks" ON public.project_tasks FOR DELETE TO authenticated
  USING (private.is_mgmt(auth.uid()));

CREATE TRIGGER boms_updated_at BEFORE UPDATE ON public.boms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bom_items_updated_at BEFORE UPDATE ON public.bom_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER project_tasks_updated_at BEFORE UPDATE ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- >>>>> migration: 20260828193541_0bdbed62-f52d-4c2e-ac2a-caf516a95362.sql

CREATE TABLE public.stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'pcs',
  quantity_on_hand numeric NOT NULL DEFAULT 0,
  quantity_reserved numeric NOT NULL DEFAULT 0,
  reorder_level numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  store_location text NOT NULL DEFAULT '',
  supplier text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_items TO authenticated;
GRANT ALL ON public.stock_items TO service_role;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_items_select" ON public.stock_items FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "stock_items_insert" ON public.stock_items FOR INSERT TO authenticated WITH CHECK (private.has_dept(auth.uid(),'inventory') OR private.has_dept(auth.uid(),'project_manager') OR private.is_mgmt(auth.uid()));
CREATE POLICY "stock_items_update" ON public.stock_items FOR UPDATE TO authenticated USING (private.has_dept(auth.uid(),'inventory') OR private.has_dept(auth.uid(),'project_manager') OR private.is_mgmt(auth.uid()));
CREATE POLICY "stock_items_delete" ON public.stock_items FOR DELETE TO authenticated USING (private.is_mgmt(auth.uid()));
CREATE TRIGGER stock_items_updated_at BEFORE UPDATE ON public.stock_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE UNIQUE INDEX stock_items_code_key ON public.stock_items (item_code) WHERE item_code <> '';

CREATE TABLE public.material_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  job_number_id uuid REFERENCES public.job_numbers(id) ON DELETE SET NULL,
  bom_id uuid REFERENCES public.boms(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  required_date date,
  site_location text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'material_planning',
  status text NOT NULL DEFAULT 'draft',
  notes text NOT NULL DEFAULT '',
  issued_by uuid,
  issued_at timestamptz,
  received_by text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_requests TO authenticated;
GRANT ALL ON public.material_requests TO service_role;
ALTER TABLE public.material_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_requests_select" ON public.material_requests FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "material_requests_insert" ON public.material_requests FOR INSERT TO authenticated WITH CHECK (private.has_dept(auth.uid(),'inventory') OR private.has_dept(auth.uid(),'project_manager') OR private.is_mgmt(auth.uid()));
CREATE POLICY "material_requests_update" ON public.material_requests FOR UPDATE TO authenticated USING (private.has_dept(auth.uid(),'inventory') OR private.has_dept(auth.uid(),'project_manager') OR private.is_mgmt(auth.uid()));
CREATE POLICY "material_requests_delete" ON public.material_requests FOR DELETE TO authenticated USING (private.is_mgmt(auth.uid()));
CREATE TRIGGER material_requests_updated_at BEFORE UPDATE ON public.material_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.material_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.material_requests(id) ON DELETE CASCADE,
  stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  sequence integer NOT NULL DEFAULT 1,
  description text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'pcs',
  quantity_requested numeric NOT NULL DEFAULT 0,
  quantity_allocated numeric NOT NULL DEFAULT 0,
  quantity_issued numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  remarks text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_request_items TO authenticated;
GRANT ALL ON public.material_request_items TO service_role;
ALTER TABLE public.material_request_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_request_items_select" ON public.material_request_items FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "material_request_items_insert" ON public.material_request_items FOR INSERT TO authenticated WITH CHECK (private.has_dept(auth.uid(),'inventory') OR private.has_dept(auth.uid(),'project_manager') OR private.is_mgmt(auth.uid()));
CREATE POLICY "material_request_items_update" ON public.material_request_items FOR UPDATE TO authenticated USING (private.has_dept(auth.uid(),'inventory') OR private.has_dept(auth.uid(),'project_manager') OR private.is_mgmt(auth.uid()));
CREATE POLICY "material_request_items_delete" ON public.material_request_items FOR DELETE TO authenticated USING (private.has_dept(auth.uid(),'inventory') OR private.has_dept(auth.uid(),'project_manager') OR private.is_mgmt(auth.uid()));
CREATE TRIGGER material_request_items_updated_at BEFORE UPDATE ON public.material_request_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  request_id uuid REFERENCES public.material_requests(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  job_number_id uuid REFERENCES public.job_numbers(id) ON DELETE SET NULL,
  movement_type text NOT NULL DEFAULT 'issue',
  description text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'pcs',
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  reference text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  moved_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_movements_select" ON public.stock_movements FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "stock_movements_insert" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (private.has_dept(auth.uid(),'inventory') OR private.has_dept(auth.uid(),'project_manager') OR private.is_mgmt(auth.uid()));

-- >>>>> migration: 20260828194212_6852e3b7-2312-47fe-bf7c-4b0933268595.sql

-- ============================ Phase 5: Site Execution ============================

CREATE TABLE public.daily_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL DEFAULT '',
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  job_number_id uuid REFERENCES public.job_numbers(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  site_location text NOT NULL DEFAULT '',
  work_description text NOT NULL DEFAULT '',
  manpower_count integer NOT NULL DEFAULT 0,
  hours_worked numeric NOT NULL DEFAULT 0,
  equipment_used text NOT NULL DEFAULT '',
  materials_consumed text NOT NULL DEFAULT '',
  progress_percent integer NOT NULL DEFAULT 0,
  issues text NOT NULL DEFAULT '',
  weather text NOT NULL DEFAULT '',
  supervisor text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'in_progress',
  status text NOT NULL DEFAULT 'submitted',
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_progress TO authenticated;
GRANT ALL ON public.daily_progress TO service_role;
ALTER TABLE public.daily_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view daily progress" ON public.daily_progress
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "site staff insert daily progress" ON public.daily_progress
  FOR INSERT TO authenticated WITH CHECK (
    private.has_dept(auth.uid(), 'technician') OR private.has_dept(auth.uid(), 'employee')
    OR private.has_dept(auth.uid(), 'project_manager') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "site staff update daily progress" ON public.daily_progress
  FOR UPDATE TO authenticated USING (
    private.has_dept(auth.uid(), 'technician') OR private.has_dept(auth.uid(), 'employee')
    OR private.has_dept(auth.uid(), 'project_manager') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "mgmt delete daily progress" ON public.daily_progress
  FOR DELETE TO authenticated USING (private.is_mgmt(auth.uid()));

CREATE TRIGGER daily_progress_updated_at BEFORE UPDATE ON public.daily_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.work_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL DEFAULT '',
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  job_number_id uuid REFERENCES public.job_numbers(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  site_location text NOT NULL DEFAULT '',
  completion_date date,
  scope_completed text NOT NULL DEFAULT '',
  snag_list text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  customer_confirmed boolean NOT NULL DEFAULT false,
  customer_name text NOT NULL DEFAULT '',
  customer_designation text NOT NULL DEFAULT '',
  customer_confirmed_at timestamptz,
  stage text NOT NULL DEFAULT 'service_report',
  status text NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_completions TO authenticated;
GRANT ALL ON public.work_completions TO service_role;
ALTER TABLE public.work_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view work completions" ON public.work_completions
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "site staff insert work completions" ON public.work_completions
  FOR INSERT TO authenticated WITH CHECK (
    private.has_dept(auth.uid(), 'technician') OR private.has_dept(auth.uid(), 'employee')
    OR private.has_dept(auth.uid(), 'project_manager') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "site staff update work completions" ON public.work_completions
  FOR UPDATE TO authenticated USING (
    private.has_dept(auth.uid(), 'technician') OR private.has_dept(auth.uid(), 'employee')
    OR private.has_dept(auth.uid(), 'project_manager') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "mgmt delete work completions" ON public.work_completions
  FOR DELETE TO authenticated USING (private.is_mgmt(auth.uid()));

CREATE TRIGGER work_completions_updated_at BEFORE UPDATE ON public.work_completions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_daily_progress_project ON public.daily_progress(project_id);
CREATE INDEX idx_daily_progress_job ON public.daily_progress(job_number_id);
CREATE INDEX idx_work_completions_project ON public.work_completions(project_id);


-- >>>>> migration: 20260828194725_8a3a9330-e71a-46df-abd0-2b70d90d7bef.sql

-- ======================= Phase 6: Accounts & Closure =======================

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL DEFAULT '',
  invoice_number text NOT NULL DEFAULT '',
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  job_number_id uuid REFERENCES public.job_numbers(id) ON DELETE SET NULL,
  quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  invoice_type text NOT NULL DEFAULT 'final',
  invoice_date date,
  due_date date,
  currency text NOT NULL DEFAULT 'SAR',
  subtotal numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  vat_percent numeric NOT NULL DEFAULT 15,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  payment_terms text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'billing',
  status text NOT NULL DEFAULT 'draft',
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view invoices" ON public.invoices
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "accounts insert invoices" ON public.invoices
  FOR INSERT TO authenticated WITH CHECK (
    private.has_dept(auth.uid(), 'accounts') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "accounts update invoices" ON public.invoices
  FOR UPDATE TO authenticated USING (
    private.has_dept(auth.uid(), 'accounts') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "mgmt delete invoices" ON public.invoices
  FOR DELETE TO authenticated USING (private.is_mgmt(auth.uid()));

CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 1,
  description text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'pcs',
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view invoice items" ON public.invoice_items
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "accounts insert invoice items" ON public.invoice_items
  FOR INSERT TO authenticated WITH CHECK (
    private.has_dept(auth.uid(), 'accounts') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "accounts update invoice items" ON public.invoice_items
  FOR UPDATE TO authenticated USING (
    private.has_dept(auth.uid(), 'accounts') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "mgmt delete invoice items" ON public.invoice_items
  FOR DELETE TO authenticated USING (
    private.has_dept(auth.uid(), 'accounts') OR private.is_mgmt(auth.uid())
  );

CREATE TRIGGER invoice_items_updated_at BEFORE UPDATE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  method text NOT NULL DEFAULT 'bank_transfer',
  reference text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view payments" ON public.payments
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "accounts insert payments" ON public.payments
  FOR INSERT TO authenticated WITH CHECK (
    private.has_dept(auth.uid(), 'accounts') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "accounts update payments" ON public.payments
  FOR UPDATE TO authenticated USING (
    private.has_dept(auth.uid(), 'accounts') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "mgmt delete payments" ON public.payments
  FOR DELETE TO authenticated USING (private.is_mgmt(auth.uid()));

CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX idx_invoices_project ON public.invoices(project_id);


-- >>>>> migration: 20260828225237_ed78eb57-4722-499a-9429-732494a36d65.sql

-- role helper
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- customer number
alter table public.customers add column if not exists customer_number text not null default '';
create sequence if not exists public.customer_number_seq;
update public.customers set customer_number = 'CUST-' || lpad(nextval('public.customer_number_seq')::text, 4, '0') where customer_number = '';

-- job number detail
alter table public.job_numbers add column if not exists job_kind text not null default 'installation';
alter table public.job_numbers add column if not exists maintenance_interval_months integer;
alter table public.job_numbers add column if not exists bom_id uuid references public.boms(id);
alter table public.job_numbers add column if not exists pm_approved_by uuid;
alter table public.job_numbers add column if not exists pm_approved_at timestamptz;

create table if not exists public.job_installation_steps (
  id uuid primary key default gen_random_uuid(),
  job_number_id uuid not null references public.job_numbers(id) on delete cascade,
  sequence integer not null default 1,
  title text not null default '',
  expected_date date,
  completed_date date,
  status text not null default 'pending',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.job_installation_steps to authenticated;
grant all on public.job_installation_steps to service_role;
alter table public.job_installation_steps enable row level security;
create policy "steps readable" on public.job_installation_steps for select to authenticated using (true);
create policy "steps insert" on public.job_installation_steps for insert to authenticated with check (true);
create policy "steps update" on public.job_installation_steps for update to authenticated using (true);
create policy "steps delete" on public.job_installation_steps for delete to authenticated using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'project_manager') or public.has_role(auth.uid(),'technician'));
create trigger job_installation_steps_updated_at before update on public.job_installation_steps for each row execute function public.set_updated_at();

-- stock receipts (supplier / price / qty per item code)
create table if not exists public.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid references public.stock_items(id) on delete cascade,
  supplier text not null default '',
  quantity numeric not null default 0,
  unit_cost numeric not null default 0,
  currency text not null default 'BHD',
  reference text not null default '',
  received_at date not null default current_date,
  remarks text not null default '',
  created_by uuid not null,
  created_at timestamptz not null default now()
);
grant select, insert on public.stock_receipts to authenticated;
grant all on public.stock_receipts to service_role;
alter table public.stock_receipts enable row level security;
create policy "receipts readable" on public.stock_receipts for select to authenticated using (true);
create policy "receipts insert" on public.stock_receipts for insert to authenticated with check (auth.uid() = created_by);

-- suppliers
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  payment_terms text not null default '',
  status text not null default 'active',
  notes text not null default '',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.suppliers to authenticated;
grant all on public.suppliers to service_role;
alter table public.suppliers enable row level security;
create policy "suppliers readable" on public.suppliers for select to authenticated using (true);
create policy "suppliers write" on public.suppliers for insert to authenticated with check (public.has_role(auth.uid(),'accounts') or public.has_role(auth.uid(),'admin'));
create policy "suppliers update" on public.suppliers for update to authenticated using (public.has_role(auth.uid(),'accounts') or public.has_role(auth.uid(),'admin'));
create policy "suppliers delete" on public.suppliers for delete to authenticated using (public.has_role(auth.uid(),'admin'));
create trigger suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();

-- supplier invoices (payables)
create table if not exists public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  reference text not null default '',
  supplier_id uuid references public.suppliers(id),
  project_id uuid references public.projects(id),
  job_number_id uuid references public.job_numbers(id),
  invoice_number text not null default '',
  invoice_date date,
  due_date date,
  currency text not null default 'BHD',
  amount numeric not null default 0,
  amount_paid numeric not null default 0,
  status text not null default 'open',
  notes text not null default '',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.supplier_invoices to authenticated;
grant all on public.supplier_invoices to service_role;
alter table public.supplier_invoices enable row level security;
create policy "sinv readable" on public.supplier_invoices for select to authenticated using (true);
create policy "sinv write" on public.supplier_invoices for insert to authenticated with check (public.has_role(auth.uid(),'accounts') or public.has_role(auth.uid(),'admin'));
create policy "sinv update" on public.supplier_invoices for update to authenticated using (public.has_role(auth.uid(),'accounts') or public.has_role(auth.uid(),'admin'));
create trigger supplier_invoices_updated_at before update on public.supplier_invoices for each row execute function public.set_updated_at();

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid references public.supplier_invoices(id),
  supplier_id uuid references public.suppliers(id),
  payment_date date not null default current_date,
  amount numeric not null default 0,
  currency text not null default 'BHD',
  method text not null default '',
  reference text not null default '',
  remarks text not null default '',
  approved boolean not null default false,
  recorded_by uuid not null,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.supplier_payments to authenticated;
grant all on public.supplier_payments to service_role;
alter table public.supplier_payments enable row level security;
create policy "spay readable" on public.supplier_payments for select to authenticated using (true);
create policy "spay write" on public.supplier_payments for insert to authenticated with check (public.has_role(auth.uid(),'accounts') or public.has_role(auth.uid(),'admin'));
create policy "spay update" on public.supplier_payments for update to authenticated using (public.has_role(auth.uid(),'accounts') or public.has_role(auth.uid(),'admin'));

-- project costs
create table if not exists public.project_costs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id),
  job_number_id uuid references public.job_numbers(id),
  cost_type text not null default 'material',
  description text not null default '',
  amount numeric not null default 0,
  currency text not null default 'BHD',
  source text not null default 'manual',
  reference text not null default '',
  incurred_on date not null default current_date,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.project_costs to authenticated;
grant all on public.project_costs to service_role;
alter table public.project_costs enable row level security;
create policy "pcost readable" on public.project_costs for select to authenticated using (true);
create policy "pcost write" on public.project_costs for insert to authenticated with check (true);
create policy "pcost update" on public.project_costs for update to authenticated using (public.has_role(auth.uid(),'accounts') or public.has_role(auth.uid(),'admin'));

-- credit / debit notes
create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  reference text not null default '',
  note_type text not null default 'credit',
  invoice_id uuid references public.invoices(id),
  customer_id uuid references public.customers(id),
  amount numeric not null default 0,
  currency text not null default 'BHD',
  reason text not null default '',
  status text not null default 'draft',
  note_date date not null default current_date,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.credit_notes to authenticated;
grant all on public.credit_notes to service_role;
alter table public.credit_notes enable row level security;
create policy "cnote readable" on public.credit_notes for select to authenticated using (true);
create policy "cnote write" on public.credit_notes for insert to authenticated with check (public.has_role(auth.uid(),'accounts') or public.has_role(auth.uid(),'admin'));
create policy "cnote update" on public.credit_notes for update to authenticated using (public.has_role(auth.uid(),'accounts') or public.has_role(auth.uid(),'admin'));
create trigger credit_notes_updated_at before update on public.credit_notes for each row execute function public.set_updated_at();

-- invoice <-> customer PO link
alter table public.invoices add column if not exists customer_po_id uuid references public.customer_pos(id);

-- currency: SAR -> BHD
alter table public.projects alter column currency set default 'BHD';
alter table public.quotations alter column currency set default 'BHD';
alter table public.invoices alter column currency set default 'BHD';
alter table public.boms alter column currency set default 'BHD';
alter table public.customer_pos alter column currency set default 'BHD';
alter table public.payments alter column currency set default 'BHD';
update public.projects set currency = 'BHD' where currency in ('SAR','');
update public.quotations set currency = 'BHD' where currency in ('SAR','');
update public.invoices set currency = 'BHD' where currency in ('SAR','');
update public.boms set currency = 'BHD' where currency in ('SAR','');
update public.customer_pos set currency = 'BHD' where currency in ('SAR','');
update public.payments set currency = 'BHD' where currency in ('SAR','');

-- >>>>> migration: 20260828225248_e9362818-2e1e-41c2-913b-61cb6e5e0cae.sql

revoke all on function public.has_role(uuid, app_role) from public, anon;
grant execute on function public.has_role(uuid, app_role) to authenticated, service_role;

-- >>>>> migration: 20260828225334_fbbcbe90-a7aa-4d1e-9a59-a5dca9c5b3fa.sql

-- reuse the existing private helpers instead of a new public one
drop policy if exists "steps delete" on public.job_installation_steps;
create policy "steps delete" on public.job_installation_steps for delete to authenticated
  using (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'project_manager') or private.has_dept(auth.uid(),'technician'));

drop policy if exists "suppliers write" on public.suppliers;
drop policy if exists "suppliers update" on public.suppliers;
drop policy if exists "suppliers delete" on public.suppliers;
create policy "suppliers write" on public.suppliers for insert to authenticated with check (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));
create policy "suppliers update" on public.suppliers for update to authenticated using (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));
create policy "suppliers delete" on public.suppliers for delete to authenticated using (private.is_mgmt(auth.uid()));

drop policy if exists "sinv write" on public.supplier_invoices;
drop policy if exists "sinv update" on public.supplier_invoices;
create policy "sinv write" on public.supplier_invoices for insert to authenticated with check (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));
create policy "sinv update" on public.supplier_invoices for update to authenticated using (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));

drop policy if exists "spay write" on public.supplier_payments;
drop policy if exists "spay update" on public.supplier_payments;
create policy "spay write" on public.supplier_payments for insert to authenticated with check (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));
create policy "spay update" on public.supplier_payments for update to authenticated using (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));

drop policy if exists "pcost update" on public.project_costs;
create policy "pcost update" on public.project_costs for update to authenticated using (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));

drop policy if exists "cnote write" on public.credit_notes;
drop policy if exists "cnote update" on public.credit_notes;
create policy "cnote write" on public.credit_notes for insert to authenticated with check (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));
create policy "cnote update" on public.credit_notes for update to authenticated using (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));

drop function if exists public.has_role(uuid, app_role);

-- sign-up may self-assign its chosen department (never admin); account stays pending
drop policy if exists "self insert employee role" on public.user_roles;
create policy "self insert own department role" on public.user_roles for insert to authenticated
  with check (user_id = auth.uid() and role <> 'admin'::app_role);

-- >>>>> migration: 20260828233239_ca2051c8-ee91-4903-878b-eda0f40500ea.sql

CREATE TABLE public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null default '',
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.units_of_measure TO authenticated;
GRANT ALL ON public.units_of_measure TO service_role;

ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uom_select" ON public.units_of_measure FOR SELECT TO authenticated USING (true);
CREATE POLICY "uom_insert" ON public.units_of_measure FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'project_manager') OR private.has_role(auth.uid(), 'admin'));
CREATE POLICY "uom_update" ON public.units_of_measure FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'project_manager') OR private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'project_manager') OR private.has_role(auth.uid(), 'admin'));
CREATE POLICY "uom_delete" ON public.units_of_measure FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'project_manager') OR private.has_role(auth.uid(), 'admin'));

CREATE TRIGGER units_of_measure_updated_at BEFORE UPDATE ON public.units_of_measure FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS approval_status text not null default 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

UPDATE public.stock_items SET approval_status = 'approved' WHERE approval_status = 'pending';

ALTER TABLE public.bom_items
  ADD COLUMN IF NOT EXISTS stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL;

INSERT INTO public.units_of_measure (code, name) VALUES
  ('pcs','Piece'),
  ('m','Meter'),
  ('kg','Kilogram'),
  ('set','Set'),
  ('box','Box'),
  ('ltr','Litre'),
  ('roll','Roll'),
  ('hr','Hour'),
  ('lot','Lot')
ON CONFLICT (code) DO NOTHING;

-- >>>>> migration: 20260830094425_66ac03fe-cca0-42b5-af86-840555d7a82d.sql

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS cr_cpr_number text NOT NULL DEFAULT '';

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS bom_id uuid REFERENCES public.boms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS material_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labour_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inland_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inland_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margin_percent numeric NOT NULL DEFAULT 0;

-- >>>>> migration: 20260830130250_ad5b146f-e9e9-49e5-bcf8-1b5e7e626562.sql

DROP POLICY IF EXISTS "pm or mgmt insert projects" ON public.projects;
CREATE POLICY "pm sales or mgmt insert projects" ON public.projects
FOR INSERT TO authenticated
WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(), 'project_manager') OR private.has_dept(auth.uid(), 'sales'));

DROP POLICY IF EXISTS "pm or mgmt update projects" ON public.projects;
CREATE POLICY "pm sales or mgmt update projects" ON public.projects
FOR UPDATE TO authenticated
USING (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(), 'project_manager') OR private.has_dept(auth.uid(), 'sales') OR project_manager_id = auth.uid())
WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(), 'project_manager') OR private.has_dept(auth.uid(), 'sales') OR project_manager_id = auth.uid());

GRANT DELETE ON public.approvals TO authenticated;
DROP POLICY IF EXISTS "mgmt delete approvals" ON public.approvals;
CREATE POLICY "mgmt delete approvals" ON public.approvals
FOR DELETE TO authenticated
USING (private.is_mgmt(auth.uid()));

-- >>>>> migration: 20260830133136_0190b221-98f8-44f6-9191-aabfa6c0b82b.sql

-- BOMs: allow sales alongside project managers
DROP POLICY IF EXISTS "pm or mgmt insert boms" ON public.boms;
CREATE POLICY "pm sales or mgmt insert boms" ON public.boms FOR INSERT TO authenticated
WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales'));

DROP POLICY IF EXISTS "pm or mgmt update boms" ON public.boms;
CREATE POLICY "pm sales or mgmt update boms" ON public.boms FOR UPDATE TO authenticated
USING (private.is_mgmt(auth.uid()) OR ((private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales')) AND status <> 'approved'))
WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales'));

DROP POLICY IF EXISTS "mgmt delete boms" ON public.boms;
CREATE POLICY "pm sales or mgmt delete boms" ON public.boms FOR DELETE TO authenticated
USING (private.is_mgmt(auth.uid()) OR ((private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales')) AND status <> 'approved'));

DROP POLICY IF EXISTS "pm or mgmt insert bom items" ON public.bom_items;
CREATE POLICY "pm sales or mgmt insert bom items" ON public.bom_items FOR INSERT TO authenticated
WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales'));

DROP POLICY IF EXISTS "pm or mgmt update bom items" ON public.bom_items;
CREATE POLICY "pm sales or mgmt update bom items" ON public.bom_items FOR UPDATE TO authenticated
USING (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales'))
WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales'));

DROP POLICY IF EXISTS "mgmt delete bom items" ON public.bom_items;
CREATE POLICY "pm sales or mgmt delete bom items" ON public.bom_items FOR DELETE TO authenticated
USING (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales'));

-- Sales may delete their own not-yet-approved sales records
DROP POLICY IF EXISTS "mgmt delete quotations" ON public.quotations;
CREATE POLICY "sales or mgmt delete quotations" ON public.quotations FOR DELETE TO authenticated
USING (private.is_mgmt(auth.uid()) OR (private.has_dept(auth.uid(),'sales') AND status NOT IN ('approved','accepted','closed')));

DROP POLICY IF EXISTS "mgmt delete inquiries" ON public.inquiries;
CREATE POLICY "sales or mgmt delete inquiries" ON public.inquiries FOR DELETE TO authenticated
USING (private.is_mgmt(auth.uid()) OR (private.has_dept(auth.uid(),'sales') AND status NOT IN ('approved','closed')));

DROP POLICY IF EXISTS "mgmt delete customer pos" ON public.customer_pos;
CREATE POLICY "sales or mgmt delete customer pos" ON public.customer_pos FOR DELETE TO authenticated
USING (private.is_mgmt(auth.uid()) OR (private.has_dept(auth.uid(),'sales') AND verification_status <> 'verified'));

-- Approvals are private to the requester and Management
DROP POLICY IF EXISTS "staff view approvals" ON public.approvals;
CREATE POLICY "requester or mgmt view approvals" ON public.approvals FOR SELECT TO authenticated
USING (private.is_mgmt(auth.uid()) OR submitted_by = auth.uid());

-- >>>>> migration: 20260830143845_0ab599e6-36f5-40f7-b7f6-04d340b186c3.sql

drop policy if exists "mgmt delete projects" on public.projects;
create policy "sales pm or mgmt delete projects" on public.projects for delete to authenticated
using (
  private.is_mgmt(auth.uid())
  or ((private.has_dept(auth.uid(), 'sales') or private.has_dept(auth.uid(), 'project_manager')) and status <> 'closed')
);

drop policy if exists "mgmt delete customers" on public.customers;
create policy "sales or mgmt delete customers" on public.customers for delete to authenticated
using (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(), 'sales'));

-- >>>>> migration: 20260831091022_fd152e2a-32fe-4fe1-81ea-d252def930d6.sql

-- item image
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '';

-- allow the creator to remove a freshly created item within 24 hours
DROP POLICY IF EXISTS stock_items_delete ON public.stock_items;
CREATE POLICY stock_items_delete ON public.stock_items FOR DELETE TO authenticated
USING (
  private.is_mgmt(auth.uid())
  OR (created_by = auth.uid() AND created_at > now() - interval '24 hours' AND approval_status <> 'approved')
);

-- ============================================================ stock lots ===
CREATE TABLE IF NOT EXISTS public.stock_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_number text NOT NULL DEFAULT '',
  supplier text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  received_date date,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  total_value numeric NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_lot_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.stock_lots(id) ON DELETE CASCADE,
  stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  sequence integer NOT NULL DEFAULT 1,
  description text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'pcs',
  supplier text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  store_location text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_lots TO authenticated;
GRANT ALL ON public.stock_lots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_lot_items TO authenticated;
GRANT ALL ON public.stock_lot_items TO service_role;

ALTER TABLE public.stock_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_lot_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_lots_select ON public.stock_lots FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY stock_lots_insert ON public.stock_lots FOR INSERT TO authenticated
  WITH CHECK (private.has_dept(auth.uid(),'inventory') OR private.is_mgmt(auth.uid()));
CREATE POLICY stock_lots_update ON public.stock_lots FOR UPDATE TO authenticated
  USING (private.has_dept(auth.uid(),'inventory') OR private.is_mgmt(auth.uid()));
CREATE POLICY stock_lots_delete ON public.stock_lots FOR DELETE TO authenticated
  USING (private.is_mgmt(auth.uid()) OR (created_by = auth.uid() AND status = 'draft'));

CREATE POLICY stock_lot_items_select ON public.stock_lot_items FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY stock_lot_items_insert ON public.stock_lot_items FOR INSERT TO authenticated
  WITH CHECK (private.has_dept(auth.uid(),'inventory') OR private.is_mgmt(auth.uid()));
CREATE POLICY stock_lot_items_update ON public.stock_lot_items FOR UPDATE TO authenticated
  USING (private.has_dept(auth.uid(),'inventory') OR private.is_mgmt(auth.uid()));
CREATE POLICY stock_lot_items_delete ON public.stock_lot_items FOR DELETE TO authenticated
  USING (private.has_dept(auth.uid(),'inventory') OR private.is_mgmt(auth.uid()));

CREATE TRIGGER stock_lots_updated_at BEFORE UPDATE ON public.stock_lots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER stock_lot_items_updated_at BEFORE UPDATE ON public.stock_lot_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =================================================== job number remarks ====
CREATE TABLE IF NOT EXISTS public.job_item_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number_id uuid NOT NULL REFERENCES public.job_numbers(id) ON DELETE CASCADE,
  bom_item_id uuid REFERENCES public.bom_items(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 1,
  description text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  remarks text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_item_remarks TO authenticated;
GRANT ALL ON public.job_item_remarks TO service_role;
ALTER TABLE public.job_item_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_item_remarks_select ON public.job_item_remarks FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY job_item_remarks_insert ON public.job_item_remarks FOR INSERT TO authenticated
  WITH CHECK (private.has_dept(auth.uid(),'inventory') OR private.has_dept(auth.uid(),'project_manager') OR private.is_mgmt(auth.uid()));
CREATE POLICY job_item_remarks_update ON public.job_item_remarks FOR UPDATE TO authenticated
  USING (private.has_dept(auth.uid(),'inventory') OR private.has_dept(auth.uid(),'project_manager') OR private.is_mgmt(auth.uid()));
CREATE POLICY job_item_remarks_delete ON public.job_item_remarks FOR DELETE TO authenticated
  USING (private.is_mgmt(auth.uid()));

CREATE TRIGGER job_item_remarks_updated_at BEFORE UPDATE ON public.job_item_remarks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- >>>>> migration: 20260831091047_f936485b-0405-41c7-aad2-b901db2590c6.sql

CREATE POLICY "item_images_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'item-images');
CREATE POLICY "item_images_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'item-images');
CREATE POLICY "item_images_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'item-images');
CREATE POLICY "item_images_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'item-images' AND owner = auth.uid());

-- >>>>> migration: 20260831105757_5e8b5992-b9db-4e61-8b6b-bfad735e2b2b.sql

CREATE TABLE public.stock_releases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reference text NOT NULL DEFAULT '',
  release_kind text NOT NULL DEFAULT 'job',
  job_number_id uuid REFERENCES public.job_numbers(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  released_to text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  total_value numeric NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  released_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_releases TO authenticated;
GRANT ALL ON public.stock_releases TO service_role;
ALTER TABLE public.stock_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view stock releases" ON public.stock_releases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can create stock releases" ON public.stock_releases
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Staff can update stock releases" ON public.stock_releases
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Management can delete stock releases" ON public.stock_releases
  FOR DELETE TO authenticated USING (
    auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );

CREATE TABLE public.stock_release_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  release_id uuid NOT NULL REFERENCES public.stock_releases(id) ON DELETE CASCADE,
  stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  bom_item_id uuid REFERENCES public.bom_items(id) ON DELETE SET NULL,
  sequence integer NOT NULL DEFAULT 1,
  description text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  remarks text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_release_items TO authenticated;
GRANT ALL ON public.stock_release_items TO service_role;
ALTER TABLE public.stock_release_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view stock release items" ON public.stock_release_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can create stock release items" ON public.stock_release_items
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update stock release items" ON public.stock_release_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff can delete stock release items" ON public.stock_release_items
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER stock_releases_updated_at BEFORE UPDATE ON public.stock_releases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER stock_release_items_updated_at BEFORE UPDATE ON public.stock_release_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- >>>>> migration: 20260902203341_b8241a3a-bf70-49fa-892b-9e5e0b1b4c8c.sql

ALTER TABLE public.job_numbers
  ADD COLUMN IF NOT EXISTS customer_po_id uuid;

ALTER TABLE public.job_numbers
  DROP CONSTRAINT IF EXISTS job_numbers_customer_po_id_fkey;

ALTER TABLE public.job_numbers
  ADD CONSTRAINT job_numbers_customer_po_id_fkey
  FOREIGN KEY (customer_po_id) REFERENCES public.customer_pos(id);

-- >>>>> migration: 20260902203557_0aad1a5c-6d75-4704-a06b-63521716e57b.sql

DROP POLICY IF EXISTS "requester or mgmt view approvals" ON public.approvals;
CREATE POLICY "requester pm item or mgmt view approvals" ON public.approvals
FOR SELECT TO authenticated
USING (
  private.is_mgmt(auth.uid())
  OR submitted_by = auth.uid()
  OR (entity_table = 'stock_items' AND private.has_dept(auth.uid(), 'project_manager'))
);

DROP POLICY IF EXISTS "pm or mgmt insert job numbers" ON public.job_numbers;
CREATE POLICY "technician pm or mgmt insert job numbers" ON public.job_numbers
FOR INSERT TO authenticated
WITH CHECK (
  private.is_mgmt(auth.uid())
  OR private.has_dept(auth.uid(), 'project_manager')
  OR private.has_dept(auth.uid(), 'technician')
);

DROP POLICY IF EXISTS "pm or mgmt update job numbers" ON public.job_numbers;
CREATE POLICY "technician pm or mgmt update job numbers" ON public.job_numbers
FOR UPDATE TO authenticated
USING (
  private.is_mgmt(auth.uid())
  OR private.has_dept(auth.uid(), 'project_manager')
  OR private.has_dept(auth.uid(), 'technician')
)
WITH CHECK (
  private.is_mgmt(auth.uid())
  OR private.has_dept(auth.uid(), 'project_manager')
  OR private.has_dept(auth.uid(), 'technician')
);

DROP POLICY IF EXISTS "stock_items_insert" ON public.stock_items;
CREATE POLICY "stock_items_insert" ON public.stock_items
FOR INSERT TO authenticated
WITH CHECK (
  private.has_dept(auth.uid(), 'inventory')
  OR private.has_dept(auth.uid(), 'project_manager')
  OR private.has_dept(auth.uid(), 'technician')
  OR private.is_mgmt(auth.uid())
);

DROP POLICY IF EXISTS "stock_items_update" ON public.stock_items;
CREATE POLICY "stock_items_update" ON public.stock_items
FOR UPDATE TO authenticated
USING (
  private.has_dept(auth.uid(), 'inventory')
  OR private.has_dept(auth.uid(), 'project_manager')
  OR private.has_dept(auth.uid(), 'technician')
  OR private.is_mgmt(auth.uid())
)
WITH CHECK (
  private.has_dept(auth.uid(), 'inventory')
  OR private.has_dept(auth.uid(), 'project_manager')
  OR private.has_dept(auth.uid(), 'technician')
  OR private.is_mgmt(auth.uid())
);

-- >>>>> migration: 20260905163658_b96fc285-6fa8-4c56-91ac-afe5cbfea9e6.sql

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

UPDATE public.suppliers SET approval_status = 'approved', approved_at = now() WHERE approval_status = 'pending';

ALTER TABLE public.stock_lot_items
  ADD COLUMN IF NOT EXISTS reference text NOT NULL DEFAULT '';

DROP POLICY IF EXISTS "suppliers write" ON public.suppliers;
CREATE POLICY "suppliers write" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_dept(auth.uid(), 'accounts')
    OR private.has_dept(auth.uid(), 'project_manager')
    OR private.is_mgmt(auth.uid())
  );

DROP POLICY IF EXISTS "suppliers update" ON public.suppliers;
CREATE POLICY "suppliers update" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (
    private.has_dept(auth.uid(), 'accounts')
    OR private.is_mgmt(auth.uid())
    OR (private.has_dept(auth.uid(), 'project_manager') AND approval_status <> 'approved')
  );

-- >>>>> migration: 20260905174611_db4e386a-abf8-4cf3-bf7d-568a9a5733bc.sql

create or replace function public.users_with_roles(_roles text[])
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select ur.user_id from public.user_roles ur
  where ur.role::text = any(_roles)
$$;

grant execute on function public.users_with_roles(text[]) to authenticated, service_role;

-- >>>>> migration: 20260905174630_5673676b-11b4-4ffe-adad-58c049f01982.sql

drop function if exists public.users_with_roles(text[]);

create policy "staff view all roles"
on public.user_roles
for select
to authenticated
using (private.is_staff(auth.uid()));
