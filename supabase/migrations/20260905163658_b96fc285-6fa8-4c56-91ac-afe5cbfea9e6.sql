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