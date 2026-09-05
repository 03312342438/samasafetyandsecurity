DROP POLICY IF EXISTS "pm or mgmt insert projects" ON public.projects;
CREATE POLICY "pm sales or mgmt insert projects" ON public.projects
FOR INSERT TO authenticated
WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(), 'project_manager') OR private.has_dept(auth.uid(), 'sales'));

DROP POLICY IF EXISTS "pm or mgmt update projects" ON public.projects;
CREATE POLICY "pm sales or mgmt update projects" ON public.projects
FOR UPDATE TO authenticated
USING (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(), 'project_manager') OR private.has_dept(auth.uid(), 'sales') OR project_manager_id = auth.uid())
WITH CHECK (private.is_mgmt(auth.uid()) OR private.has_dept(auth.uid(), 'project_manager') OR private.has_dept(auth.uid(), 'sales') OR project_manager_id = auth.uid());

GRANT DELETE ON public.approvals TO authenticated;
DROP POLICY IF EXISTS "mgmt delete approvals" ON public.approvals;
CREATE POLICY "mgmt delete approvals" ON public.approvals
FOR DELETE TO authenticated
USING (private.is_mgmt(auth.uid()));