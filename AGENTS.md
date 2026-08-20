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
- **Webhook MP:** usar SIEMPRE `WebhookSignatureValidator` del SDK `mercadopago` (manifest `id:...;request-id:...;ts:...;`), NUNCA a mano (el formato viejo daba 401 a todo). No usar `toleranceSeconds`. **Self-healing:** NO depender de que llegue `subscription_preapproval` con status `authorized` (si llega `pending` o el evento no está suscripto, se perdía el acceso aunque el cobro se hiciera). El webhook debe activar también desde `subscription_authorized_payment` aprobado: si no existe la sub, regenera desde el preapproval (`external_reference` → userId; fallback por email vía `authorized_payments/search` → `v1/payments/{id}`, NUNCA `preapproval.payer_email`). `activateSubscription()` = upsert `onConflict: provider,provider_subscription_id` + perfil (`subscription_id`, role subscriber, email SOLO si viene, nunca null como Stripe) + cancelar sub `migrated`; welcome/Sender solo si la sub es nueva (MP retries 96h duplicarían emails). URL endpoint: `https://www.universotriba.com/api/webhook/mercadopago` (verificar en dashboard MP que `subscription_preapproval.*` y `subscription_authorized_payment.*` estén activos).
- **Reconciliación MP:** `scripts/reconcile-mp-subscribers.mjs [--real]` activa retroactivamente a pagadores MP sin acceso (lista preaprobaciones authorized/active, resuelve email, linkea sub a cuenta existente). Idempotente, DRY-RUN por defecto. Iterar hasta que "Ya linkeadas" = total.
- **Webhook Stripe:** la URL del endpoint DEBE ser `https://www.universotriba.com/api/webhook/stripe` — host `www`, NO el apex `universotriba.com`: el apex redirige 308 a `www` y Stripe NO sigue redirects (un webhook en apex deja caer todos los pagos). Endpoint actual `we_1U1plgLIVKTt84JHLV8gZN41` (recreado 7-Ago en la mudanza de dominio; sincronizado en Vercel + `.env`). Esta cuenta NO expone `current_period_start/end` → usar `periodRange()` con fallback `start_date ?? created`, fin = inicio + 30d (nunca `new Date(undefined*1000)`). Al activar una sub real, marcar `status='canceled'` la sub `migrated` del user.
- **Sin ISR:** todo SSR on-demand (el ISR cacheaba por URL ignorando cookies y también los POST de `/api/*`).
- **NO acepta POST `multipart/form-data`:** `security.checkOrigin: false` en `astro.config.mjs` (Astro 5 lo trae activo y en Vercel el `Origin` del browser nunca coincide con `url.origin` del runtime → 403 "Cross-site POST form submissions are forbidden" a TODO form-post). La app publica con JSON vía fetch (todo `/api/*` es JSON). NO re-introducir submits de formulario nativos ni `Content-Type: multipart/form-data`/`application/x-www-form-urlencoded`.
- **En Astro NO evaluar `{expr}` dentro de `<script>`**: queda como texto literal (probado en 5.18, ni con `is:inline`). Para data-JSON usar `<script type="application/json" set:html={JSON.stringify(...)}>` (esto rompía el carrusel "Tus tomos": `JSON.parse` de `"{JSON.stringify(editionsPayload)}"` literaldejaba el track vacío). Para valores en clientes usar `data-*` o `import.meta.env`.
- **URL del sitio:** única fuente `astro.config.mjs site` → `SITE_URL`/`getSiteOrigin()` de `src/lib/site-url.ts`. NUNCA derivar de `request.url` (en Vercel el host es `localhost` y rompía `back_url` de MP).

## Auth
- Única página `/iniciar-sesion`; post-login: `?redirect=` explícito o por `profiles.role` (admin → `/admin`). Middleware protege `/admin*`.
- Email de confirmación OFF (alta instantánea); email duplicado → `identities: 0` → aviso "Ya existe una cuenta".
- SMTP de Supabase Auth = Sender (solo reset de password; el default de Supabase limita 2/hora → NO usar).
- Checkout sin sesión: `checkout-intent` (TTL 24h) → `/iniciar-sesion?signup=true&redirect=...` → `flushPendingCheckout`.
- **Acceso de suscriptora = helper `isActiveSubscription(status)` de `src/lib/subscription-status.ts`** (`active` o `migrated`). Usarlo SIEMPRE para gatear acceso (PDF, mi-cuenta tomos, menu cuenta, admin "Activas"); NO comparar `=== "active"` a mano (mi-cuenta no mostraba los tomos a migradas).

