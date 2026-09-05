-- =============================================================================
-- ONE-TIME DATABASE SETUP FOR YOUR OWN SUPABASE PROJECT
-- =============================================================================
-- Run this ENTIRE file once in your own Supabase project:
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- It recreates the full schema (tables, roles, RLS policies, security-definer
-- functions) that the app needs. Safe to run on a brand-new empty project.
-- =============================================================================

-- ----- Roles enum ------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'employee');
exception when duplicate_object then null; end $$;

-- ----- profiles --------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  designation text not null default '',
  email text,
  created_at timestamptz not null default now(),
  status text not null default 'pending',
  hidden boolean not null default false
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- ----- user_roles ------------------------------------------------------------
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- ----- security definer helpers ---------------------------------------------
-- Created in a PRIVATE schema so the Data API cannot call them directly.
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create or replace function private.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
revoke all on function private.has_role(uuid, public.app_role) from public, anon;
grant execute on function private.has_role(uuid, public.app_role) to authenticated, service_role;

create or replace function public.admin_exists()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where role = 'admin')
$$;
revoke execute on function public.admin_exists() from public, anon, authenticated;
grant execute on function public.admin_exists() to service_role;

-- ----- profiles policies -----------------------------------------------------
drop policy if exists "view own or admin profiles" on public.profiles;
create policy "view own or admin profiles" on public.profiles
  for select to authenticated
  using (id = auth.uid() or private.has_role(auth.uid(),'admin'));

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid());

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- ----- user_roles policies ---------------------------------------------------
drop policy if exists "view own or admin roles" on public.user_roles;
create policy "view own or admin roles" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or private.has_role(auth.uid(),'admin'));

-- ----- reports ---------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  client_name text,
  contract text,
  order_no text,
  project text,
  site_location text,
  msr_no text,
  our_ref_no text,
  report_date date,
  devices jsonb not null default '{}'::jsonb,
  spare_parts jsonb not null default '[]'::jsonb,
  action_taken text,
  remarks text,
  performed_by text,
  employee_signature text,
  client_signature text,
  client_sign_name text,
  client_designation text,
  date_completed date,
  next_maintenance text not null default '',
  maintenance_count text not null default '',
  client_email text not null default '',
  maintenance_interval_value integer,
  maintenance_interval_unit text not null default 'months',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.reports to authenticated;
grant all on public.reports to service_role;
alter table public.reports enable row level security;

drop policy if exists "manage own or admin view reports" on public.reports;
create policy "manage own or admin view reports" on public.reports
  for select to authenticated
  using (created_by = auth.uid() or private.has_role(auth.uid(),'admin'));

drop policy if exists "insert own reports" on public.reports;
create policy "insert own reports" on public.reports
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "update own or admin reports" on public.reports;
create policy "update own or admin reports" on public.reports
  for update to authenticated
  using (created_by = auth.uid() or private.has_role(auth.uid(), 'admin'))
  with check (created_by = auth.uid() or private.has_role(auth.uid(), 'admin'));

drop policy if exists "delete own or admin reports" on public.reports;
create policy "delete own or admin reports" on public.reports
  for delete to authenticated
  using (created_by = auth.uid() or private.has_role(auth.uid(), 'admin'));

-- ----- report_recipients -----------------------------------------------------
create table if not exists public.report_recipients (
  id uuid not null default gen_random_uuid() primary key,
  email text not null,
  label text not null default '',
  created_at timestamptz not null default now(),
  unique (email)
);
grant select, insert, update, delete on public.report_recipients to authenticated;
grant all on public.report_recipients to service_role;
alter table public.report_recipients enable row level security;

drop policy if exists "admins can view recipients" on public.report_recipients;
create policy "admins can view recipients" on public.report_recipients
  for select to authenticated using (private.has_role(auth.uid(), 'admin'));

drop policy if exists "admins can add recipients" on public.report_recipients;
create policy "admins can add recipients" on public.report_recipients
  for insert to authenticated with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "admins can update recipients" on public.report_recipients;
