-- Fix feedback dedup trigger: coalesce(new.user_id, '') forced a uuid cast of ''
-- that raised "invalid input syntax for type uuid" on every insert, blocking all
-- feedback. Cast to text explicitly for the advisory-lock key.

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