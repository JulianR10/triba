-- Enforce a maximum of one creator application per email every 24h,
-- and one identical feedback message per user every 24h.
--
-- These triggers are the security backstop against accidental double submits
-- (double-click on the submit button / two concurrent POSTs racing past a
-- non-atomic SELECT-then-INSERT rate limit). Because they live in Postgres they
-- apply to every insert path (client, API, admin) and are atomic under
-- concurrency thanks to pg_advisory_xact_lock.
--
-- The application layer maps the 23505 error back to a friendly message.

-- ── creator_applications: same email must wait 24h to re-apply ──────────────
create or replace function public.reject_recent_creator_application()
returns trigger
language plpgsql
as $$
begin
  -- Serialize inserts from the same email so concurrent double-submits can't
  -- both pass the existence check. Released automatically at transaction end.
  perform pg_advisory_xact_lock(hashtext('creator_app:' || lower(coalesce(new.email, ''))));

  if exists (
    select 1
    from public.creator_applications
    where lower(email) = lower(coalesce(new.email, ''))
      and id <> new.id
      and created_at > now() - interval '24 hours'
  ) then
    raise exception 'Ya te postulaste recientemente. Esperá 24 horas para volver a intentar.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists reject_recent_creator_application on public.creator_applications;
create trigger reject_recent_creator_application
  before insert on public.creator_applications
  for each row execute function public.reject_recent_creator_application();

-- ── feedback: same user cannot send the same message twice in 24h ──────────
create or replace function public.reject_repeated_feedback()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtext('feedback:' || coalesce(new.user_id::text, '') || ':' || new.mensaje));

  if exists (
    select 1
    from public.feedback
    where user_id is not distinct from new.user_id
      and mensaje = new.mensaje
      and id <> new.id
      and created_at > now() - interval '24 hours'
  ) then
    raise exception 'Ya enviaste ese mensaje. Esperá 24 horas para volver a enviarlo.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists reject_repeated_feedback on public.feedback;
create trigger reject_repeated_feedback
  before insert on public.feedback
  for each row execute function public.reject_repeated_feedback();