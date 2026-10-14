# Mapa funcional — TRIBA

Mapa resumido de rutas y flujos críticos para orientar el trabajo mientras se ejecuta el backlog. **Temporal:** se retirará al cerrar esas mejoras. El código, las migraciones y los tests son la fuente de verdad.

## Arquitectura

- Astro 5 SSR on-demand en Vercel; no ISR.
- Supabase gestiona autenticación, perfiles, suscripciones, ediciones y Storage.
- Stripe y Mercado Pago cobran; los webhooks firmados actualizan suscripciones.
- Sender entrega correo transaccional y avisos.
- ES es la ruta predeterminada; EN vive en `src/pages/en/` y comparte componentes.

## Rutas por área

| Área | Rutas principales | Acceso |
|---|---|---|
| Sitio público | `/`, `/revista`, `/revista/[slug]`, `/suscribirme`, `/mail-club`, `/triba-creators`, `/terminos`, `/privacidad` | Público; contenido localizado bajo `/en/`. |
| Sesión y cuenta | `/iniciar-sesion`, `/mi-cuenta` | Sesión Supabase; el middleware entrega `locals`. |
| Administración | `/admin/*` | `requireAdmin`; siempre validar también las APIs. |
| Pagos y cuenta | `/api/create-checkout`, `/api/cancel-subscription`, `/api/portal`, `/api/subscription-status`, `/api/address` | Autenticación y validación de servidor. |
| PDFs | `/api/pdf/[editionId]` | Comprueba edición/acceso y emite redirección a URL firmada; la privacidad real también depende de permisos del bucket. |
| Integraciones | `/api/webhook/stripe`, `/api/webhook/mercadopago`, `/api/cron/reconcile` | Firma del proveedor o `CRON_SECRET`. |

## Flujos críticos

### Autenticación y gate

1. `src/middleware.ts` resuelve sesión y páginas protegidas.
2. `src/lib/subscription-status.ts:isActiveSubscription(status, current_period_end)` es el gate único.
3. `past_due` no degrada automáticamente a `free`; Mi Cuenta ofrece gestionar el pago.

Fuentes: `src/middleware.ts`, `src/lib/auth.ts`, `src/lib/subscription-status.ts`.

### Checkout, activación y recuperación

1. Suscribirme inicia checkout Stripe o Mercado Pago; la usuaria sin sesión conserva un intento temporal.
2. `src/pages/api/create-checkout.ts` valida plan/proveedor/moneda; Mail Club deriva zona y precio del destino postal.
3. Webhooks firmados actualizan `subscriptions` y `profiles` de forma idempotente.
4. `src/lib/reconcile.ts` recupera pagos aprobados que no activó el webhook; el cron diario y las acciones admin reutilizan esa lógica.
5. Cancelación y portal actúan primero en el proveedor; el cambio local solo se confirma según el resultado del proveedor/RPC.

Fuentes: `src/lib/payment-provider.ts`, `src/pages/api/webhook/`, `src/lib/reconcile.ts`, `src/lib/upgrade-apply.ts`.

### Mail Club

1. Alta o upgrade solo activa Mail Club tras confirmar el pago; `src/lib/mail-club-activation.ts` asigna fundadora y reclama bienvenida de forma at-most-once.
2. Al corte Madrid del día 15, `listMailClubEligible()` y `createMailClubBatch()` generan lote idempotente con snapshots de elegibilidad y dirección.
3. Administración exporta el CSV y registra manualmente el despacho físico del día 20; el aviso se envía al registrarlo.
4. Los recordatorios del 14/19 salen desde el cron diario; no crean ni despachan lotes.
5. La elegibilidad congelada al corte gobierna el despacho posterior; no se vuelve a consultar el estado vivo.

Fuentes: `src/lib/mail-club.ts`, `src/lib/admin/mail-club.ts`, `src/lib/admin/mail-club-reminders.ts`, `src/lib/founders.ts`.

### Ediciones y PDF

- Home/Revista usan `src/lib/editions.ts`; detalle dinámico: `/revista/edicion-N`.
- El cliente público lee la vista `public_edition_catalog` (migración `030`): sin `pdf_url`, con `hasPdf`. La URL real solo la resuelve el servidor en `/api/pdf/{versionId}` (respeta `isActiveSubscription`, free/featured públicos, redirige a firmada de 5 min).
- `EditionForm` (admin) sigue contra `edition_languages` vía `service_role`; sube directo a Storage con URL firmada y el servidor verifica tamaño, MIME y firma real antes de guardar, limpiando si falla.
- `PDFViewer` es una isla React `client:only="react"`; ver reglas específicas en `AGENTS.md`.
- Cierre parcial P0 datos: el código ya no expone `pdf_url`, pero el REST directo a `edition_languages` aún lo devuelve y el bucket `editions` sigue público (las portadas dependen de eso). Falta Fase 1b (`031` + bucket privado). Riesgos abiertos se registran en `analisisMejoras.md`.

Fuentes: `src/components/EditionDetail.astro`, `src/components/PDFViewer.tsx`, `src/lib/admin/editions.ts`, `src/lib/storage.ts`.

## Newsletter retirado

La API pública responde 410 y no se ofrecen nuevas altas. Sender y los registros históricos se conservan hasta completar exportación/verificación; los correos transaccionales siguen activos.

## Convenciones de respuesta y administración

- APIs: `src/lib/response.ts`; los clientes evalúan éxito por el HTTP status (`res.ok`).
- Administración: páginas protegidas por middleware y operaciones sensibles mediante `requireAdmin`.
- RLS, migraciones e invariantes de negocio se mantienen en SQL cuando corresponda; sincronizar `src/lib/database.types.ts`.

Estado operativo y pasos manuales: [`mailClub.md`](../mailClub.md). Reglas de cambios de código: [`AGENTS.md`](../AGENTS.md).
