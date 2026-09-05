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