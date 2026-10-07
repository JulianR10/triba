-- 026: cancel_subscription devuelve la cantidad de filas marcadas.
-- Antes devolvía void: un UPDATE que no tocaba ninguna fila (estado no
-- cancelable o baja ya programada) respondía éxito igual y el caller
-- mostraba "cancelada" + reload sin que nada cambiara (falso positivo).
-- Con el conteo, las APIs distinguen marcado real (n > 0) de no-op (0)
-- y responden el mensaje correcto. Aditiva e idempotente: misma firma de
-- entrada, mismos estados, mismo WHERE; solo cambia el retorno.
-- El DROP previo es obligatorio: Postgres (42P13) no permite cambiar el
-- tipo de retorno de void a integer con CREATE OR REPLACE.
drop function if exists public.cancel_subscription(uuid);

create function public.cancel_subscription(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  update public.subscriptions
  set cancel_at_period_end = true,
      canceled_at = coalesce(canceled_at, now()),
      updated_at = now()
  where user_id = p_user_id
    and status in ('active', 'trialing', 'past_due', 'incomplete')
    and cancel_at_period_end = false;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
