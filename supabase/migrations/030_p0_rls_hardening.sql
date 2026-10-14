-- 030: P0 RLS hardening (datos).
-- 1) profiles: el UPDATE propio no puede tocar role ni subscription_id.
--    La policy sigue permitiendo leer/editar el perfil propio, pero un trigger
--    bloquea las columnas privilegiadas para todo rol distinto de service_role.
-- 2) subscriptions: se elimina el UPDATE directo del cliente. Todas las
--    escrituras van por service_role / funciones (cancel_subscription, webhooks).
-- 3) cancel_subscription: solo el dueño o service_role.
-- 4) admin_audit_log y rate_limits: se eliminan las policies permisivas
--    using(true). service_role no mira RLS; sin policies, anon/authenticated
--    quedan denegados.
-- 5) editions / edition_languages: lecturas públicas, cero escrituras desde
--    anon/authenticated (least privilege).
-- 6) Vista public_edition_catalog: catálogo público sin pdf_url. El cliente
--    anónimo usa la vista; la URL real del PDF solo la resuelve el servidor
--    (/api/pdf via service_role).
-- Idempotente y aditiva (revocaciones + DROP IF EXISTS).

-- 1) profiles: policy con WITH CHECK + trigger de columnas privilegiadas
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.block_privileged_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if (old.role is distinct from new.role
      or old.subscription_id is distinct from new.subscription_id) then
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
      raise exception 'not allowed to change role or subscription_id';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists no_privileged_profile_update on public.profiles;
create trigger no_privileged_profile_update
  before update of role, subscription_id on public.profiles
  for each row
  execute function public.block_privileged_profile_columns();

-- 2) subscriptions: sin UPDATE directo desde el cliente
drop policy if exists "Users can update own subscriptions" on public.subscriptions;

revoke all on public.subscriptions from anon;
revoke all on public.subscriptions from authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

revoke all on public.profiles from anon;
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- 3) cancel_subscription: el dueño o service_role (el servidor usa service_role)
create or replace function public.cancel_subscription(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and auth.uid() is distinct from p_user_id then
    raise exception 'forbidden';
  end if;
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

-- 4) Tablas solo-service_role: fuera policies permisivas y grants públicos
drop policy if exists "Service role can manage audit log" on public.admin_audit_log;
drop policy if exists "Service role can read audit log" on public.admin_audit_log;
drop policy if exists "Service role can manage rate limits" on public.rate_limits;

revoke all on public.admin_audit_log from anon, authenticated;
revoke all on public.rate_limits from anon, authenticated;
grant select, insert on public.admin_audit_log to service_role;
grant all on public.rate_limits to service_role;

-- 5) Catálogo: lectura pública, escritura solo service_role
revoke all on public.editions from anon, authenticated;
grant select on public.editions to anon, authenticated;
grant all on public.editions to service_role;

revoke all on public.edition_languages from anon, authenticated;
grant select on public.edition_languages to anon, authenticated;
grant all on public.edition_languages to service_role;

-- 6) Vista pública sin pdf_url (el cliente anónimo no necesita la URL real)
create or replace view public.public_edition_catalog as
select
  el.id as version_id,
  el.edition_id,
  el.language,
  e.edition_number,
  e.featured,
  e.kind,
  e.published_at,
  e.created_at,
  el.title,
  el.description,
  el.cover_url,
  el.badge,
  (el.pdf_url is not null and el.pdf_url <> '') as has_pdf
from public.edition_languages el
join public.editions e on e.id = el.edition_id;

revoke all on public.public_edition_catalog from anon, authenticated;
grant select on public.public_edition_catalog to anon, authenticated, service_role;
