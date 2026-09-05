create or replace function public.users_with_roles(_roles text[])
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select ur.user_id from public.user_roles ur
  where ur.role::text = any(_roles)
$$;

grant execute on function public.users_with_roles(text[]) to authenticated, service_role;