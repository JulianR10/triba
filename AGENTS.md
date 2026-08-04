# TRIBA

Revista digital mensual — newsletter gratuito + suscripción paga. Escrita por y para mujeres, sobre cultura, arte e identidad.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Astro 5 (`@astrojs/vercel`) |
| Estilos | Tailwind CSS 3, mobile-first |
| BBDD / Auth / Storage | Supabase |
| Pagos | Stripe + Mercado Pago (webhooks) |
| Newsletter + Email | Sender (send.net) — API v2 |
| Visor PDF | `react-pdf` v10, dynamic import (React island) |

## Sistema visual

- **Colores (Tailwind):** `triba-red #E91A39` · `triba-pink #FFCCE4` · `triba-cream #FFF8EE` · `triba-green #BCE85E` · `triba-brown #35220A` · `triba-bone #f2f1eb` · `triba-white` · `triba-black`
- **Tipografía:** Bootzy TM (displays) · Montserrat (body) · Times New Roman itálica (cursivas)
- **Fondos:** `fondo-cielo.webp`, `fondo-1.png`, `fondo-3.png`

## Navegación

| Rol | Items |
|---|---|
| Público | INICIO · REVISTA · SUSCRIBIRME · TRIBA CREATORS · INICIAR SESION |
| Suscriptora | MI PERFIL · REVISTA · TRIBA CREATORS |

## Convenciones

- Naming: kebab archivos, PascalCase componentes, camelCase vars
- Astro: Layout + SEO en páginas, scripts con patrón `setup(); document.addEventListener("astro:page-load", setup)`
- Server routes: `APIRoute`, auth con `requireUser`/`requireAdmin`
- UI en español rioplatense, código/logs en inglés
- Migraciones SQL en `supabase/migrations/`, secuenciales, idempotentes

## Quirks clave

- **`--nav-height`:** Navbar lo setea con `ResizeObserver`. Secciones usan `padding-top: max(1rem, var(--nav-height, 64px))`.
- **PDFViewer (`client:visible`, ~48kB):** no cambiar a `client:load`. `minHeight` tracking desde `page.getViewport()` + `aspectRatioRef` contra layout shift. Fullscreen: `pageWidth = viewportHeight - 110`, `scale` se resetea a 1 al salir.
- **Rate limiting:** tabla `rate_limits` en Supabase (no Map en memoria).
- **MP no tiene portal hosted:** `/api/portal` devuelve `{ note }`, se muestra con `alert()`.
- **⚠️ Webhook MP (`/api/webhook/mercadopago`):** usar SIEMPRE el `WebhookSignatureValidator` del SDK `mercadopago` (manifest `id:...;request-id:...;ts:...;`). NUNCA implementar el manifest a mano: el formato anterior (comas + `user_id`) rechazaba 401 todos los webhooks (los pagos de MP jamás activaban la suscripción). No usar `toleranceSeconds` (MP manda `ts` en segundos y el SDK compara contra ms).
- **CSP:** cadenas precomputadas al importar `middleware.ts`.
- **⚠️ Webhook Stripe (`/api/webhook/stripe`):** la URL del endpoint en Stripe DEBE ser `https://www.comunidadtriba.com/api/webhook/stripe`. Stripe NO sigue redirects y considera 3xx como fallo → si apuntaba a `comunidadtriba.com` (sin www, responde 308), toda entrega quedaba `pending` y el pago jamás activaba la suscripción (los pagos quedaban solo en Stripe). Al arreglar la URL, Stripe reintenta automáticamente los eventos pendientes (hasta 3 días). Endpoint actual: `we_1U0oMpLIVKTt84JHCIMqOheW` (recreado 4-Ago-2026 con secret nuevo, sincronizado en Vercel env + `.env`; el viejo `we_1TuYU7` tenía el secret desincronizado del de Vercel → recrear endpoint + sincronizar es la forma determinística de arreglar). ⚠️ Esta cuenta de Stripe (nuevo billing model) NO expone `current_period_start`/`current_period_end` en el objeto subscription (`undefined`) → el handler usa `periodRange()` con fallback `start_date ?? created` y fin = inicio + 30 días (no usar `new Date(undefined*1000).toISOString()`: lanza RangeError → 500 → retry infinito). Al activar una sub real, el webhook marca `status='canceled'` la sub `migrated` del usuario (evita que reaparezca "vía Migrated / 7 días" en la UI).
- **Sin ISR:** `astro.config.mjs` usa `adapter: vercel()` sin `isr`. Todo es SSR on-demand por request (el Navbar y el contenido dependen de la sesión; el ISR cacheaba por URL ignorando cookies y servía nav/estado ajeno 24h). No reintroducir ISR: también cacheaba los POST de `/api/*`.
- **URL del sitio:** única fuente = `astro.config.mjs site` (`import.meta.env.SITE`). Usar `SITE_URL`/`getSiteOrigin()` de `src/lib/site-url.ts`. NUNCA derivar del request: en Vercel `request.url` tiene host `localhost` (el adapter no pasa `allowedDomains`), lo que rompía `back_url`/`success_url` (MP rechazaba `https://localhost`). No hardcodear el dominio por separado.

