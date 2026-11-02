-- Límite de uso en una sola llamada a la base (antes: contar + insertar = 2 viajes).
-- Cuenta los pedidos de la ventana; si hay lugar registra el pedido, si no devuelve cuánto
-- falta para que salga el más viejo. Idempotente. Solo la ejecuta el servidor (service_role).
create or replace function public.rate_limit_hit(
  p_ip text,
  p_endpoint text,
  p_window_ms integer,
  p_max integer
)
returns table (allowed boolean, retry_after_ms integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window interval := make_interval(secs => p_window_ms / 1000.0);
  v_count integer;
  v_oldest timestamptz;
begin
  select count(*), min(created_at)
    into v_count, v_oldest
    from public.rate_limits
   where ip = p_ip
     and endpoint = p_endpoint
     and created_at >= now() - v_window;

  if v_count >= p_max then
    return query select false,
      greatest(1, (extract(epoch from (v_oldest + v_window - now())) * 1000)::integer);
    return;
  end if;

  insert into public.rate_limits (ip, endpoint) values (p_ip, p_endpoint);
  return query select true, 0;
end;
$$;

revoke execute on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;
