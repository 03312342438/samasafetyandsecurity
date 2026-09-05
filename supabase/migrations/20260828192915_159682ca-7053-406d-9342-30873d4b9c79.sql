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