DROP POLICY IF EXISTS "requester or mgmt view approvals" ON public.approvals;
CREATE POLICY "requester pm item or mgmt view approvals" ON public.approvals
FOR SELECT TO authenticated
USING (
  private.is_mgmt(auth.uid())
  OR submitted_by = auth.uid()
  OR (entity_table = 'stock_items' AND private.has_dept(auth.uid(), 'project_manager'))
);

DROP POLICY IF EXISTS "pm or mgmt insert job numbers" ON public.job_numbers;
CREATE POLICY "technician pm or mgmt insert job numbers" ON public.job_numbers
FOR INSERT TO authenticated
WITH CHECK (
  private.is_mgmt(auth.uid())
  OR private.has_dept(auth.uid(), 'project_manager')
  OR private.has_dept(auth.uid(), 'technician')
);

DROP POLICY IF EXISTS "pm or mgmt update job numbers" ON public.job_numbers;
CREATE POLICY "technician pm or mgmt update job numbers" ON public.job_numbers
FOR UPDATE TO authenticated
USING (
  private.is_mgmt(auth.uid())
  OR private.has_dept(auth.uid(), 'project_manager')
  OR private.has_dept(auth.uid(), 'technician')
)
WITH CHECK (
  private.is_mgmt(auth.uid())
  OR private.has_dept(auth.uid(), 'project_manager')
  OR private.has_dept(auth.uid(), 'technician')
);

DROP POLICY IF EXISTS "stock_items_insert" ON public.stock_items;
CREATE POLICY "stock_items_insert" ON public.stock_items
FOR INSERT TO authenticated
WITH CHECK (
  private.has_dept(auth.uid(), 'inventory')
  OR private.has_dept(auth.uid(), 'project_manager')
  OR private.has_dept(auth.uid(), 'technician')
  OR private.is_mgmt(auth.uid())
);

DROP POLICY IF EXISTS "stock_items_update" ON public.stock_items;
CREATE POLICY "stock_items_update" ON public.stock_items
FOR UPDATE TO authenticated
USING (
  private.has_dept(auth.uid(), 'inventory')
  OR private.has_dept(auth.uid(), 'project_manager')
  OR private.has_dept(auth.uid(), 'technician')
  OR private.is_mgmt(auth.uid())
)
WITH CHECK (
  private.has_dept(auth.uid(), 'inventory')
  OR private.has_dept(auth.uid(), 'project_manager')
  OR private.has_dept(auth.uid(), 'technician')
  OR private.is_mgmt(auth.uid())
);