## Admin
- Promover admin: `update public.profiles set role='admin' where email='...'` · Fix: `node --env-file=.env scripts/fix-admin.mjs <email> '<password>'`
- Nueva edición `/admin/ediciones/nuevo`: portada ≤5MB, PDF ≤50MB, featured única
- Cancelar sub manual `/admin/suscriptoras` → RPC `cancel_subscription` (solo DB local) · Aprobar creator `/admin/creators?status=pending`
- Nueva edición `/admin/ediciones/nuevo`: portada ≤5MB, PDF ≤50MB, featured única
- **Reembolsar suscripción:** botón "Reembolsar" en `/admin/suscriptoras` (junto a "Cancelar", visible para subs Stripe/MP activas). `POST /api/admin/subscribers/[id]/refund` → reembolsa último cobro en el gateway + cancela suscripción + RPC `cancel_subscription` + log `subscriber.refunded` en `admin_audit_log`. Stripe: usa `invoicePayments.list` (API dahlia no expone `charge`/`payment_intent` directo en Invoice). MP: busca pagos por `preapproval_id`, reembolsa el último `approved`, cancela preapproval vía SDK. Migrated: solo cancela acceso local.
- **Upload directo a Supabase Storage (NO por Vercel):** Vercel limita el body de serverless a 4.5MB (PDFs >4.5MB → 413 al publicar). Flujo: `EditionForm.astro` → `POST /api/admin/uploads/sign` (JSON chico) → `createSignedUploadUrl(path, { upsert: true })` → el navegador hace `PUT` directo al `signedUrl` → el form recién POSTea/PATCHea la edición con `cover_url`/`pdf_url` (sin files). NO re-introducir `request.formData()` con files en `/api/admin/editions` ni `uploadEditionFile` server-side en ese flujo (ya no sube archivos; quedó como fallback/uso legacy). `buildStoragePath` en `storage.ts` arma los paths (reutilizar, no duplicar). `createSignedUploadUrl` con `upsert:true`: el PUT del cliente solo manda `Content-Type` (safelist CORS, sin headers custom para evitar preflight). El POST crea/el PATCH actualiza respetando `featured`/`badge` del form (bug resuelto: antes se hardcodeaban `false`/`null`).
- Notificar edición: `POST /api/admin/editions/[id]/notify` → `sendNewEditionEmail` a `role='subscriber'`
- **Suscriptoras migradas:** tab "Migradas" (`status=migrated`) lista `subscriber_migrations` incluidas las sin cuenta (`searchMigratedSubscribersForAdmin`); stat `totalMigrated` + card `migrated_subscribers` en dashboard.

