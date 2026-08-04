-- Fix admin_audit_log RLS: allow service_role to read audit entries
-- The original policy only had using/with check but no for select,
-- which blocks service_role from reading the table via the REST API.

drop policy if exists "Service role can manage audit log" on public.admin_audit_log;

create policy "Service role can read audit log"
  on public.admin_audit_log
  for select
  using (true);

create policy "Service role can manage audit log"
  on public.admin_audit_log
  for all
  using (true)
  with check (true);