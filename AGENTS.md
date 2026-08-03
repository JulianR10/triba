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

**Colores (Tailwind tokens):** `triba-red #E91A39` · `triba-pink #FFCCE4` · `triba-cream #FFF8EE` · `triba-green #BCE85E` · `triba-brown #35220A` · `triba-bone #f2f1eb` · `triba-white #FFFFFF` · `triba-black #000000`
**Tipografía:** Bootzy TM (displays) · Montserrat (body) · Times New Roman itálica (cursivas)
**Fondos:** `fondo-cielo.webp`, `fondo-1.png`, `fondo-3.png`

## Navegación

| Rol | Items |
|---|---|
| Público | INICIO · REVISTA · SUSCRIBIRME · TRIBA CREATORS · INICIAR SESION |
| Suscriptora | MI PERFIL · REVISTA · TRIBA CREATORS |

## Convenciones

- Naming: kebab archivos, PascalCase componentes, camelCase vars
- Astro: Layout + SEO en páginas, scripts con patrón `astro:page-load`
- Server routes: `APIRoute`, auth con `requireUser`/`requireAdmin`
- UI en español rioplatense, código/logs en inglés
- Migraciones SQL en `supabase/migrations/`, secuenciales, idempotentes

## Quirks clave

- **`--nav-height`:** Navbar lo setea con `ResizeObserver`. Secciones usan `padding-top: max(1rem, var(--nav-height, 64px))`.
- **View Transitions:** Scripts se re-ejecutan en cada navegación → patrón `setup(); document.addEventListener("astro:page-load", setup)`.
- **`client:visible` en PDFViewer:** ~48kB. No cambiar a `client:load`.
- **PDFViewer layout shift:** `minHeight` tracking desde `page.getViewport()` + `aspectRatioRef` para estabilidad al cambiar página.
- **Fullscreen:** `pageWidth` calculado con `viewportHeight - 110` para que entre sin scroll al 100%. `scale` se resetea a 1 al salir.
- **Rate limiting:** Tabla `rate_limits` en Supabase (no Map en memoria).
- **MP no tiene portal hosted:** `/api/portal` devuelve `{ note }`, se muestra con `alert()`.
- **CSP:** Cadenas precomputadas al importar `middleware.ts`.

## Auth

- Página única `/iniciar-sesion`. Post-login: `?redirect=` explícito → respeta. Sino: `profiles.role` → admin a `/admin`, otro a `/mi-cuenta`.
- Middleware protege `/admin*`. Si no es admin → redirect a `/`.

## Admin

Rutas `/admin/*` protegidas por middleware (rol admin).

- **Promover admin:** `update public.profiles set role = 'admin' where email = 'tu@email.com';`
- **Fix admin:** `node --env-file=.env scripts/fix-admin.mjs <email> '<password>'`
- **Nueva edición:** `/admin/ediciones/nuevo` → portada ≤5MB, PDF ≤80MB, featured única
- **Cancelar suscripción manual:** `/admin/suscriptoras` → llama RPC `cancel_subscription(user_id)` (solo DB local)
- **Aprobar creator:** `/admin/creators?status=pending`
- **Storage:** bucket público `editions`, helper `src/lib/storage.ts:uploadEditionFile`

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

## Newsletter — estado actual Ago 2026

**Backend (funciona):**
- `POST /api/newsletter` inserta en Supabase `newsletters` → responde `{ok:true}` o `{existing:true}`
- NO envía welcome email en el flujo gratuito: el email de bienvenida/newsletter lo manda la **automatización de Sender** (grupo `newsletter-gratuito`)
- Sincroniza a Sender (send.net) con grupo `newsletter-gratuito` (`syncFreeSubscriber`) y `suscriptora-paga` (`syncPaidSubscriber` en webhooks)
- Pagos: webhooks Stripe/MP siguen enviando `sendWelcomeEmail(email, false)` (bienvenida paga, distinta del newsletter gratuito)

