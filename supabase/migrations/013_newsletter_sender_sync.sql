-- Track Sender sync state for newsletter subscribers.
-- The welcome email is a Sender automation fired on group add (trigger_automation),
-- so if the Sender POST fails silently the subscriber never gets the email.
-- These columns let us detect and re-process the backlog (scripts/resync-newsletters.mjs).

alter table public.newsletters
  add column if not exists sender_synced boolean not null default false,
  add column if not exists sender_synced_at timestamptz,
  add column if not exists sender_sync_error text;
