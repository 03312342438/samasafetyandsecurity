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