-- Newsletters
create table if not exists public.newsletters (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  subscribed_at timestamptz not null default now()
);

alter table public.newsletters enable row level security;

drop policy if exists "Anyone can insert newsletters" on public.newsletters;
create policy "Anyone can insert newsletters"
  on public.newsletters for insert
  with check (true);

drop policy if exists "Only admins can read newsletters" on public.newsletters;
create policy "Only admins can read newsletters"
  on public.newsletters for select
  using (auth.jwt() ->> 'role' = 'admin');

-- Creator applications
create table if not exists public.creator_applications (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  pais text not null,
  areas text[] not null default '{}',
  propuesta text not null,
  trabajo_url text,
  created_at timestamptz not null default now()
);

alter table public.creator_applications enable row level security;

drop policy if exists "Anyone can insert creator applications" on public.creator_applications;
create policy "Anyone can insert creator applications"
  on public.creator_applications for insert
  with check (true);

drop policy if exists "Only admins can read creator applications" on public.creator_applications;
create policy "Only admins can read creator applications"
  on public.creator_applications for select
  using (auth.jwt() ->> 'role' = 'admin');

-- Feedback
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  mensaje text not null,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

drop policy if exists "Authenticated users can insert feedback" on public.feedback;
create policy "Authenticated users can insert feedback"
  on public.feedback for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own feedback" on public.feedback;
create policy "Users can read own feedback"
  on public.feedback for select
  using (auth.uid() = user_id);

-- Grants
grant all on public.newsletters to service_role, anon, authenticated;
grant all on public.creator_applications to service_role, anon, authenticated;
grant all on public.feedback to service_role, anon, authenticated;

-- Expose to API
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'newsletters'
  ) then
    alter publication supabase_realtime add table public.newsletters;
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'creator_applications'
  ) then
    alter publication supabase_realtime add table public.creator_applications;
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feedback'
  ) then
    alter publication supabase_realtime add table public.feedback;
  end if;
end
$$;
