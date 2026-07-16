-- Add canceled_at column to subscriptions
alter table if exists public.subscriptions add column if not exists canceled_at timestamptz;

-- RLS policy for users to update their own subscriptions
create policy "Users can update own subscriptions"
  on public.subscriptions for update
  using (auth.uid() = user_id);

-- Function to cancel subscription (used by the API)
create or replace function public.cancel_subscription(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription_id uuid;
begin
  update public.subscriptions
  set status = 'canceled',
      canceled_at = now(),
      updated_at = now()
  where user_id = p_user_id
    and status = 'active'
  returning id into v_subscription_id;

  if v_subscription_id is not null then
    update public.profiles
    set role = 'free',
        subscription_id = null,
        updated_at = now()
    where id = p_user_id;
  end if;
end;
$$;