## Auth

- Página única `/iniciar-sesion`. Post-login: `?redirect=` explícito → respeta; sino `profiles.role` → admin a `/admin`, otro a `/mi-cuenta`.
- Middleware protege `/admin*`. Si no es admin → redirect a `/`.
- **Email de confirmación OFF** en Supabase (alta instantánea). El alta con email ya existente devuelve `identities: 0` → la app avisa "Ya existe una cuenta" en vez de mostrar "revisá tu email".
- **Custom SMTP en Supabase Auth = Sender** (`smtp.sender.net:587`, AUTH PLAIN/LOGIN, sender `hola@comunidadtriba.com`). Solo queda para reset de contraseña. El email de Supabase por defecto tiene límite de 2/hora a nivel proyecto → NO usar.
- Checkout sin sesión: guarda `checkout-intent` (TTL 24h) y redirige a `/iniciar-sesion?signup=true&redirect=...` → `flushPendingCheckout` re-dispara el pago al volver.

## Admin

- **Promover admin:** `update public.profiles set role = 'admin' where email = 'tu@email.com';`
- **Fix admin:** `node --env-file=.env scripts/fix-admin.mjs <email> '<password>'`
- **Nueva edición:** `/admin/ediciones/nuevo` → portada ≤5MB, PDF ≤80MB, featured única
- **Cancelar suscripción manual:** `/admin/suscriptoras` → RPC `cancel_subscription(user_id)` (solo DB local)
- **Aprobar creator:** `/admin/creators?status=pending`
- **Storage:** bucket público `editions`, helper `src/lib/storage.ts:uploadEditionFile`
- **Notificar nueva edición:** `POST /api/admin/editions/[id]/notify` → email a todas las suscriptoras (`role = subscriber`) vía `sendNewEditionEmail` (`src/lib/email.ts`, template de bienvenida con portada + link).

## Estructura

```
triba/
├── public/
├── supabase/migrations/
├── src/
│   ├── components/          # Astro + PDFViewer.tsx (React)
│   ├── layouts/             # Layout.astro + global.css
│   ├── lib/                 # Clients y config
│   │   └── admin/
│   ├── middleware.ts
│   ├── pages/               # Rutas (.astro) + api/
│   └── scripts/
├── astro.config.mjs
└── tailwind.config.mjs
```

## Newsletter (Ago 2026)

**Flujo:** `POST /api/newsletter` inserta en `newsletters` → `{ok:true}` (nuevo) o `{existing:true}` (duplicado, código 23505). No envía welcome gratuito: lo dispara la automatización de Sender. Webhooks de pago llaman `sendWelcomeEmail(email, false)` (bienvenida paga). `.env`: `PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SENDER_API_KEY`, `SENDER_FROM_EMAIL`, `SENDER_FROM_NAME`.

**Sender (send.net):** API v2 `https://api.sender.net/v2`, `Authorization: Bearer <token>`.
- **Alta a grupo en UNA sola llamada:** `POST /subscribers` con `groups: [groupId]` (crea/actualiza + asigna + `trigger_automation: true`). ⚠️ NO usar `POST /subscribers/groups/{groupId}` para nuevos: falla 400 hasta que Sender propaga (~15s).
- Emails transaccionales: `POST /message/send` (`{ from:{email,name}, to:{email}, subject, html }`).
- Grupo `newsletter-gratuito` ↔ suscripción gratuita; `suscriptora-paga` ↔ pagos.
- Automatización `newsletter-gratuito` ACTIVE (welcome al unirse). Newsletter mensual = Broadcast manual desde Sender.
- Dominio `comunidadtriba.com` verificado (SPF/DKIM/DMARC OK). `SENDER_FROM_EMAIL`: `hola@comunidadtriba.com`.
- Cuenta definitiva recreada Ago 2026, aprobada. Plan gratuito: **429 rate limit a nivel cuenta** al superar cuota.
- `src/lib/sender.ts` es el cliente central (reemplaza Kit + Resend).

