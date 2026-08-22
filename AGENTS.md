# TRIBA — Revista digital mensual

Newsletter gratuito + suscripción paga, escrita por y para mujeres. Detalle de análisis: `docs/flujo-funcional.md`.

## Stack
| Capa | Tecnología |
|---|---|
| Framework | Astro 5 (`@astrojs/vercel`) |
| Estilos | Tailwind CSS 3, mobile-first |
| BBDD / Auth / Storage | Supabase |
| Pagos | Stripe + Mercado Pago (webhooks) |
| Newsletter + Email | Sender (send.net) API v2 |
| Visor PDF | `react-pdf` v10, React island `client:only` |

## Visual
- Colores: `triba-red #E91A39` · `triba-pink #FFCCE4` · `triba-cream #FFF8EE` · `triba-green #BCE85E` · `triba-brown #35220A` · `triba-bone #f2f1eb` · `triba-white` · `triba-black`
- Tipos: Bootzy TM (displays) · Montserrat (body) · Times New Roman itálica (cursivas)
- Fondos: `fondo-cielo.webp`, `fondo-1.png`, `fondo-3.png`

## Navegación
| Rol | Items |
|---|---|
| Público | INICIO · REVISTA · SUSCRIBIRME · TRIBA CREATORS · INICIAR SESION |
| Suscriptora | REVISTA · TRIBA CREATORS (+ botón "MI CUENTA" → dropdown) |

## Convenciones
- Naming: kebab archivos, PascalCase componentes, camelCase vars
- Astro scripts SIEMPRE vía `onPageCycle(fn)` de `src/lib/onPageCycle.ts` (`fn()` + `astro:page-load`). No usar solo `addEventListener("astro:page-load")` sin View Transitions nunca dispara → forms sin `preventDefault`.
- Server routes: `APIRoute`, auth `requireUser`/`requireAdmin`
- UI español rioplatense, código/logs inglés
- Migraciones SQL en `supabase/migrations/`, secuenciales, idempotentes
- `SITE_URL` única fuente `astro.config.mjs site` → `src/lib/site-url.ts`. Nunca derivar de `request.url` (Vercel = `localhost`).
- En Astro no evaluar `{expr}` en `<script>` (queda literal). Usar `<script type="application/json" set:html={JSON.stringify(...)}>` o `data-*`.

