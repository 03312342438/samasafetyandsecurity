revoke execute on function public.admin_exists() from public, anon, authenticated;
grant execute on function public.admin_exists() to service_role;