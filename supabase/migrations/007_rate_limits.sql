-- Rate limiting table for serverless-compatible throttling
-- Replaces the in-memory Map used with @astrojs/node standalone

create table if not exists public.rate_limits (
  id bigint primary key generated always as identity,
  ip text not null,
  endpoint text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_limits_lookup
  on public.rate_limits (ip, endpoint, created_at desc);

create index if not exists idx_rate_limits_cleanup
  on public.rate_limits (created_at);

-- Auto-cleanup entries older than 10 minutes to prevent table bloat
-- Called periodically by Supabase or can be triggered manually
create or replace function public.cleanup_rate_limits()
returns void
language plpgsql
as $$
begin
  delete from public.rate_limits
  where created_at < now() - interval '10 minutes';
end;
$$;

-- Enable RLS but allow service_role access only
alter table public.rate_limits enable row level security;

drop policy if exists "Service role can manage rate limits" on public.rate_limits;
create policy "Service role can manage rate limits"
  on public.rate_limits
  using (true)
  with check (true);
