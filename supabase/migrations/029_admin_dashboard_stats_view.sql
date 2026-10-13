-- 029: vista agregada para el dashboard admin (12 counts -> 1 fila).
-- Idempotente y de solo lectura.
create or replace view public.admin_dashboard_stats as
select
  (select count(*) from public.subscriptions where status = 'active')::bigint as active_subscribers,
  (select count(*) from public.subscriptions where status = 'active' and plan_type = 'digital')::bigint as active_digital,
  (select count(*) from public.subscriptions where status = 'active' and plan_type = 'mail_club')::bigint as active_mail_club,
  (select count(*) from public.subscriptions where status = 'incomplete')::bigint as pending_payment,
  (select count(*) from public.subscriptions where status = 'canceled')::bigint as canceled_subscribers,
  (select count(*) from public.subscriber_migrations)::bigint as migrated_subscribers,
  (select count(*) from public.editions)::bigint as editions_total,
  (select count(*) from public.editions where featured = true)::bigint as editions_featured,
  (select count(*) from public.feedback)::bigint as feedback_count,
  (select count(*) from public.creator_applications where status = 'pending')::bigint as creators_pending,
  (select count(*) from public.newsletters)::bigint as newsletter_count,
  (select count(*) from public.newsletters where sender_synced = false)::bigint as newsletter_pending_sync;

revoke all on public.admin_dashboard_stats from anon, authenticated;
grant select on public.admin_dashboard_stats to service_role;
