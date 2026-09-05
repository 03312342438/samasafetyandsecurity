drop policy if exists "mgmt delete projects" on public.projects;
create policy "sales pm or mgmt delete projects" on public.projects for delete to authenticated
using (
  private.is_mgmt(auth.uid())
  or ((private.has_dept(auth.uid(), 'sales') or private.has_dept(auth.uid(), 'project_manager')) and status <> 'closed')
);

drop policy if exists "mgmt delete customers" on public.customers;
create policy "sales or mgmt delete customers" on public.customers for delete to authenticated
using (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(), 'sales'));