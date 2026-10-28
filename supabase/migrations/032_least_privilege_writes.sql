-- 032: mínimo privilegio en escrituras (continuación de 030, que endureció suscripciones,
-- perfiles y catálogo pero dejó abiertas estas tablas).
-- Contexto: toda lectura/escritura de estas tablas pasa por el servidor con service_role
-- (que ignora RLS). El navegador nunca las usa, así que anon/authenticated no necesitan
-- ningún permiso. Antes, con la clave pública del sitio se podía:
--   * insertar en creator_applications / newsletters / feedback saltando la API
--     (límite por IP, validación de largo y email, newsletter retirado con 410);
--   * escribir mailing_addresses sin validación ni límite de largo (ese texto sale
--     después en mails y en el CSV de etiquetas);
--   * fabricar filas de mail_club_upgrades y mail_club_consents (evidencia legal);
--   * cambiar profiles.email, que se usa como destino de mails de Triba.
-- Idempotente: revokes, DROP IF EXISTS y CREATE OR REPLACE.

-- 1) Formularios públicos: solo por la API del servidor.
revoke all on public.newsletters from anon, authenticated;
revoke all on public.creator_applications from anon, authenticated;
revoke all on public.feedback from anon, authenticated;

drop policy if exists "Anyone can insert newsletters" on public.newsletters;
drop policy if exists "Only admins can read newsletters" on public.newsletters;
drop policy if exists "Anyone can insert creator applications" on public.creator_applications;
drop policy if exists "Only admins can read creator applications" on public.creator_applications;
drop policy if exists "Authenticated users can insert feedback" on public.feedback;
drop policy if exists "Users can read own feedback" on public.feedback;

-- 2) Mail Club: sin acceso directo desde el navegador.
revoke all on public.mailing_addresses from anon, authenticated;
revoke all on public.mail_club_consents from anon, authenticated;
revoke all on public.mail_club_upgrades from anon, authenticated;
revoke all on public.mail_club_founders from anon, authenticated;
revoke all on public.mail_club_batches from anon, authenticated;
revoke all on public.mail_club_batch_items from anon, authenticated;
revoke all on public.subscriber_migrations from anon, authenticated;

drop policy if exists "Users manage own mailing address" on public.mailing_addresses;
drop policy if exists "Users read own mail club consents" on public.mail_club_consents;
drop policy if exists "Users insert own mail club consents" on public.mail_club_consents;
drop policy if exists "Users read own mail club upgrades" on public.mail_club_upgrades;
drop policy if exists "Users insert own mail club upgrades" on public.mail_club_upgrades;
drop policy if exists "Users read own founder row" on public.mail_club_founders;

-- 3) profiles.email: ya no editable por la usuaria. Es el destino de los mails de Triba
--    (aviso de edición, bienvenida, reconciliación): editable permitía hacer que Triba le
--    escribiera a una tercera persona. role y subscription_id siguen bloqueados como en 030.
create or replace function public.block_privileged_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if (old.role is distinct from new.role
      or old.subscription_id is distinct from new.subscription_id
      or old.email is distinct from new.email) then
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
      raise exception 'not allowed to change role, subscription_id or email';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists no_privileged_profile_update on public.profiles;
create trigger no_privileged_profile_update
  before update of role, subscription_id, email on public.profiles
  for each row
  execute function public.block_privileged_profile_columns();

-- 4) Limpieza de rate_limits: solo la ejecuta el servidor (cron diario).
revoke execute on function public.cleanup_rate_limits() from public, anon, authenticated;
grant execute on function public.cleanup_rate_limits() to service_role;
