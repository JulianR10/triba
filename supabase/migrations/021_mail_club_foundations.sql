-- 021: Mail Club foundations (additive only).
-- No migra ni convierte suscripciones existentes: las filas actuales quedan como 'digital'.
-- Origen de envíos acordado: Madrid, España. Corte: día 15 inclusive, Europe/Madrid.
-- Idempotente: todo con IF NOT EXISTS / DROP IF EXISTS.

-- 1) Tipo de plan en subscriptions
alter table public.subscriptions
  add column if not exists plan_type text not null default 'digital';

alter table public.subscriptions
  drop constraint if exists subscriptions_plan_type_check;

alter table public.subscriptions
  add constraint subscriptions_plan_type_check
  check (plan_type in ('digital', 'mail_club'));

update public.subscriptions
  set plan_type = 'digital'
  where plan_type is null or plan_type not in ('digital', 'mail_club');

create index if not exists idx_subscriptions_plan_type
  on public.subscriptions(plan_type);

-- 2) Dirección postal (una por usuaria, editable hasta el corte)
create table if not exists public.mailing_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  recipient_name text not null,
  country_iso char(2) not null,
  region text not null default '',
  city text not null default '',
  postal_code text not null default '',
  street_address text not null default '',
  address_extra text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mailing_addresses enable row level security;

drop policy if exists "Users manage own mailing address" on public.mailing_addresses;
create policy "Users manage own mailing address"
  on public.mailing_addresses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant all on public.mailing_addresses to service_role;
grant all on public.mailing_addresses to authenticated;

create index if not exists idx_mailing_addresses_user_id
  on public.mailing_addresses(user_id);
create index if not exists idx_mailing_addresses_country
  on public.mailing_addresses(country_iso);

-- 3) Aceptación de condiciones Mail Club (versión + fecha)
create table if not exists public.mail_club_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, terms_version)
);

alter table public.mail_club_consents enable row level security;

drop policy if exists "Users manage own mail club consents" on public.mail_club_consents;
create policy "Users manage own mail club consents"
  on public.mail_club_consents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant all on public.mail_club_consents to service_role;
grant all on public.mail_club_consents to authenticated;

create index if not exists idx_mail_club_consents_user_id
  on public.mail_club_consents(user_id);

-- 4) Upgrades digital -> mail club (operación durable, idempotente)
create table if not exists public.mail_club_upgrades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_plan text not null default 'digital',
  to_plan text not null default 'mail_club',
  plan_currency text not null check (plan_currency in ('EUR', 'USD', 'ARS')),
  amount_cents integer not null check (amount_cents > 0),
  provider text not null check (provider in ('stripe', 'mercadopago')),
  provider_payment_ref text,
  status text not null default 'pending'
    check (status in ('pending', 'payment_confirmed', 'recurrence_updated', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_payment_ref)
);

alter table public.mail_club_upgrades enable row level security;

drop policy if exists "Users read own mail club upgrades" on public.mail_club_upgrades;
create policy "Users read own mail club upgrades"
  on public.mail_club_upgrades for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own mail club upgrades" on public.mail_club_upgrades;
create policy "Users insert own mail club upgrades"
  on public.mail_club_upgrades for insert
  with check (auth.uid() = user_id);

grant all on public.mail_club_upgrades to service_role;
grant all on public.mail_club_upgrades to authenticated;

create index if not exists idx_mail_club_upgrades_user_id
  on public.mail_club_upgrades(user_id);
create index if not exists idx_mail_club_upgrades_status
  on public.mail_club_upgrades(status);

-- 5) Socias fundadoras (1..100, inmutable, nunca se reutiliza)
create table if not exists public.mail_club_founders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  founder_number integer not null unique check (founder_number >= 1 and founder_number <= 100),
  first_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.mail_club_founders enable row level security;

drop policy if exists "Users read own founder row" on public.mail_club_founders;
create policy "Users read own founder row"
  on public.mail_club_founders for select
  using (auth.uid() = user_id);

grant all on public.mail_club_founders to service_role;
grant all on public.mail_club_founders to authenticated;

-- 6) Lotes mensuales (un lote por mes, snapshot inmutable)
create table if not exists public.mail_club_batches (
  id uuid primary key default gen_random_uuid(),
  period_year integer not null check (period_year >= 2026),
  period_month integer not null check (period_month >= 1 and period_month <= 12),
  cutoff_at timestamptz not null,
  dispatched_at timestamptz,
  status text not null default 'open'
    check (status in ('open', 'closed', 'dispatched')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(period_year, period_month)
);

alter table public.mail_club_batches enable row level security;

grant all on public.mail_club_batches to service_role;

create index if not exists idx_mail_club_batches_period
  on public.mail_club_batches(period_year, period_month);

create table if not exists public.mail_club_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.mail_club_batches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  address_snapshot jsonb not null,
  email text not null default '',
  zone text not null default '',
  plan_currency text not null default 'EUR' check (plan_currency in ('EUR', 'USD', 'ARS')),
  founder_number integer,
  status text not null default 'included'
    check (status in ('included', 'dispatched', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  unique(batch_id, user_id)
);

alter table public.mail_club_batch_items enable row level security;

grant all on public.mail_club_batch_items to service_role;

create index if not exists idx_mail_club_batch_items_batch_id
  on public.mail_club_batch_items(batch_id);
create index if not exists idx_mail_club_batch_items_user_id
  on public.mail_club_batch_items(user_id);
