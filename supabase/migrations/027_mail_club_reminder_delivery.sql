-- Persistent idempotency for monthly Mail Club operations reminders.
-- The same admin can receive one reminder per period and reminder type.
create table if not exists public.mail_club_reminders (
  period_year integer not null check (period_year >= 2026),
  period_month integer not null check (period_month between 1 and 12),
  reminder_type text not null check (reminder_type in ('create_batch', 'dispatch_batch')),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent')),
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (period_year, period_month, reminder_type, admin_user_id)
);

alter table public.mail_club_reminders enable row level security;
revoke all on public.mail_club_reminders from anon, authenticated;
grant all on public.mail_club_reminders to service_role;