## Revista bilingüe (ES/EN)
- **Modelo:** `editions` = el EJEMPLAR/producto (id, edition_number, kind, featured, published_at); `edition_languages` = la VERSIÓN localizada (edition_id FK CASCADE, language 'es'|'en', title, description, cover_url, pdf_url, badge; UNIQUE(edition_id, language)). UN ejemplar → dos versiones; el EN es opcional (estado "English coming soon").
- **Migración `018` = EXPAND** (agrega `edition_languages`, backfill ES desde las columnas legacy, `editions_edition_number_unique` parcial). **Migración `019` = CONTRACT (APLICADA):** ya no existen `title/description/cover_url/pdf_url/badge` en `editions` (dropeadas; la app no debe leerlas). `editions` = solo `id, edition_number, kind, featured, published_at, created_at`. Todo el contenido vive en `edition_languages`. `019` también agrega `profiles.preferred_locale` (text, default 'es', check `es|en`).
- **Acceso por idioma:** helpers de `src/lib/editions.ts` (`getEditions(lang)`, `getFeaturedEdition(lang)`, `getFreeArticle(lang)`, `getEditionBySlug(slug, lang)`, `getEditionLanguages(id)`) devuelven `EditionView` = ejemplar + versión elegida + `isFallback` (EN pedido sin versión → cae a ES) + `hasEn`. Usar SIEMPRE estos helpers, no queries sueltas.
- **`/api/pdf/{id}` retrocompatible:** `id` puede ser `edition_languages.id` (nuevo) O `editions.id` legacy (emails viejos) + `?lang=` (default es, fallback ES). No romper esa resolución.
- **Admin:** form bilingüe (`EditionForm`) manda `kind`, `edition_number`, `featured` + `es_*`/`en_*` (title/description/cover_url/pdf_url/badge). EN vacío = se omite/elimina la versión EN (limpiar toda la sección EN quita el inglés). Validación en `src/lib/admin/editions.ts` (`editionFormToInput`/`validateEditionInput`). Uploads: `/api/admin/uploads/sign` acepta `language`; `buildStoragePath` incluye `-{lang}` (`pdfs/revista-{n}-{es}.pdf`, `covers/edicion-{n}-{es}-{ts}.ext`). Uploads todo-o-nada (4 slots).
- **`scripts/import-pdfs.mjs` está DEPRECADO** (escribe columnas legacy; re-correrlo falla). Alta mensual = `/admin/ediciones`.
- **Tipos (`database.types.ts`):** `edition_languages.Relationships → editions` declarado (habilita el embed to-one `editions(...)` en `/api/pdf`). NO declarar la relación parent-side en `editions` (tipa mal el embed `edition_languages(*)` como objeto single; usar dos queries como en `src/lib/admin/editions.ts`).
- Email "nueva edición" linkea a `/{SITE_URL}/revista/edicion-{N}` (NUNCA `/revista/{id}`); para suscriptoras con `preferred_locale='en'` a `/{SITE_URL}/en/revista/edicion-{N}`.
- **Fase E (emails por `preferred_locale`):** `src/lib/email.ts` está localizado (`sendWelcomeEmail(to, showCta, locale)` / `sendNewEditionEmail(to, edition, locale)`, ES/EN + links `/en/...`). `preferred_locale` se setea en: signup desde la página EN (`AuthPage` → `POST /api/locale`) y al togglear el switcher con sesión (`Navbar` → `POST /api/locale`). Webhooks (`stripe.ts`/`mercadopago.ts`) resuelven el locale con `getPreferredLocale(userId)` de `src/lib/locale-pref.ts`. `notify.ts` usa `preferred_locale` por suscriptora y manda la versión EN de `edition_languages` si existe (fallback ES).

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

## i18n (Fase D — mi-cuenta + legales EN, completa)
- `astro.config.mjs`: `i18n: { locales: ["es","en"], defaultLocale: "es", routing: { prefixDefaultLocale: false } }` → `/` = es, `/en/` = en. `/es/` NO existe (404; el locale default no tiene prefijo).
- **Patrón de rutas FÍSICAS (SSR), NO `[lang]`:** NO usar `src/pages/[lang]/...` con `getStaticPaths` — en SSR el router ignora `getStaticPaths` (log "ignored in dynamic page") y `[lang]` solo matchea con segmento: `/es/` y `/en/` sí, pero `/` (locale default sin prefijo) queda 404. Cada página ES + su par `src/pages/en/*.astro` renderizan UN componente compartido `<X lang>` en `src/components/`. Actuales: `Home`, `MagazinePage` (revista), `EditionDetail` (revista/[slug]), `SubscribePage` (suscribirme), `CreatorsPage` (triba-creators), `AuthPage` (iniciar-sesion), `MyAccountPage` (mi-cuenta), `PrivacyPage` (privacidad), `TermsPage` (terminos). `lang` llega por `Astro.props`, nunca por `Astro.params`.
- Diccionarios tipados: `src/i18n/ui.ts` (`t(lang)`, tipo `Locale`, claves: nav, footer, layout, notFound, accountMenu, newsletter, home, magazine, edition, subscribe, creators, auth, miCuenta, privacy, terms). Helpers: `src/i18n/locale.ts` → `EN_ROUTES` (Set de rutas canónicas ES con versión EN: `/`, `/revista`, `/suscribirme`, `/triba-creators`, `/iniciar-sesion`, `/mi-cuenta`, `/privacidad`, `/terminos`), `isEnRoute(path)` (cubre sub-rutas dinámicas: `/revista` matchea `/revista/edicion-3`), `isEnPath`, `getLocaleFromUrl`, `toEsPath`, `localizePath` (cae a ES si la ruta no está en `EN_ROUTES`), `switchPath`.
- `locals.locale` lo setea el middleware (`getLocaleFromUrl(context.url)`, con fallback a cookie `triba_locale` — semilla para Fase E, no cambia el render: las rutas físicas deciden). `<html lang={locale}>` y `og:locale` desde el dict.
- Switcher en `Navbar`: links `data-locale-switcher="es|en"` (desktop + mobile) con `aria-current="true"` en el activo; script inline `setupLocaleSwitcher` setea cookie `triba_locale=<es|en>; path=/; max-age=31536000; SameSite=Lax` (client-side, no hay server handling). Todos los links internos (nav, logo, footer, CTAs) pasan por `localizePath`/`switchPath` → el idioma "pega" navegando; el switcher es la única forma de cambiar.
- `404.astro` es locale-aware (usa `getLocaleFromUrl`; `/en/*` inexistente → 404 en inglés).
- Datos a scripts por `data-*` (p.ej. `data-messages={JSON.stringify(...)}` en `NewsletterForm`, `CheckoutButton`, `CreatorsPage`, `AuthPage`, `data-mi-cuenta-messages` en `MyAccountPage`) — nunca `{expr}` en `<script>`.
- Dependencias localizadas: `subscriptionStatusInfo(status, locale)` (`src/lib/subscription-status.ts`, labels ES/EN); `CheckoutButton` y `FlipCover`/`MagazineCard`/`MagazineCarousel`/`MagazineSlider` aceptan `lang`; `CheckoutButton` redirige a `/en/iniciar-sesion` cuando la página es EN; `AuthPage` redirige post-login a `/en/mi-cuenta` (no admin) cuando la página es EN; `/api/pdf/{id}?lang=` en el detalle EN y mi-cuenta; carrusel "Tus tomos" en `MyAccountPage` linkea a `localizePath("/revista/...")`. **Solo `/admin*` queda ES**.

