-- STEP 0: run this FIRST, on its own, before RUN_ALL_MIGRATIONS.sql
-- Adds the staff roles to the app_role enum. Must be committed separately
-- before the main migration file can use them.

alter type public.app_role add value if not exists 'sales';
alter type public.app_role add value if not exists 'project_manager';
alter type public.app_role add value if not exists 'inventory';
alter type public.app_role add value if not exists 'technician';
alter type public.app_role add value if not exists 'accounts';
