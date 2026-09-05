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