**Sender (send.net):**
- API v2: base `https://api.sender.net/v2`, auth `Authorization: Bearer <token>`
- Grupos (`/groups`) reemplazan a los tags de Kit
- **Alta a grupo en UNA sola llamada:** `POST /subscribers` con `groups: [groupId]` (crea o actualiza el suscriptor y lo asigna al grupo al instante). `addSubscriberToGroup` usa `trigger_automation: true` → el alta dispara automatizaciones atadas al grupo. ⚠️ NO usar `POST /subscribers/groups/{groupId}` para suscriptores nuevos: falla con 400 "No existing subscriber emails provided" hasta que Sender propaga la creación (~15s)
- Emails transaccionales con `POST /message/send` (`{ from:{email,name}, to:{email}, subject, html }`)
- Reemplaza a Kit (newsletter) y Resend (welcome + nueva edición) — `src/lib/sender.ts` cliente central
- `SENDER_FROM_EMAIL`: `hola@comunidadtriba.com` (dominio verificado)
- **Automatización "Subscriber joins a group"** (`newsletter-gratuito` → email) creada en UI de Sender con el contenido de la campaña *"Ya publicamos la revista de Julio! - TRIBA"* (from: `newsletter@comunidadtriba.com`, `Comunidad Triba`). Faltaba ACTIVAR por revisión de cuenta Sender (ver abajo)
- Newsletter mensual se envía como Broadcast manual desde Sender al grupo correspondiente

**DNS / entrega (Ago 2026):**
- Dominio `comunidadtriba.com` **verificado en Sender**: SPF, DKIM y DMARC OK
- DKIM: CNAME `sender._domainkey` → `dkim.sendersrv.com`
- SPF `@`: `v=spf1 a mx include:_spf.mail.hostinger.com include:_spf.mlsend.com include:sendersrv.com ~all`
- Registros residuales ya borrados (TXT `send`, MX `send`, AAAA `prueba`, `litesrv._domainkey`, `resend._domainkey`, `mailerlite-domain-verification`)

**Cuenta Sender aprobada (Ago 2026):**
- Cuenta aprobada → `/subscribers` y `/message/send` funcionan (antes 401 por revisión)
- La cuenta actual es la **definitiva**; fue recreada en Ago 2026 (grupos `Test group`, `newsletter-gratuito`, `suscriptora-paga`)
- Verificado: `POST /message/send` OK, alta newsletter a grupo OK, workflow `newsletter-gratuito` ACTIVE (dispara welcome con `emails_sent: 1` tras el alta)
- En producción, `POST /api/newsletter` responde `{ok:true}` 200 en `comunidadtriba.com` y `triba.vercel.app` (Prueba 2 OK)
- ⚠️ El endpoint `/api/diagnose-email` se **eliminó** (Ago 2026): crasheaba en producción con `FUNCTION_INVOCATION_FAILED` en la función ISR de Vercel (bug del adapter `vercel({ isr })` con rutas API GET públicas, aún sin query params). No se usaba en la app; la validación de Sender queda cubierta por el flujo newsletter.
- **Fix ISR (Ago 2026):** `astro.config.mjs` → `isr.exclude: [/^\/api\//]`. Sin esto, **TODOS** los POST de `/api/*` se cacheaban 24h en `_isr` **por URL (ignorando el body)**: la función no se ejecutaba → el suscriptor nunca se insertaba ni se sincronizaba a Sender, aunque la UI mostraba "gracias por suscribirte". Diagnóstico: un POST inválido devolvía `{ok:true}` con `X-Vercel-Cache: HIT` en vez de 400. Verificado en vivo: POST inválido→400, nuevo→`{ok:true}` + fila en `newsletters`, duplicado→`{existing:true}`, sync a Sender OK. No tocar este exclude.

