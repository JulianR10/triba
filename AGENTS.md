# TRIBA

Revista digital mensual — newsletter gratuito + suscripción paga, escrita por y para mujeres.

## Stack
| Capa | Tecnología |
|---|---|
| Framework | Astro 5 (`@astrojs/vercel`) |
| Estilos | Tailwind CSS 3, mobile-first |
| BBDD / Auth / Storage | Supabase |
| Pagos | Stripe + Mercado Pago (webhooks) |
| Newsletter + Email | Sender (send.net) API v2 |
| Visor PDF | `react-pdf` v10, dynamic import (React island) |

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
- Astro: scripts SIEMPRE vía el helper `onPageCycle(fn)` de `src/lib/onPageCycle.ts` (`fn()` directo + `document.addEventListener("astro:page-load", fn)`). NO usar `addEventListener("astro:page-load", ...)` solo: sin View Transitions ese evento nunca dispara y los forms quedan sin handlers → submit nativo sin `preventDefault` (este bug pasó en `NewsletterForm` y se solventó migrando todo a `onPageCycle`). El `fn()` directo cubre la carga inicial; el listener es redundante/inerte (no duplica).
- Server routes: `APIRoute`, auth `requireUser`/`requireAdmin`
- UI español rioplatense, código/logs inglés
- Migraciones SQL en `supabase/migrations/`, secuenciales, idempotentes

## Quirks clave (bugs ya resueltos, no reintroducir)
- `--nav-height`: lo setea el Navbar con `ResizeObserver`; secciones usan `padding-top: max(1rem, var(--nav-height, 64px))`.
- **Dedup submissions (24h):** triggers en DB (migraciones `015`/`016`): `creator_applications` = 1 por email/24h (RPC `23505` → `/api/creators` devuelve 429 "Esperá 24 horas"); `feedback` = mismo user + mismo mensaje/24h. Usan `pg_advisory_xact_lock(hashtext(...))` para ser atómicos ante doble-submit concurrente (doble-click). CUIDADO: al construir la key del lock con columna uuid usar `coalesce(col::text, '')`, NO `coalesce(col, '')` (fuerza cast a uuid de '' → 22P02 bloquea todos los inserts).
- **PDFViewer** (`client:only="react"`, ~48kB): import ESTÁTICO de react-pdf (`import { Document, Page, pdfjs }`) + `pdfjs.GlobalWorkerOptions.workerSrc = workerUrl` desde `import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"` (siempre la versión instalada; NO `public/pdf.worker.min.mjs`, estático, daba carga eterna al des-sincronizarse). `client:only` es OBLIGATORIO: evita SSR (react-pdf/pdfjs usa `DOMMatrix`, inexistente en Node → si se renderiza en server rompe). NO usar `client:visible` con import estático (mismo DOMMatrix). NO usar `import("react-pdf")` dinámico (pasa por el optimizador de deps de Vite → `node_modules/.vite/deps/react-pdf.js?v=...`, al re-optimizar cambia el hash → 404 "Failed to fetch dynamically imported module"). NO tocar `vite.optimizeDeps` (excluir react-pdf rompe el interop CJS de `warning` → "does not provide an export named 'default'"). Lazy: gate interno `useIsVisible` (IntersectionObserver). Carga: watchdog 25s + `onLoadError` de `<Document>` → `err` + botón "Reintentar" (remonta el Document vía `key={retryKey}`; nunca queda en "Cargando..." infinito). Fullscreen: `expanded` desacoplado de la API nativa (fallback overlay `fixed inset-0` en iOS, que no soporta Fullscreen API).
- Rate limiting: tabla `rate_limits` (no Map en memoria).
- MP sin portal hosted: `/api/portal` devuelve `{ note }` → se muestra con `alert()`.
- **Webhook MP:** usar SIEMPRE `WebhookSignatureValidator` del SDK `mercadopago` (manifest `id:...;request-id:...;ts:...;`), NUNCA a mano (el formato viejo daba 401 a todo). No usar `toleranceSeconds`.
- **Webhook Stripe:** la URL del endpoint DEBE ser `https://www.comunidadtriba.com/api/webhook/stripe` (Stripe no sigue redirects). Endpoint actual `we_1U0oMpLIVKTt84JHCIMqOheW` (recreado 4-Ago, secret sincronizado en Vercel + `.env`). Esta cuenta NO expone `current_period_start/end` → usar `periodRange()` con fallback `start_date ?? created`, fin = inicio + 30d (nunca `new Date(undefined*1000)`). Al activar una sub real, marcar `status='canceled'` la sub `migrated` del user.
- **Sin ISR:** todo SSR on-demand (el ISR cacheaba por URL ignorando cookies y también los POST de `/api/*`).
- **URL del sitio:** única fuente `astro.config.mjs site` → `SITE_URL`/`getSiteOrigin()` de `src/lib/site-url.ts`. NUNCA derivar de `request.url` (en Vercel el host es `localhost` y rompía `back_url` de MP).

