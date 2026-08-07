-- Editions: support two kinds (magazine for subscribers, free universal article)
alter table public.editions
  add column if not exists kind text not null default 'magazine'
  check (kind in ('magazine', 'free'));

-- Free articles have no edition number or cover
alter table public.editions
  alter column edition_number drop not null;
alter table public.editions
  alter column cover_url drop not null;