**Migración WooCommerce:**
- 92 suscriptores pagos viejos importados desde `suscriptoresViejos.csv` a `subscriber_migrations`
- **Ago 2026:** reimportados a la cuenta Sender definitiva con `scripts/import-wp-subscribers.mjs` → **88 de 92 en grupo `suscriptora-paga`**
- ⚠️ Faltan **4** (`jimena.1310@outlook.es`, `valentinave.98@gmail.com`, `sylvanalopez45@gmail.com`, `mariaclaudiaherrera2009@hotmail.com`) por **429 rate limit del plan**. Reintentado 2026-08-03 (falló de nuevo, 429 a nivel cuenta) → retry **2026-08-04T17:02:44Z**. Comando: `node --env-file=.env scripts/import-wp-subscribers.mjs ./suscriptoresViejos.csv` (idempotente, solo agrega faltantes)
- CSV no está en el repo (`.gitignore`)

**UI NewsletterForm:**
- Mensaje de éxito/error aparece al lado del input, centrado verticalmente, color `triba-red`

## Próximo

- Reintentar los 4 suscriptores faltantes de Sender tras `2026-08-04T17:02:44Z` (429 rate limit, ver Migración WooCommerce)
- Limpiar email de prueba `comunidadtriba+liveverify1785776465@gmail.com` de Sender (no se pudo borrar por el mismo rate limit)
- Cuando se tenga volumen alto, evaluar plan pago de Sender para workflows/automations en vez de envíos manuales

## Deuda de tipos — `astro check` (271 errores, Ago 2026)

`astro check` reporta **271 errores de TS, todos en scripts client-side** de páginas/componentes `.astro`. No rompen build ni runtime; son cosméticos. Se arreglan cuando se toque cada archivo.

**Tipos dominantes:** 18047 (`'X' is possibly 'null'` en queries DOM, 97) · 2339 (propiedad inexistente en `Element`/`HTMLElement`/`never[]` de Supabase, 96) · 7006 (`any` implícito, 20) · 2345 (argumento mal tipado, 18) · 6133 (var sin usar, 10) · resto menor.

**Archivos afectados (por cantidad):**
- `src/pages/iniciar-sesion.astro` (61) · `src/components/Navbar.astro` (47) · `src/pages/mi-cuenta.astro` (25) · `src/pages/revista.astro` (14) · `src/pages/triba-creators.astro` (11) · `src/pages/index.astro` (10)
- `src/components/MagazineCarousel.astro` (9) · `src/components/MagazineSlider.astro` (7) · `src/pages/suscribirme.astro` (4) · `src/layouts/Layout.astro` (4)
- `src/pages/admin/ediciones/nuevo.astro` (2) · `src/pages/admin/suscriptoras.astro` (1) · `src/components/Input.astro` (1)

## Migración WooCommerce — Jul 2026

- **Tabla `subscriber_migrations`:** emails de suscriptores pagos viejos
- **Trigger `handle_new_user()`:** si el email está en `subscriber_migrations`, asigna `role=subscriber` + suscripción `migrated` (90 días de gracia)
- **`/admin/suscriptoras`:** formulario para migrar email individual (llama `/api/admin/subscribers/migrate`)
- **`scripts/import-wp-subscribers.mjs`:** importa CSV (columna `email`) → `subscriber_migrations` + grupo Sender `suscriptora-paga`
- **PDF access:** permite `status = 'migrated'` además de `'active'` en `[editionId].ts`
- **Admin subscribers filter:** incluye `'migrated'` en `src/lib/admin/subscribers.ts`

## Notificar nueva edición — Jul 2026

- **Endpoint** `POST /api/admin/editions/[id]/notify`: envía email a todas las suscriptoras con `role = subscriber`
- **Botón "Notificar suscriptoras"** en `/admin/ediciones/[id].astro` con confirmación y resultado
- **Email** usa `sendNewEditionEmail(to, edition)` en `src/lib/email.ts` (mismo template que bienvenida, con portada, descripción y link a la revista, enviado por Sender)
