-- Founder numbering continues consecutively after the original first 100.
alter table public.mail_club_founders
  drop constraint if exists mail_club_founders_founder_number_check;

alter table public.mail_club_founders
  alter column founder_number type bigint using founder_number::bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.mail_club_founders'::regclass
      and conname = 'mail_club_founders_founder_number_positive'
  ) then
    alter table public.mail_club_founders
      add constraint mail_club_founders_founder_number_positive
      check (founder_number >= 1);
  end if;
end;
$$;

alter table public.mail_club_batch_items
  alter column founder_number type bigint using founder_number::bigint;
