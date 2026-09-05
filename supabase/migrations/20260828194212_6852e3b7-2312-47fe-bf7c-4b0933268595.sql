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
