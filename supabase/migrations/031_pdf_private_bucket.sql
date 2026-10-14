-- 031: cierre total del P0 PDF.
-- 1) edition_languages deja de ser legible por anon/authenticated: el catálogo
--    público vive en la vista public_edition_catalog (030, sin pdf_url).
--    service_role (servidor + admin) no se afecta: no mira RLS y conserva el
--    GRANT ALL de 018/030.
-- 2) Crea el bucket privado editions-pdfs para los PDFs. Sin policies de
--    storage: solo service_role accede (firmadas vía /api/pdf). Las portadas
--    siguen en el bucket público editions.
-- Idempotente. Aplicar DESPUÉS de deployar el código que lee la vista con
-- fallback (el fallback a edition_languages por anon deja de funcionar tras
-- esta migración, y ya no hace falta porque la vista existe desde 030).

revoke all on public.edition_languages from anon, authenticated;

insert into storage.buckets (id, name, public)
values ('editions-pdfs', 'editions-pdfs', false)
on conflict (id) do update set public = false;

revoke all on public.public_edition_catalog from anon, authenticated;
grant select on public.public_edition_catalog to anon, authenticated, service_role;
