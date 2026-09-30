-- 023: cancelación y downgrade al final del período pagado.
-- Antes, cancel_subscription revocaba acceso de inmediato; ahora programa el
-- fin y conserva el acceso hasta el vencimiento (webhook deleted lo cierra).
-- scheduled_plan_type permite programar la vuelta a digital.
-- Idempotente.

alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists scheduled_plan_type text,
  add column if not exists scheduled_plan_at timestamptz;

alter table public.subscriptions
  drop constraint if exists subscriptions_scheduled_plan_check;

alter table public.subscriptions
  add constraint subscriptions_scheduled_plan_check
  check (scheduled_plan_type is null or scheduled_plan_type in ('digital', 'mail_club'));

create index if not exists idx_subscriptions_scheduled_plan
  on public.subscriptions(scheduled_plan_type);

-- Cancelación diferida: marca el fin, NO toca status ni perfil.
-- El acceso se conserva hasta current_period_end; el webhook
-- customer.subscription.deleted (Stripe) o el vencimiento del período
-- lo cierran. Reejecutar es no-op.
create or replace function public.cancel_subscription(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.subscriptions
  set cancel_at_period_end = true,
      canceled_at = coalesce(canceled_at, now()),
      updated_at = now()
  where user_id = p_user_id
    and status = 'active'
    and cancel_at_period_end = false;
end;
$$;