## Quirks clave — no reintroducir
- `--nav-height`: `Navbar` con `ResizeObserver`; secciones `padding-top: max(1rem, var(--nav-height))`. Excepción `MyAccountPage` `pt-0 md:pt-[max(...)]` en mobile.
- **Badge única:** `edition_languages.badge` solo en `max(edition_number)`/`featured=true` (hoy #4). Duplicarla causa pill doble.
- **Dedup 24h:** triggers `015`/`016` (`creator_applications` 1/24h por email; `feedback` mismo user+mensaje/24h) con `pg_advisory_xact_lock(hashtext(...))`. Cuidado `coalesce(col::text,'')` no `coalesce(col,'')` (22P02).
- **PDFViewer:** `client:only="react"` obligatorio (DOMMatrix en Node). Import ESTÁTICO `react-pdf` + `workerUrl` de `pdfjs-dist/build/pdf.worker.min.mjs?url`. No `client:visible`, no `import("react-pdf")` dinámico, no `vite.optimizeDeps` excluyendo react-pdf. Lazy `useIsVisible`. Carga: watchdog 25s + `isExpiredError(msg, age)` → `expired` muestra `Recargar página` (`location.reload()` regenera 30m) vs `Reintentar` (`retryKey`) para transitorios. `lang` prop ES/EN. Fullscreen overlay `fixed inset-0` fallback iOS.
- Rate limiting: tabla `rate_limits`.
- MP sin portal: `/api/portal` devuelve `{note}` → `alert()`.
- **Webhook MP:** siempre `WebhookSignatureValidator` del SDK, sin `toleranceSeconds`. Self-healing: activar también desde `subscription_authorized_payment` aprobado (`external_reference` → userId, fallback email vía `authorized_payments/search` → `v1/payments/{id}`). `activateSubscription()` = upsert `onConflict:provider,provider_subscription_id` + `profiles` explícito + cancela `migrated`. Welcome/Sender solo si sub nueva. URL: `https://www.universotriba.com/api/webhook/mercadopago`.
- **Webhook Stripe:** URL debe ser `https://www.universotriba.com/api/webhook/stripe` (`www`, no apex 308). Sin `current_period_start/end` → `periodRange()` fallback `start_date ?? created` +30d.
- **Sin ISR:** todo SSR on-demand. `security.checkOrigin: false` en `astro.config.mjs` (Astro 5 + Vercel → 403 en POST `multipart/form-data`; la app usa JSON vía fetch).

## Auth
- Página `/iniciar-sesion`; post-login `?redirect` o `role` (admin→`/admin`). Middleware protege `/admin*` y centraliza gate de suscripción (`src/middleware.ts` → `App.Locals` `profile+subscription+hasActiveSub` vía `isActiveSubscription(status, current_period_end)`; `Navbar`/`MyAccountPage`/`MagazinePage`/`/api/pdf` prefieren `locals` con fallback — ver `src/env.d.ts`).
- Email confirm OFF; duplicado → `identities:0` → "Ya existe una cuenta".
- SMTP Supabase = Sender (solo reset, límite 2/h).
- Checkout sin sesión: `checkout-intent` TTL 24h (`src/lib/checkout-intent.ts`) → `flushPendingCheckout` en `SubscribePage`.
- **Gate = `isActiveSubscription(status, current_period_end)`** de `src/lib/subscription-status.ts` (`active` o `migrated` vigente). Siempre usarlo; nunca `=== "active"` manual.

## Admin
- Promover: `update profiles set role='admin' where email='...'`.
- Nueva edición `/admin/ediciones/nuevo`: portada ≤5MB, PDF ≤50MB, featured única. Validación `src/lib/admin/editions.ts`.
- Cancelar `/admin/suscriptoras` → RPC `cancel_subscription`. Reembolsar → `POST /api/admin/subscribers/[id]/refund` + `admin_audit_log`.
- **Upload directo (no por Vercel 4.5MB):** `EditionForm` → `POST /api/admin/uploads/sign` → `createSignedUploadUrl(path,{upsert:true})` → `PUT` directo (`Content-Type` solo) → `POST/PATCH` edición con URLs. Si `PUT` OK y `POST/PATCH` falla (400/409), cleanup fire-and-forget `POST /api/admin/uploads/cleanup {paths}` → `removeStoragePaths` (`src/lib/storage.ts`). Barrido de huérfanos históricos: `node --env-file=.env scripts/cleanup-orphan-storage.mjs [--real]` (dry-run default, idempotente).
- Notificar edición: `POST /api/admin/editions/[id]/notify` → `role=subscriber` (devuelve `{failures:[{email,error}]}` + retry filtrado `POST {emails}`).
- Migradas: tab `status=migrated` + stats `totalMigrated`/`totalPending`/`totalRefunded`.
- Dashboard `newsletter_pending_sync` = `sender_synced=false` → card + banner en `/admin`.

## Revista bilingüe (ES/EN)
- Modelo: `editions` (ejemplar) + `edition_languages` (versión `es|en`, UNIQUE edition_id+language). `editions` solo `id, edition_number, kind, featured, published_at`. Contenido en `edition_languages`. Migración `019` ya dropeó `title/cover/pdf/badge` de `editions`; añade `profiles.preferred_locale`.
- Helpers `src/lib/editions.ts` (`getEditions(lang)` etc.) devuelven `EditionView` con `isFallback/hasEn`. Siempre usarlos.
- `/api/pdf/{id}` acepta `edition_languages.id` o `editions.id` legacy + `?lang`.
- Admin form manda `es_*/en_*`; EN vacío = sin versión EN. Paths `pdfs/revista-{n}-{lang}.pdf`, `covers/edicion-{n}-{lang}-{ts}.ext`.
- Tipos `database.types.ts` canónico, sincronizado con migraciones.
- Emails por `preferred_locale` (`src/lib/email.ts`, `src/lib/locale-pref.ts`, `notify.ts`).

## Estructura
```
triba/
├── public/ · supabase/migrations/ · src/{components, layouts, lib(+admin), middleware.ts, pages, scripts}
├── astro.config.mjs · tailwind.config.mjs
```

## Newsletter / Sender
- `POST /api/newsletter` → `newsletters` (23505 → `{existing,resynced}` idempotente). Welcome = automatización Sender grupo `newsletter-gratuito` (`trigger_automation`).
- Sender API v2 `Bearer`, `POST /subscribers` con `groups` en una llamada, `POST /message/send` transaccional. Cliente `src/lib/sender.ts` reintenta `429/5xx` con backoff. Failures `sender_synced=false` visibles en dashboard + `scripts/resync-newsletters.mjs`.
- Grupos `newsletter-gratuito`/`suscriptora-paga`. `SENDER_FROM_EMAIL: hola@comunidadtriba.com` (plan free 429 a nivel cuenta).

## Migración WooCommerce
- 92 pagos Stripe en `subscriber_migrations` (`handle_new_user` → `migrated` 7d). 6 MP preaprobaciones viejas vía `scripts/import-migrated-mp.mjs`. Ver detalle en `docs/flujo-funcional.md`.

## i18n
- `astro.config.mjs i18n` `es` default sin prefijo, `en` con `/en/`. Rutas FÍSICAS `src/pages/en/*.astro` → componente compartido `<X lang>`, no `[lang]`.
- `src/i18n/ui.ts` dict tipado + `src/i18n/locale.ts` `EN_ROUTES/localizePath/switchPath`. `locals.locale` desde middleware (`getLocaleFromUrl` + cookie `triba_locale`).
- Switcher `Navbar` `data-locale-switcher` + cookie `triba_locale`. Links internos vía `localizePath`. `404.astro` locale-aware. Data a scripts por `data-*`.
- Admin queda ES.

## Deuda de tipos
`npx astro check` → 0 errores · `npm run build` OK (23-Ago-2026 Fase 1 completa, incl. P7/P8). Sin pendientes de la lista de mejoras; ver `docs/flujo-funcional.md §6`.

⚠️ `src/lib/database.types.ts` canónico, sincronizado con `supabase/migrations/`.

Lecciones:
- Siempre `onPageCycle(fn)` (sin View Transitions `astro:page-load` no dispara).
- `NodeListOf.forEach` tipar `querySelectorAll<HTMLDetailsElement>`, no param `HTMLElement`; `<details>.open` → `HTMLDetailsElement`.
- No `HTML*Attribute` en `.astro`; unión literal en `Props`. Custom props: `as HTMLElement & {_x?:T}`. Narrowing no propaga a closures → usar `!`.
