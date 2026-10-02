-- 022: Mail Club hardening (defensa en profundidad, sin cambios de producto).
-- 1) Consentimientos append-only para clientes: antes la policy "for all"
--    permitía update/delete desde el cliente. Ahora solo select + insert; los
--    cambios quedan reservados a service_role (servidor).
-- 2) Triggers de inmutabilidad: el número de fundadora nunca se reasigna ni
--    se borra, y la evidencia de aceptación no se puede eliminar.
-- Idempotente.

-- 1) Consents: reemplazar policy "for all" por select + insert
drop policy if exists "Users manage own mail club consents" on public.mail_club_consents;

drop policy if exists "Users read own mail club consents" on public.mail_club_consents;
create policy "Users read own mail club consents"
  on public.mail_club_consents for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own mail club consents" on public.mail_club_consents;
create policy "Users insert own mail club consents"
  on public.mail_club_consents for insert
  with check (auth.uid() = user_id);

-- 2) Inmutabilidad a nivel DB (aplica a todos los roles, incluido service_role)
create or replace function public.prevent_mail_club_erase()
returns trigger
language plpgsql
as $$
begin
  raise exception 'mail club audit record is immutable (%)', TG_TABLE_NAME;
  return null;
end;
$$;

drop trigger if exists no_delete_or_reassign_founder on public.mail_club_founders;
create trigger no_delete_or_reassign_founder
  before delete or update of user_id, founder_number on public.mail_club_founders
  for each row
  execute function public.prevent_mail_club_erase();

drop trigger if exists no_delete_consent on public.mail_club_consents;
create trigger no_delete_consent
  before delete on public.mail_club_consents
  for each row
  execute function public.prevent_mail_club_erase();