**Migración WooCommerce:** 92 suscriptores pagos en `subscriber_migrations` (CSV fuera del repo). Trigger `handle_new_user()`: si el email está en la tabla → `role=subscriber` + suscripción `migrated` (7 días de cortesía). Las que tienen `stripe_subscription_id` (billing recreado, ver `scripts/recreate-migrated-billing.mjs`) linkean la sub real de Stripe. PDF access permite `status='migrated'`. Import: `node --env-file=.env scripts/import-wp-subscribers.mjs ./suscriptoresViejos.csv` (idempotente).
- **Cobro automático recreado (4-Ago-2026):** el sitio WooCommerce viejo murió (dominio → web nueva, `wp-login.php` 403) → los cobros recurrentes de Stripe se cortaron. Se recrearon **26 subscriptions** en Stripe (precio viejo €10,5/mes, `price_1U0obKLIVKTt84JHfVQV5CRI`) para las que tenían tarjeta + historial, con `billing_cycle_anchor` = último cobro + 30 días (si quedaba en el pasado, arranque inmediato = reactivación). Estado: **21 activas, 6 `incomplete`** (tarjetas viejas/declinadas → al registrarse tienen la cortesía de 7 días y pueden actualizar tarjeta). Script idempotente: `node --env-file=.env scripts/recreate-migrated-billing.mjs` (mapping a `subscriber_migrations.stripe_subscription_id`). Migration `010_subscriber_stripe_link.sql` agrega las columnas + `handle_new_user` linkea la sub real al registrarse. ⚠️ Excluidas por test: `ing.azularganaras@gmail.com`, `comunidadtriba@gmail.com`. Ojo: MP tenía 34 preaprobaciones viejas (12 cancelled, 16 pending, 6 authorized sin cobros reales) — se dejaron intactas.

**UI NewsletterForm:** mensaje de éxito/error al lado del input, `triba-red`.

## Próximo

- Reintentar los **4 suscriptores faltantes** de Sender (`jimena.1310@outlook.es`, `valentinave.98@gmail.com`, `sylvanalopez45@gmail.com`, `mariaclaudiaherrera2009@hotmail.com`) con el import de WooCommerce tras `2026-08-04T17:02:44Z` (429 a nivel cuenta).
- Limpiar email de prueba `comunidadtriba+liveverify1785776465@gmail.com` de Sender (mismo rate limit).
- Evaluar plan pago de Sender si sube el volumen (automations/broadcast en vez de manual).

## Deuda de tipos

**`npx astro check` → 0 errores** (4-Ago-2026, Tier 2 completo). `npm run build` OK.

**Server-side queda en 0** (Ago 2026). El problema raíz era `src/lib/database.types.ts`: le faltaban `Views`/`Enums`/`CompositeTypes`, `rate_limits`, `subscriber_migrations` y los valores `'migrated'` → el genérico `createClient<Database>` no satisfacía `GenericSchema` y **todo `.from()` resolvía a `never[]`**. ⚠️ Mantener `database.types.ts` en formato canónico y sincronizado con `supabase/migrations/` (agregar cada tabla/función/columna nueva): si vuelve a faltar una clave o se desfasa, reaparece el `never[]` masivo.

### Cierre Tier 2 (4-Ago-2026): 0 errores

Limpios: `iniciar-sesion.astro`, `Navbar.astro`, `mi-cuenta.astro`, `triba-creators.astro`, `revista.astro`, `index.astro`, `MagazineCarousel.astro`, `MagazineSlider.astro`, `suscribirme.astro`, `Layout.astro`, `Input.astro` (prop `type?: "text"|"email"|"password"|"url"|"tel"|"number"|"search"`), `Button.astro` (prop `id?`).

**⚠️ Lecciones aprendidas (evitar regresión):**
- En callbacks de `NodeListOf.forEach`, **no tipar el parámetro** como `HTMLElement` (2345: `Element` no acepta parámetro `HTMLElement`) — tipar la variable con `querySelectorAll(...) as NodeListOf<HTMLElement>` en la declaración.
- No referenciar tipos `HTML*Attribute` en templates `.astro` (2304): usar unión literal en `Props` en su lugar.
- Propiedades custom de DOM (`_revealSplit`): tipar con intersección `as HTMLElement & { _revealSplit?: boolean }`.
- El narrowing de guards NO propaga a closures/handlers: usar `!` (`btn!.click()`, `selectCurrency(btn.dataset.currency!)`).
