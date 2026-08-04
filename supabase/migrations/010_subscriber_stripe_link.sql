-- Link WooCommerce-migrated subscribers to their recreated Stripe subscription.
-- The billing was recreated via scripts/recreate-migrated-billing.mjs.

alter table public.subscriber_migrations
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_customer_id text;

-- handle_new_user: if the email has a real (recreated) Stripe subscription,
-- link it; otherwise keep the legacy 90-day 'migrated' courtesy subscription.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  mig public.subscriber_migrations;
begin
  select * into mig from public.subscriber_migrations where email = new.email;

  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when mig.id is not null then 'subscriber' else 'free' end
  );

  if mig.id is not null then
    if mig.stripe_subscription_id is not null then
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
        'stripe',
        mig.stripe_subscription_id,
        'active',
        'EUR',
        now(),
        now() + interval '30 days'
      );
    else
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
        now() + interval '7 days'
      );
    end if;

    update public.profiles
    set subscription_id = (
      select id from public.subscriptions
      where user_id = new.id
      limit 1
    )
    where id = new.id;
  end if;

  return new;
end;
$$;