create policy "admins can update recipients" on public.report_recipients
  for update to authenticated
  using (private.has_role(auth.uid(), 'admin'))
  with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "admins can delete recipients" on public.report_recipients;
create policy "admins can delete recipients" on public.report_recipients
  for delete to authenticated using (private.has_role(auth.uid(), 'admin'));

-- ----- maintenance_tasks -----------------------------------------------------
create table if not exists public.maintenance_tasks (
  id uuid not null default gen_random_uuid() primary key,
  report_id uuid not null references public.reports(id) on delete cascade,
  created_by uuid not null,
  sequence integer not null,
  due_date date not null,
  status text not null default 'pending',
  completed_at timestamptz,
  reminder_2day_sent_at timestamptz,
  reminder_due_sent_at timestamptz,
  client_name text not null default '',
  project text not null default '',
  site_location text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.maintenance_tasks to authenticated;
grant all on public.maintenance_tasks to service_role;
alter table public.maintenance_tasks enable row level security;

drop policy if exists "view own or admin tasks" on public.maintenance_tasks;
create policy "view own or admin tasks" on public.maintenance_tasks
  for select to authenticated
  using ((created_by = auth.uid()) or private.has_role(auth.uid(), 'admin'));

drop policy if exists "insert own tasks" on public.maintenance_tasks;
create policy "insert own tasks" on public.maintenance_tasks
  for insert to authenticated
  with check ((created_by = auth.uid()) or private.has_role(auth.uid(), 'admin'));

drop policy if exists "update own or admin tasks" on public.maintenance_tasks;
create policy "update own or admin tasks" on public.maintenance_tasks
  for update to authenticated
  using ((created_by = auth.uid()) or private.has_role(auth.uid(), 'admin'))
  with check ((created_by = auth.uid()) or private.has_role(auth.uid(), 'admin'));

drop policy if exists "delete own or admin tasks" on public.maintenance_tasks;
create policy "delete own or admin tasks" on public.maintenance_tasks
  for delete to authenticated
  using ((created_by = auth.uid()) or private.has_role(auth.uid(), 'admin'));

create index if not exists idx_maintenance_tasks_due on public.maintenance_tasks (due_date, status);
create index if not exists idx_maintenance_tasks_created_by on public.maintenance_tasks (created_by);
create index if not exists idx_maintenance_tasks_report on public.maintenance_tasks (report_id);

-- ----- maintenance_reminder_emails ------------------------------------------
create table if not exists public.maintenance_reminder_emails (
  id uuid not null default gen_random_uuid() primary key,
  email text not null,
  label text not null default '',
  created_at timestamptz not null default now(),
  unique (email)
);
grant select, insert, update, delete on public.maintenance_reminder_emails to authenticated;
grant all on public.maintenance_reminder_emails to service_role;
alter table public.maintenance_reminder_emails enable row level security;

drop policy if exists "admins can view reminder emails" on public.maintenance_reminder_emails;
create policy "admins can view reminder emails" on public.maintenance_reminder_emails
  for select to authenticated using (private.has_role(auth.uid(), 'admin'));

drop policy if exists "admins can add reminder emails" on public.maintenance_reminder_emails;
create policy "admins can add reminder emails" on public.maintenance_reminder_emails
  for insert to authenticated with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "admins can update reminder emails" on public.maintenance_reminder_emails;
create policy "admins can update reminder emails" on public.maintenance_reminder_emails
  for update to authenticated
  using (private.has_role(auth.uid(), 'admin'))
  with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "admins can delete reminder emails" on public.maintenance_reminder_emails;
create policy "admins can delete reminder emails" on public.maintenance_reminder_emails
  for delete to authenticated using (private.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- DONE. Next: enable Email auth in Authentication -> Providers, then deploy.
-- The hidden admin is auto-seeded on first sign-in load if you set
-- HIDDEN_ADMIN_EMAIL / HIDDEN_ADMIN_PASSWORD + SUPABASE_SERVICE_ROLE_KEY.
-- =============================================================================
