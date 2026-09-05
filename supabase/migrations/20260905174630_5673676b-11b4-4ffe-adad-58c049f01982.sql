drop function if exists public.users_with_roles(text[]);

create policy "staff view all roles"
on public.user_roles
for select
to authenticated
using (private.is_staff(auth.uid()));