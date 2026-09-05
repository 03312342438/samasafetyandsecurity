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