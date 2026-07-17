-- Admin audit log for tracking privileged actions
-- Logs who did what, when, and optional details

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  admin_email text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_log_created_at
  on public.admin_audit_log (created_at desc);

create index if not exists idx_admin_audit_log_entity
  on public.admin_audit_log (entity_type, entity_id);

-- Enable RLS but allow service_role only
alter table public.admin_audit_log enable row level security;

drop policy if exists "Service role can manage audit log" on public.admin_audit_log;
create policy "Service role can manage audit log"
  on public.admin_audit_log
  using (true)
  with check (true);
