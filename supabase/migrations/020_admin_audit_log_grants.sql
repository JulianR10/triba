-- Fix admin_audit_log access for service_role.
-- 009 added RLS policies, but service_role bypasses RLS entirely: what was
-- actually missing are the TABLE privileges themselves (42501 permission
-- denied on SELECT via the REST API). Without these grants every
-- logAdminAction() insert and every audit read fails silently.
-- GRANT is idempotent, safe to re-run.

grant select, insert on public.admin_audit_log to service_role;
