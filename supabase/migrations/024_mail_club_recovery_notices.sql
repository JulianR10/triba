-- 024: recuperación de upgrades + separación aviso/despacho.
-- 1) Un solo upgrade pendiente por usuaria (evita dobles checkouts).
-- 2) Aviso de despacho separado del estado físico del item.
-- 3) Consentimientos: sin UPDATE (la evidencia no se reescribe).
-- Idempotente.

-- 1) Partial unique index: un pending por usuaria
drop index if exists public.uq_mail_club_upgrades_pending_user;
create unique index if not exists uq_mail_club_upgrades_pending_user
  on public.mail_club_upgrades(user_id)
  where status = 'pending';

-- 2) Aviso separado del despacho físico
alter table public.mail_club_batch_items
  add column if not exists notice_sent boolean not null default false;

create index if not exists idx_mail_club_batch_items_notice
  on public.mail_club_batch_items(batch_id, notice_sent);

-- 3) Consentimientos append-only total (ni siquiera service_role los reescribe;
--    el upsert de la app usa ignoreDuplicates)
drop trigger if exists no_update_consent on public.mail_club_consents;
create trigger no_update_consent
  before update on public.mail_club_consents
  for each row
  execute function public.prevent_mail_club_erase();
