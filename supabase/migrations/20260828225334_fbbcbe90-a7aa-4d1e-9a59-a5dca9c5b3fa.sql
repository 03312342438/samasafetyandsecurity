-- reuse the existing private helpers instead of a new public one
drop policy if exists "steps delete" on public.job_installation_steps;
create policy "steps delete" on public.job_installation_steps for delete to authenticated
  using (private.is_mgmt(auth.uid()) or private.has_dept(auth.uid(),'project_manager') or private.has_dept(auth.uid(),'technician'));

drop policy if exists "suppliers write" on public.suppliers;
drop policy if exists "suppliers update" on public.suppliers;
drop policy if exists "suppliers delete" on public.suppliers;
create policy "suppliers write" on public.suppliers for insert to authenticated with check (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));
create policy "suppliers update" on public.suppliers for update to authenticated using (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));
create policy "suppliers delete" on public.suppliers for delete to authenticated using (private.is_mgmt(auth.uid()));

drop policy if exists "sinv write" on public.supplier_invoices;
drop policy if exists "sinv update" on public.supplier_invoices;
create policy "sinv write" on public.supplier_invoices for insert to authenticated with check (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));
create policy "sinv update" on public.supplier_invoices for update to authenticated using (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));

drop policy if exists "spay write" on public.supplier_payments;
drop policy if exists "spay update" on public.supplier_payments;
create policy "spay write" on public.supplier_payments for insert to authenticated with check (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));
create policy "spay update" on public.supplier_payments for update to authenticated using (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));

drop policy if exists "pcost update" on public.project_costs;
create policy "pcost update" on public.project_costs for update to authenticated using (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));

drop policy if exists "cnote write" on public.credit_notes;
drop policy if exists "cnote update" on public.credit_notes;
create policy "cnote write" on public.credit_notes for insert to authenticated with check (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));
create policy "cnote update" on public.credit_notes for update to authenticated using (private.has_dept(auth.uid(),'accounts') or private.is_mgmt(auth.uid()));

drop function if exists public.has_role(uuid, app_role);

-- sign-up may self-assign its chosen department (never admin); account stays pending
drop policy if exists "self insert employee role" on public.user_roles;
create policy "self insert own department role" on public.user_roles for insert to authenticated
  with check (user_id = auth.uid() and role <> 'admin'::app_role);