## Auth
- Única página `/iniciar-sesion`; post-login: `?redirect=` explícito o por `profiles.role` (admin → `/admin`). Middleware protege `/admin*`.
- Email de confirmación OFF (alta instantánea); email duplicado → `identities: 0` → aviso "Ya existe una cuenta".
- SMTP de Supabase Auth = Sender (solo reset de password; el default de Supabase limita 2/hora → NO usar).
- Checkout sin sesión: `checkout-intent` (TTL 24h) → `/iniciar-sesion?signup=true&redirect=...` → `flushPendingCheckout`.

## Admin
- Promover admin: `update public.profiles set role='admin' where email='...'` · Fix: `node --env-file=.env scripts/fix-admin.mjs <email> '<password>'`
- Nueva edición `/admin/ediciones/nuevo`: portada ≤5MB, PDF ≤80MB, featured única
- Cancelar sub manual `/admin/suscriptoras` → RPC `cancel_subscription` (solo DB local) · Aprobar creator `/admin/creators?status=pending`
- **Reembolsar suscripción:** botón "Reembolsar" en `/admin/suscriptoras` (junto a "Cancelar", visible para subs Stripe/MP activas). `POST /api/admin/subscribers/[id]/refund` → reembolsa último cobro en el gateway + cancela suscripción + RPC `cancel_subscription` + log `subscriber.refunded` en `admin_audit_log`. Stripe: usa `invoicePayments.list` (API dahlia no expone `charge`/`payment_intent` directo en Invoice). MP: busca pagos por `preapproval_id`, reembolsa el último `approved`, cancela preapproval vía SDK. Migrated: solo cancela acceso local.
- Storage: bucket público `editions` (`src/lib/storage.ts:uploadEditionFile`)
- Notificar edición: `POST /api/admin/editions/[id]/notify` → `sendNewEditionEmail` a `role='subscriber'`
- **Suscriptoras migradas:** tab "Migradas" (`status=migrated`) lista `subscriber_migrations` incluidas las sin cuenta (`searchMigratedSubscribersForAdmin`); stat `totalMigrated` + card `migrated_subscribers` en dashboard.

## Estructura
```
triba/
├── public/
├── supabase/migrations/
├── src/
│   ├── components/          # Astro + PDFViewer.tsx (React)
│   ├── layouts/             # Layout.astro + global.css
│   ├── lib/                 # Clients y config (+ admin/)
│   ├── middleware.ts
│   ├── pages/               # Rutas (.astro) + api/
│   └── scripts/
├── astro.config.mjs
└── tailwind.config.mjs
```

## Newsletter / Sender
- Flujo: `POST /api/newsletter` → `newsletters` → `{ok:true}` / `{existing:true}` (código 23505). **Idempotente:** en `existing` lee `sender_synced`; si el welcome nunca llegó (`sender_synced=false`) re-hace el alta en Sender (re-dispara la automatización de bienvenida) devolviendo `{existing:true, resynced}`; para ya sync'eados no re-dispara (`resynced:false`). El handler `setupNewsletterForm` deshabilita el botón en vuelo + `aria-live` en el mensaje. Welcome gratuito = automatización de Sender (no en la app); pagos → `sendWelcomeEmail(email,false)`. `.env`: `PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SENDER_API_KEY`, `SENDER_FROM_EMAIL`, `SENDER_FROM_NAME`.
- Sender API v2, `Authorization: Bearer`. **Alta a grupo en UNA llamada:** `POST /subscribers` con `groups:[id]` + `trigger_automation` (NO usar `/subscribers/groups/{id}` para nuevos: 400 hasta ~15s de propagación). Emails transaccionales: `POST /message/send`.
- Grupos: `newsletter-gratuito` / `suscriptora-paga`. Automatización welcome ACTIVE; newsletter mensual = broadcast manual.
- Dominio verificado; `SENDER_FROM_EMAIL: hola@comunidadtriba.com`. Plan free: **429 a nivel cuenta** al superar cuota. Cliente central: `src/lib/sender.ts`.

