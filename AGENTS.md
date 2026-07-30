# TRIBA

Revista digital mensual — newsletter gratuito + suscripción paga. Escrita por y para mujeres, sobre cultura, arte e identidad.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Astro 5 (`@astrojs/vercel`) |
| Estilos | Tailwind CSS 3, mobile-first |
| BBDD / Auth / Storage | Supabase |
| Pagos | Stripe + Mercado Pago (webhooks) |
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

## Newsletter — estado actual Jul 2026

**Backend (funciona):**
- `POST /api/newsletter` inserta en Supabase `newsletters` → responde `{ok:true}` o `{existing:true}`
- Envía email de bienvenida por Resend (`sendWelcomeEmail` en `src/lib/email.ts`) — template básico, hay que mejorarlo visualmente
- Sincroniza a Kit con tag `newsletter-gratuito` (`syncFreeSubscriber`) y `suscriptora-paga` (`syncPaidSubscriber` en webhooks) — corrigió response format a Kit API v4

**Resend:**
- Dominio `comunidadtriba.com` verificado (DKIM ✅, SPF ✅, MX ✅)
- Envío habilitado — el welcome email llega pero va a Promociones (normal con dominio nuevo, mejora con engagement)
- `RESEND_FROM`: `Triba <hola@comunidadtriba.com>`

**Kit:**
- Cuenta original de Kit restaurada — `src/lib/kit.ts`, webhooks, newsletter e import script activos
- API v4: response format corregido (`{ subscriber }`, `{ tag }`, `{ tags }`)
- Plan free: no incluye Rules/Visual Automations → no puede enviar emails automáticos al aplicar tag
- Newsletter mensual se envía como Broadcast manual desde Kit a la tag correspondiente

**Migración WooCommerce:**
- 92 suscriptores pagos viejos importados desde `suscriptoresViejos.csv` a `subscriber_migrations` + Kit tag "suscriptora-paga"
- CSV no está en el repo (`.gitignore`)

**UI NewsletterForm:**
- Mensaje de éxito/error aparece al lado del input, centrado verticalmente, color `triba-red`

## Próximo — template welcome email

- Mejorar el HTML template de `sendWelcomeEmail` en `src/lib/email.ts` para que tenga el branding visual de Triba (logo, colores, tipografía)
- Cuando Kit se upgrade a Creator, se puede reemplazar Resend por automations de Kit

## Migración WooCommerce — Jul 2026

- **Tabla `subscriber_migrations`:** emails de suscriptores pagos viejos
- **Trigger `handle_new_user()`:** si el email está en `subscriber_migrations`, asigna `role=subscriber` + suscripción `migrated` (90 días de gracia)
- **`/admin/suscriptoras`:** formulario para migrar email individual (llama `/api/admin/subscribers/migrate`)
- **`scripts/import-wp-subscribers.mjs`:** importa CSV (columna `email`) → `subscriber_migrations`
- **PDF access:** permite `status = 'migrated'` además de `'active'` en `[editionId].ts`
- **Admin subscribers filter:** incluye `'migrated'` en `src/lib/admin/subscribers.ts`

## Notificar nueva edición — Jul 2026

- **Endpoint** `POST /api/admin/editions/[id]/notify`: envía email a todas las suscriptoras con `role = subscriber`
- **Botón "Notificar suscriptoras"** en `/admin/ediciones/[id].astro` con confirmación y resultado
- **Email** usa `sendNewEditionEmail(to, edition)` en `src/lib/email.ts` (mismo template que bienvenida, con portada, descripción y link a la revista)
