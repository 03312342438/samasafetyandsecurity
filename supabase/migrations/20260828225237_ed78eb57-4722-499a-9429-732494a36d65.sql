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