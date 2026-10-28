# Instrucciones de desarrollo — TRIBA

Operación, deploy y scripts: [`README.md`](./README.md). Trabajo en curso y mejoras: [`ROADMAP.md`](./ROADMAP.md). El código, las migraciones y los tests son la fuente de verdad.

## Stack y estilo

- Astro 5 SSR en Vercel; Tailwind 3; Supabase; Stripe y Mercado Pago; Sender; visor PDF con React.
- Naming: archivos kebab-case, componentes PascalCase, variables camelCase. UI en español rioplatense; código y logs en inglés.
- Colores: `triba-red #E91A39`, `triba-pink #FFCCE4`, `triba-cream #FFF8EE`, `triba-green #BCE85E`, `triba-brown #35220A`.

## Convenciones obligatorias

- Scripts de página Astro se inicializan mediante `onPageCycle(fn)` para funcionar con y sin View Transitions.
- Endpoints: `APIRoute`; usar `requireUser`/`requireAdmin` y el contrato de `src/lib/response.ts` (éxito por HTTP `res.ok`, error `{error}` + status).
- Migraciones secuenciales e idempotentes en `supabase/migrations/`; mantener `src/lib/database.types.ts` sincronizado.
- `SITE_URL` se define desde `astro.config.mjs` y `src/lib/site-url.ts`; no derivarlo de `request.url` en Vercel.
- No interpolar `{expr}` en scripts HTML de Astro: usar `set:html`, JSON embebido o `data-*`.
- Si se modifica un flujo de pago, cubrir reintentos/idempotencia y validar `npm run check`, `npm test` y `npm run build`.

## Invariantes que no deben romperse

- Gate de suscripción: siempre `isActiveSubscription(status, current_period_end)`; `past_due` no degrada el perfil a `free`.
- Cancelación y portal: proveedor primero; un error real del proveedor no debe marcar la baja local. `cancel_subscription` devuelve filas afectadas y el caller verifica el resultado.
- Upgrade pendiente: TTL 60 minutos; un solo `pending` por usuaria. Bienvenida Mail Club: claim condicional `welcome_sent_at`, at-most-once con rollback si Sender falla.
- Mail Club: elegibilidad y dirección se congelan al corte; el despacho no revalida el estado vivo. Número de fundadora consecutivo, inmutable y sin tope.
- Badges: `edition_languages.badge` solo en la edición destacada; mantener `syncFeaturedBadges()` al crear, editar o borrar.
- Ediciones: los archivos grandes se suben directo a Storage con URL firmada; tras el PUT, el servidor verifica tamaño, MIME y firma antes de guardar. Limpiar si falla; no pasarlos por Vercel.
- `security.checkOrigin: false` es intencional con Astro/Vercel y las rutas multipart; no cambiarlo sin probar los formularios admin.
- Webhook MP: validar con `WebhookSignatureValidator` del SDK, sin tolerancia propia. Stripe: estados mapeados por `mapStripeSubscriptionStatus` (desconocidos se omiten sin reintento; `deleted` solo libera el perfil sin otra sub con acceso); no sustituir períodos reales por `+30 días` sin revisar la fuente.
- Rate limiting (`src/lib/rate-limit.ts`, tabla `rate_limits`): fail-closed con 503, claves IPv6-safe vía `enforceRateLimit`. Cubierto en formularios/checkouts, PDF, cuenta y mutaciones admin; webhooks excluidos a propósito y el login vive en Supabase Auth.
- PDFViewer: `client:only="react"`; import estático de `react-pdf` y worker `pdfjs-dist/...mjs?url`; ampliar mediante overlay portal, nunca Fullscreen API.
- Un solo cobro vigente por persona: el checkout digital y el de Mail Club rechazan con 409 `already_subscribed` si ya hay una suscripción paga vigente (`hasLivePaidSubscription`, `src/lib/subscription-guard.ts`); las `migrated` (cortesía) no cuentan.
- Cancelar (usuaria o admin): `scheduleProviderCancels` frena la recurrencia de **todas** las filas vigentes en el proveedor antes de la RPC; un error real corta sin marcar nada.
- Downgrade a digital idempotente: si Stripe ya tiene un schedule hacia el precio digital se reutiliza; si falla el armado se libera el schedule creado.
- Contraseña por admin (`POST /api/admin/subscribers/[id]/password`): solo `requireAdmin`, con rate limit y auditoría sin la clave, y nunca sobre otra admin.
- Webhooks y activaciones: `supabase-js` no lanza; chequear siempre `error` de upsert/update y lanzar para responder 500 (el proveedor reintenta). Nunca responder 200 con la suscripción sin guardar. El rol de una admin no se degrada ni se pisa: usar `roleAfterPayment` al conceder y `.neq("role","admin")` al liberar.
- Cobro confirmado = nunca error al usuario: tras cobrar un upgrade, un fallo posterior responde `pending` (no 500) y no marca `failed`; completa el webhook o el reintento admin.
- Mensajes al público: sin texto técnico de proveedores ni de la base (detalle al log). Un 4xx puede mostrar su texto; 5xx/red muestran uno genérico. Contacto único en `src/lib/contact.ts` (`SUPPORT_EMAIL`).
- HTML de mails: todo dato escrito por personas pasa por `escapeHtmlText` (`src/lib/html-escape.ts`; `escape.ts` solo sirve en el navegador).
- Ediciones: PDF con nombre único por subida; borrar de Storage lo reemplazado solo después de guardar bien (`removeStoredFiles`). Aviso a suscriptoras con reclamo atómico en `editions.notified_at`.
- Identidad en rutas admin, `/api/pdf` y Mi Cuenta: el middleware la verifica con `auth.getUser()` (no confiar en la cookie de `getSession`).
- Las tablas de formularios y de Mail Club no tienen permisos para `anon`/`authenticated` (migración 032): toda escritura pasa por el servidor con `service_role`.
- Cron y webhooks requieren secreto/firma. Revisar el README (Producción y Operación) antes de tocar producción.