## Próximo
- Reintentar 4 faltantes de Sender (`jimena.1310@outlook.es`, `valentinave.98@gmail.com`, `sylvanalopez45@gmail.com`, `mariaclaudiaherrera2009@hotmail.com`) con el import tras `2026-08-04T17:02:44Z` (429).
- Avisar a las 6 MP mapeadas (candecanevari06, ana_cari76@hotmail, yobelenbianco, maianeer30, agustinasafarian, victoriaguinea) que se registren en el sitio nuevo: hasta no crear cuenta, pagan pero no tienen acceso.
- Limpiar `comunidadtriba+liveverify1785776465@gmail.com` de Sender. Evaluar plan pago Sender si sube volumen.

## Deuda de tipos
**`npx astro check` → 0 errores · `npm run build` OK** (20-Ago-2026, Fase E completa: migración `019` CONTRACT aplicada a prod — `editions` sin columnas legacy, `profiles.preferred_locale` con check `es|en` —; emails localizados por `preferred_locale` en `email.ts`, webhooks, `notify.ts` y `/api/locale`).
- Pendiente: cargar contenido EN de ediciones en `/admin/ediciones` (hoy `edition_languages` solo tiene `es`; los emails/lecciones EN caen a fallback ES).

⚠️ `src/lib/database.types.ts` debe mantenerse en formato canónico y sincronizado con `supabase/migrations/` (tablas, columnas, funciones): si falta una clave, todo `.from()` resuelve a `never[]`.

Lecciones (evitar regresión):
- Scripts Astro: usar SIEMPRE `onPageCycle(fn)` (`src/lib/onPageCycle.ts`), que llama `fn()` directo + suscribe `astro:page-load`. Sin View Transitions (CSP `frame-src 'none'`, commit `2499658`) `astro:page-load` NUNCA dispara; el `fn()` directo es lo que corre en carga inicial. Usar solo `addEventListener("astro:page-load", ...)` deja los forms sin handlers (submit nativo sin `preventDefault`) → "no ingresa / no aparece cartel" (bug que pasó en `NewsletterForm`, 6-Ago). El listener inerte NO duplica (los duplicados reales venían de doble-click, resueltos con triggers de migración `015` + botón deshabilitado).
- En `NodeListOf.forEach` NO tipar el parámetro como `HTMLElement` (2345): tipar la variable en la declaración (`querySelectorAll<HTMLDetailsElement>`); para `.open` de `<details>` usar `HTMLDetailsElement`.
- No usar tipos `HTML*Attribute` en templates `.astro` (2304): unión literal en `Props`.
- Custom DOM props: intersección `as HTMLElement & { _revealSplit?: boolean }`.
- El narrowing NO propaga a closures/handlers: usar `!`.
