-- Admin UI support (Fase 1)
-- Adds workflow columns needed by /admin pages without touching the existing schema.

-- creator_applications: workflow status (pending/approved/rejected)
alter table public.creator_applications
  add column if not exists status text not null default 'pending'
  check (status in ('pending', 'approved', 'rejected'));

-- Optional admin notes (e.g. why a postulation was rejected)
alter table public.creator_applications
  add column if not exists admin_notes text;

-- Index for the admin "pending" filter
create index if not exists idx_creator_applications_status
  on public.creator_applications (status, created_at desc);

-- editions: at most one edition can be featured at a time.
-- The app's getFeaturedEdition() uses .single() which breaks if 2+ rows are featured.
create unique index if not exists one_featured_edition
  on public.editions (featured)
  where featured = true;

-- HOW TO PROMOTE THE FIRST ADMIN
-- The handle_new_user trigger creates profiles with role='free'.
-- Promote your own user (and any other admins) manually with:
--
--   update public.profiles
--   set role = 'admin'
--   where email = 'tu@email.com';
--
-- You can verify with:
--
--   select email, role from public.profiles where role = 'admin';
