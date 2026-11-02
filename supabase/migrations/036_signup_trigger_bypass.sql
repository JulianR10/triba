-- 036: permite el alta de quien figura en subscriber_migrations.
-- handle_new_user() (migración 012) hace UPDATE profiles SET subscription_id al registrarse
-- esa persona. Ese UPDATE dispara block_privileged_profile_columns (migración 030), que exige
-- que el JWT diga service_role; en un alta de GoTrue no hay JWT y el registro podía fallar con
-- "Database error saving new user".
-- pg_trigger_depth() > 1 significa que el UPDATE lo hizo otro trigger (como handle_new_user),
-- no la usuaria: una edición directa desde el navegador tiene profundidad 1 y sigue bloqueada.
-- Idempotente (CREATE OR REPLACE). No toca permisos ni datos.
create or replace function public.block_privileged_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if (old.role is distinct from new.role
      or old.subscription_id is distinct from new.subscription_id) then
    if pg_trigger_depth() <= 1
       and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
      raise exception 'not allowed to change role or subscription_id';
    end if;
  end if;
  return new;
end;
$$;
