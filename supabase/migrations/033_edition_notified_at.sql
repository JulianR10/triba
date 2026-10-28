-- 033: registro de que una edición ya se avisó a las suscriptoras.
-- Sin esto, un doble clic (o dos admins) reenviaba el mail a TODAS las suscriptoras.
-- El endpoint de aviso reclama esta marca de forma atómica antes de enviar.
-- Idempotente.
alter table public.editions
  add column if not exists notified_at timestamptz;