## Migración WooCommerce
- 92 pagos Stripe en `subscriber_migrations` (CSV `suscriptoresViejos.csv` = export de clientes Stripe, `customer_id: cus_*`). `handle_new_user()`: email en tabla → `role=subscriber` + sub `migrated` (7 días), sub Stripe real si `stripe_subscription_id` (26 recreadas 4-Ago: 21 activas, 6 `incomplete`) o sub MP real si `mp_preapproval_id` (migración `012`). PDF access permite `status='migrated'`.
- **MP (6 activas recuperadas 6-Ago):** las preaprobaciones viejas de WooCommerce (`reason: Pedido NNNN`/`Abono mensual`, creadas <2026-08-01) NO estaban en el CSV ni en la base; viven solo en Mercado Pago. `scripts/import-migrated-mp.mjs [--real]` las mapea a `subscriber_migrations` (`mp_preapproval_id` + `mp_plan_currency` ARS) resolviendo el email vía `GET /authorized_payments/search?preapproval_id=` → `GET /v1/payments/{id}` (la API NO expone `payer_email` en la preaprobación; `payments/search?preapproval_id=` devuelve 400). Al registrarse, `handle_new_user` crea sub `mercadopago` real renovable por el webhook. 6 emails: candecanevari06, ana_cari76@hotmail, yobelenbianco, maianeer30, agustinasafarian, victoriaguinea (gmail todos salvo indicado).
- **Reembolso MP:** `refund.ts` usa la cadena `authorized_payments/search` → `payments/{id}/refunds` (NO `payments/search?preapproval_id=`, que MP rechaza con 400).
- Imports idempotentes: `node --env-file=.env scripts/import-wp-subscribers.mjs <csv>` y `scripts/recreate-migrated-billing.mjs`. Excluidas test: `ing.azularganaras@gmail.com`, `comunidadtriba@gmail.com`. MP sin email vía API (10 `pending` + 2022 `Abono mensual`): no recuperables sin export de WooCommerce.

## Próximo
- Reintentar 4 faltantes de Sender (`jimena.1310@outlook.es`, `valentinave.98@gmail.com`, `sylvanalopez45@gmail.com`, `mariaclaudiaherrera2009@hotmail.com`) con el import tras `2026-08-04T17:02:44Z` (429).
- Avisar a las 6 MP mapeadas (candecanevari06, ana_cari76@hotmail, yobelenbianco, maianeer30, agustinasafarian, victoriaguinea) que se registren en el sitio nuevo: hasta no crear cuenta, pagan pero no tienen acceso.
- Limpiar `comunidadtriba+liveverify1785776465@gmail.com` de Sender. Evaluar plan pago Sender si sube volumen.

## Deuda de tipos
**`npx astro check` → 0 errores · `npm run build` OK** (5-Ago-2026).

⚠️ `src/lib/database.types.ts` debe mantenerse en formato canónico y sincronizado con `supabase/migrations/` (tablas, columnas, funciones): si falta una clave, todo `.from()` resuelve a `never[]`.

Lecciones (evitar regresión):
- Scripts Astro: usar SIEMPRE `onPageCycle(fn)` (`src/lib/onPageCycle.ts`), que llama `fn()` directo + suscribe `astro:page-load`. Sin View Transitions (CSP `frame-src 'none'`, commit `2499658`) `astro:page-load` NUNCA dispara; el `fn()` directo es lo que corre en carga inicial. Usar solo `addEventListener("astro:page-load", ...)` deja los forms sin handlers (submit nativo sin `preventDefault`) → "no ingresa / no aparece cartel" (bug que pasó en `NewsletterForm`, 6-Ago). El listener inerte NO duplica (los duplicados reales venían de doble-click, resueltos con triggers de migración `015` + botón deshabilitado).
- En `NodeListOf.forEach` NO tipar el parámetro como `HTMLElement` (2345): tipar la variable en la declaración (`querySelectorAll<HTMLDetailsElement>`); para `.open` de `<details>` usar `HTMLDetailsElement`.
- No usar tipos `HTML*Attribute` en templates `.astro` (2304): unión literal en `Props`.
- Custom DOM props: intersección `as HTMLElement & { _revealSplit?: boolean }`.
- El narrowing NO propaga a closures/handlers: usar `!`.
