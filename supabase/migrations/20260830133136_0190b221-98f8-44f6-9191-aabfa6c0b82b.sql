-- BOMs: allow sales alongside project managers
DROP POLICY IF EXISTS "pm or mgmt insert boms" ON public.boms;
CREATE POLICY "pm sales or mgmt insert boms" ON public.boms FOR INSERT TO authenticated
WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales'));

DROP POLICY IF EXISTS "pm or mgmt update boms" ON public.boms;
CREATE POLICY "pm sales or mgmt update boms" ON public.boms FOR UPDATE TO authenticated
USING (private.is_mgmt(auth.uid()) OR ((private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales')) AND status <> 'approved'))
WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales'));

DROP POLICY IF EXISTS "mgmt delete boms" ON public.boms;
CREATE POLICY "pm sales or mgmt delete boms" ON public.boms FOR DELETE TO authenticated
USING (private.is_mgmt(auth.uid()) OR ((private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales')) AND status <> 'approved'));

DROP POLICY IF EXISTS "pm or mgmt insert bom items" ON public.bom_items;
CREATE POLICY "pm sales or mgmt insert bom items" ON public.bom_items FOR INSERT TO authenticated
WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales'));

DROP POLICY IF EXISTS "pm or mgmt update bom items" ON public.bom_items;
CREATE POLICY "pm sales or mgmt update bom items" ON public.bom_items FOR UPDATE TO authenticated
USING (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales'))
WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales'));

DROP POLICY IF EXISTS "mgmt delete bom items" ON public.bom_items;
CREATE POLICY "pm sales or mgmt delete bom items" ON public.bom_items FOR DELETE TO authenticated
USING (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(),'project_manager') OR private.has_dept(auth.uid(),'sales'));

-- Sales may delete their own not-yet-approved sales records
DROP POLICY IF EXISTS "mgmt delete quotations" ON public.quotations;
CREATE POLICY "sales or mgmt delete quotations" ON public.quotations FOR DELETE TO authenticated
USING (private.is_mgmt(auth.uid()) OR (private.has_dept(auth.uid(),'sales') AND status NOT IN ('approved','accepted','closed')));

DROP POLICY IF EXISTS "mgmt delete inquiries" ON public.inquiries;
CREATE POLICY "sales or mgmt delete inquiries" ON public.inquiries FOR DELETE TO authenticated
USING (private.is_mgmt(auth.uid()) OR (private.has_dept(auth.uid(),'sales') AND status NOT IN ('approved','closed')));

DROP POLICY IF EXISTS "mgmt delete customer pos" ON public.customer_pos;
CREATE POLICY "sales or mgmt delete customer pos" ON public.customer_pos FOR DELETE TO authenticated
USING (private.is_mgmt(auth.uid()) OR (private.has_dept(auth.uid(),'sales') AND verification_status <> 'verified'));

-- Approvals are private to the requester and Management
DROP POLICY IF EXISTS "staff view approvals" ON public.approvals;
CREATE POLICY "requester or mgmt view approvals" ON public.approvals FOR SELECT TO authenticated
USING (private.is_mgmt(auth.uid()) OR submitted_by = auth.uid());