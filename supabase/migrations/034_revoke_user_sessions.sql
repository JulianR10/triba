-- Cierra todas las sesiones de una usuaria (al cambiarle la contraseña desde el panel admin).
-- Borrar de auth.sessions arrastra sus refresh tokens; el middleware verifica la identidad
-- con auth.getUser(), que rechaza un token cuya sesión ya no existe.
-- Idempotente. Solo la ejecuta el servidor (service_role).
create or replace function public.revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics revoked = row_count;
  return revoked;
end;
$$;

revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