## UI, navegación e i18n

- Navbar mide `--nav-height` con `ResizeObserver`; conservar espaciado superior y la excepción móvil de Mi Cuenta.
- Rutas EN físicas en `src/pages/en/`; usar `localizePath`/`switchPath`. Admin queda en español.
- Al agregar una ruta bilingüe, revisar canonical, `hreflang`, sitemap y textos ES/EN.

## Dónde vive cada flujo

- Gate de acceso: `src/middleware.ts`, `src/lib/subscription-status.ts`, `src/lib/subscription-guard.ts`.
- Checkout y activación: `src/pages/api/create-checkout.ts`, `src/lib/payment-provider.ts`, webhooks en `src/pages/api/webhook/`, recuperación en `src/lib/reconcile.ts` (cron `/api/cron/reconcile`).
- Cambios de plan: `src/pages/api/upgrade-checkout.ts` y `src/lib/upgrade-apply.ts` (a Mail Club); `src/pages/api/downgrade.ts` (a digital).
- Cancelación y portal: `src/pages/api/cancel-subscription.ts`, `src/lib/cancel-providers.ts`, `src/pages/api/portal.ts`; admin en `src/pages/api/admin/subscribers/[id]/`.
- Mail Club: `src/lib/mail-club.ts`, `src/lib/mail-club-activation.ts`, `src/lib/founders.ts`, `src/lib/admin/mail-club.ts` y `mail-club-reminders.ts`.
- Ediciones y PDF: `src/lib/editions.ts` (vista `public_edition_catalog`, sin `pdf_url`), `src/pages/api/pdf/[editionId].ts` (URL firmada de 5 min), bucket privado `editions-pdfs`, `src/lib/storage.ts`.
- Respuestas de API: `src/lib/response.ts`. Newsletter retirado: `POST /api/newsletter` responde 410.
