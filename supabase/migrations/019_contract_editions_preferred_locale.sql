-- 019: CONTRACT editions + Fase E preferred_locale
-- Drop legacy content columns from editions (moved to edition_languages in 018).
-- Add profiles.preferred_locale for localized emails (Fase E). Idempotent.

alter table public.editions
  drop column if exists title,
  drop column if exists description,
  drop column if exists cover_url,
  drop column if exists pdf_url,
  drop column if exists badge;

alter table public.profiles
  add column if not exists preferred_locale text not null default 'es';

alter table public.profiles
  drop constraint if exists profiles_preferred_locale_check;

alter table public.profiles
  add constraint profiles_preferred_locale_check
  check (preferred_locale in ('es', 'en'));