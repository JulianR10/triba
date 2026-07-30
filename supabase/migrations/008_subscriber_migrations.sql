-- Subscriber migrations table (tracks WooCommerce->Supabase migration)
create table if not exists public.subscriber_migrations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  old_subscription_data jsonb,
  migrated_at timestamptz not null default now()
);

alter table public.subscriber_migrations enable row level security;

create policy "Only admins can read subscriber_migrations"
  on public.subscriber_migrations for select
  using (auth.jwt() ->> 'role' = 'admin');

create policy "Only admins can insert subscriber_migrations"
  on public.subscriber_migrations for insert
  with check (auth.jwt() ->> 'role' = 'admin');

grant all on public.subscriber_migrations to service_role;

-- Extend provider CHECK to allow 'migrated' subscriptions
alter table public.subscriptions
  drop constraint if exists subscriptions_provider_check,
  add constraint subscriptions_provider_check
    check (provider in ('stripe', 'mercadopago', 'migrated'));

-- Extend status CHECK to include 'migrated'
alter table public.subscriptions
  drop constraint if exists subscriptions_status_check,
  add constraint subscriptions_status_check
    check (status in ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'migrated'));

-- Update handle_new_user to check migrated emails
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case
      when exists(select 1 from public.subscriber_migrations where email = new.email)
      then 'subscriber'
      else 'free'
    end
  );

  -- Create a migrated subscription if email is in migration table
  if exists(select 1 from public.subscriber_migrations where email = new.email) then
    insert into public.subscriptions (
      user_id,
      provider,
      provider_subscription_id,
      status,
      plan_currency,
      current_period_start,
      current_period_end
    ) values (
      new.id,
      'migrated',
      'migrated-' || gen_random_uuid(),
      'migrated',
      'USD',
      now(),
      now() + interval '90 days'
    );

    -- Link the subscription to the profile
    update public.profiles
    set subscription_id = (
      select id from public.subscriptions
      where user_id = new.id and provider = 'migrated'
      limit 1
    )
    where id = new.id;
  end if;

  return new;
end;
$$;
