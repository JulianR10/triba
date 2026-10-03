-- 025: recuperación y consistencia post-lanzamiento.
-- 1) welcome_sent_at: reclamo at-most-once de la bienvenida Mail Club (la
--    carrera de webhooks podía duplicar el email).
-- 2) Snapshot congelado de alta/estado de suscripción en los items del lote
--    (el CSV resolvía en vivo y cambiaba después del corte).
-- 3) cancel_subscription también para estados cobrables (past_due, incomplete,
--    trialing): una suscriptora en dunning debe poder cancelar.
-- Todo aditivo e idempotente.

-- 1) Bienvenida Mail Club: reclamo para envío único + reintento.
alter table public.subscriptions
  add column if not exists welcome_sent_at timestamptz;

-- 2) Lote: fecha de alta y estado de suscripción congelados al crear el item.
alter table public.mail_club_batch_items
  add column if not exists joined_at timestamptz,
  add column if not exists sub_status text;

-- 3) Cancelación diferida para todos los estados cobrables.
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
    and status in ('active', 'trialing', 'past_due', 'incomplete')
    and cancel_at_period_end = false;
end;
$$;
