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