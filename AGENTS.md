# TRIBA — Contexto de proyecto

Revista digital mensual escrita por y para mujeres, sobre cultura, arte, identidad. Newsletter gratuito + suscripción paga (acceso a revista completa, archivo, descarga PDF).

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | **Astro 5** (server output, `@astrojs/vercel`) |
| Estilos | **Tailwind CSS 3** — mobile-first, colores/fuentes branding |
| BBDD / Auth / Storage | **Supabase** |
| Pagos | **Stripe** + **Mercado Pago** (webhooks) |
| Visor revista | **react-pageflip** (React island) |

---

## Sistema visual

**Colores:** `triba-red` `#E91A39` · `triba-pink` `#FFCCE4` · `triba-cream` `#FFF8EE` · `triba-light-cream` `#FDEDD5` · `triba-green` `#BCE85E` · `triba-blue` `#3BACFF` · `triba-darkblue` `#1800AD` · `triba-white` `#FFFFFF` · `triba-black` `#000000` · `triba-brown` `#35220A` · `triba-bone` `#f2f1eb`

**Tipografía:** Títulos → Bootzy TM / Helvetica · Cuerpo → Montserrat · Cursiva → Times New Roman itálica

**Fondos:** `fondo-cielo.webp`, `fondo-1.png`, `fondo-3.png`

---

## Navegación

| Rol | Items |
|---|---|
| Público | INICIO · REVISTA · SUSCRIBIRME · TRIBA CREATORS · INICIAR SESION |
| Suscriptora | Logo · MI CUENTA · REVISTA |

---

## Páginas

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/` | `index.astro` | Hero, galería parallax, cards, newsletter, CTA creators |
| `/suscribirme` | `suscribirme.astro` | Pricing EUR/USD/ARS, botones Stripe/MP, FAQ |
| `/iniciar-sesion` | `iniciar-sesion.astro` | Login + signup + recuperación contraseña. Toggle login/crear cuenta. `emailRedirectTo` preserva `redirect`. |
| `/revista` | `revista.astro` | Edición destacada, carrusel, visor page-flip |
| `/mi-cuenta` | `mi-cuenta.astro` | Dashboard suscriptora, edición actual, carrusel, archivo, visor, feedback |
| `/triba-creators` | `triba-creators.astro` | Info + formulario para creators |
| `/revista/[slug]` | `[slug].astro` | Vista de edición con page-flip |
| `/privacidad` | `privacidad.astro` | Política de privacidad |
| `/terminos` | `terminos.astro` | Términos y condiciones |
| `/admin` | `admin/index.astro` | Dashboard admin (contadores + acciones rápidas) |
| `/admin/ediciones` | `admin/ediciones/index.astro` | Listado ediciones |
| `/admin/ediciones/nuevo` | `admin/ediciones/nuevo.astro` | Crear edición (cover + PDF, featured) |
| `/admin/ediciones/[id]` | `admin/ediciones/[id].astro` | Editar edición + preview páginas |
| `/admin/suscriptoras` | `admin/suscriptoras.astro` | Listado suscriptoras con cancel manual |
| `/admin/feedback` | `admin/feedback.astro` | Feedback recibido |
| `/admin/creators` | `admin/creators.astro` | Postulaciones creators (aprobar/rechazar) |

---

## Componentes

| Componente | Props clave |
|---|---|
| `Button.astro` | `variant` (primary/default/ghost), `size` (sm/md), `href`, `fullWidth`, `type` |
| `CheckoutButton.astro` | `provider` (stripe/mercadopago), `currency` (EUR/USD/ARS) |
| `MagazineCard.astro` | `number`, `title`, `description`, `image`, `coverId` |
| `MagazineCarousel.astro` | `editions`, `selectedId` |
| `MagazineSlider.astro` | `items` (cover, badge?, title?, description?), `selectedId?`. Mobile-only (`md:hidden`), snap horizontal con dots. |
| `Navbar.astro` | `session` (SSR, variante logueada/anónima) |
| `NewsletterForm.astro` | — |
| `Input.astro` | `label`, `name`, `type`, `required`, `placeholder`, `isTextarea` |
| `PatchTitle.astro` | `content`, `tag`, `lines`, `centered`, `class` |
| `PageFlipViewer.tsx` | `pages`, `width`, `height` |
| `admin/AdminLayout.astro` | `title`, `active` ("dashboard" / "ediciones" / "suscriptoras" / "feedback" / "creators") |
| `admin/EditionForm.astro` | `mode` ("create" / "edit"), `edition?` |
| `Footer.astro` | — |

---

## API (server routes)

| Ruta | Método | Propósito |
|---|---|---|
| `/api/create-checkout` | POST | Crea sesión Stripe o MP, devuelve URL |
| `/api/portal` | POST | Redirige a Stripe Customer Portal o devuelve `note` para MP |
| `/api/cancel-subscription` | POST | Cancela suscripción en proveedor + DB |
| `/api/newsletter` | POST | Suscripción newsletter. Rate limit 5/min por IP. |
| `/api/subscription-status` | GET | Polling estado suscripción |
| `/api/feedback` | POST | Feedback de edición. Auth + rate limit 60s. |
| `/api/webhook/stripe` | POST | Eventos suscripción Stripe (verificación firma) |
| `/api/webhook/mercadopago` | POST | Notificaciones MP. HMAC-SHA256. Default `VERIFY_SIGNATURES=true`. |
| `/api/admin/editions` | POST | Crea edición (`multipart/form-data`). Promueve/demueve featured atómicamente. |
| `/api/admin/editions/[id]` | PATCH / DELETE | Actualiza o elimina edición |
| `/api/admin/creators` | GET | Lista postulaciones (`?status=pending\|approved\|rejected\|all`) |
| `/api/admin/creators` | PATCH | Aprueba/rechaza (`{ id, status }`) |
| `/api/admin/subscribers/[id]/cancel` | POST | Cancela suscripción de cualquier user (admin-only) |

---

## Convenciones

- **Naming:** archivos `kebab-case`, componentes `PascalCase`, vars `camelCase`, tipos `PascalCase`.
- **Astro:** páginas con frontmatter → Layout + SEO. Scripts al final con patrón `astro:page-load`.
- **Server routes:** `export const POST: APIRoute = async ({ request })`. Auth con `requireUser`/`requireAdmin`. Respuestas con helpers de `src/lib/response.ts`. Rate limiting con `src/lib/rate-limit.ts`. Logging con Pino.
- **Estilos:** Tailwind utility-first, mobile-first. Colores vía tokens (`bg-triba-red`, `font-heading`).
- **i18n:** UI en español rioplatense con voseo. Código/logs en inglés.
- **Migraciones:** `supabase/migrations/NNN_name.sql`, secuencial, idempotentes.
- **Git:** commits en presente, descriptivos.

---

## Known quirks

- **`hidden md:block` pisa `display: grid`:** Usar `hidden md:grid` en vez de `hidden md:block` cuando el elemento usa grid/flex.
- **Navbar glassmorphism:** `bg-triba-bone/80 backdrop-blur-sm` es casi invisible sobre fondo bone. Solo se ve sobre `fondo-cielo.webp`.
- **MP usa PreApproval:** Suscripción recurrente real. Webhook escucha `subscription_preapproval` y `subscription_authorized_payment`.
- **`--nav-height`:** Lo setea el Navbar con `ResizeObserver`. Secciones debajo usan `padding-top: max(1rem, var(--nav-height, 64px))`.
- **View Transitions:** Scripts se re-ejecutan en cada navegación. Usar patrón `setup(); document.addEventListener("astro:page-load", setup)`.
- **`client:visible` en PageFlipViewer:** Pesa ~48kB. No cambiar a `client:load` o impacta LCP.
- **Rate limiting serverless:** Usa tabla `rate_limits` en Supabase (no Map en memoria).
- **CSP strings cacheadas:** `connect-src`, `img-src` y base CSP se precomputan al importar `middleware.ts`, no en cada request.
- **Preload Bootzy TM:** `<link rel="preload" as="font" crossorigin>` para `/fonts/bootzyTM/BootzyTM.woff2` en `Layout.astro`.
- **Portal MP:** `/api/portal` devuelve `{ note }` para MP (no tiene portal hosted). Navbar y `mi-cuenta` muestran `alert(note)`.
- **Botón gestionar suscripción:** Presente en `Navbar.astro` y en la card de estado de `mi-cuenta.astro`. Ambos usan `POST /api/portal`.
- **Profile.updated_at:** El tipo `Profile` en `types.ts` incluye `updated_at: string` (sync con `database.types.ts`).

---

## Glosario

| Término | Significado |
|---|---|
| **Tomo** | Cada edición numerada de la revista |
| **Triba Creator** | Colaboradora que aporta contenido |
| **Newsletter gratuito** | 2 artículos + 1 muestra por mes (sin revista completa) |
| **Suscripción Triba** | Acceso completo + archivo + PDF. Stripe o MP. |
| **Edición destacada** | La del mes (`featured = true`). Solo una a la vez. |
| **PatchTitle** | Título tipo recortes de revista (palabras rotadas con colores) |
| **MagazineSlider** | Componente mobile-only con snap-scroll y dots |
| **handle_new_user** | Trigger que crea profile al insertar en `auth.users` |
| **cancel_subscription** | RPC que cancela suscripción activa en DB local |

---

## Admin

Ruta `/admin/*` protegida por `role === 'admin'` (`src/middleware.ts`). Middleware lee sesión, carga profile, redirige si no es admin. API routes devuelven 401/403 JSON.

**Promover admin:** `update public.profiles set role = 'admin' where email = 'tu@email.com';`

**Script fix-admin.mjs:** `node --env-file=.env scripts/fix-admin.mjs <email> '<password>'`. Resetea password, fuerza email_confirm, promueve a admin. Requiere `PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

**Runbook: nueva edición**
1. Login admin → `/admin/ediciones/nuevo`
2. Número, título, descripción, portada (≤5MB), PDF opcional (≤80MB), badge, destacada
3. Crear → se sube a Storage bucket `editions`, se promueve/demueve featured

**Runbook: cancelar suscripción manual**
`/admin/suscriptoras` → Cancelar. Llama RPC `cancel_subscription(user_id)`. Solo DB local (no toca proveedor).

**Runbook: aprobar creator**
`/admin/creators?status=pending` → Aprobar/Rechazar. Cambia `creator_applications.status`.

**Storage bucket:** `editions` en Supabase Storage (público). Helper `src/lib/storage.ts:uploadEditionFile`.

---

## Flujo de auth

- Admin y suscriptora comparten Supabase Auth y página `/iniciar-sesion`.
- Decisión post-login: `?redirect=` explícito → respeta. Sino: query a `profiles.role`. Admin → `/admin`, otro → `/mi-cuenta`.
- Middleware carga `profiles` solo para path `/admin*` (lazy). Para el resto, `Astro.locals.profile` es `null`.
- Navbar no tiene link a `/admin`. Entry point: banner verde en `/mi-cuenta` si `role === 'admin'`.
- Cualquier user puede escribir `/admin` en URL. Si no es admin → redirect a `/` (no filtra información).

---

## Diagrama de arquitectura

```mermaid
flowchart LR
  U[Usuaria] -->|HTTP| AS[Astro Server<br/>@astrojs/vercel]
  AS -->|View Transitions| AC[Astro Client]
  AS -->|SSR pages| SU[Supabase Auth]
  AS -->|API routes| SU
  AS -->|API routes| ST[Stripe SDK]
  AS -->|API routes| MP[Mercado Pago SDK]
  ST -->|webhook| WH["/api/webhook/stripe"]
  MP -->|webhook| WH2["/api/webhook/mercadopago"]
  WH -->|upsert| SB[(Supabase<br/>PostgreSQL)]
  WH2 -->|upsert| SB
  AS -->|storage| S3[(Supabase<br/>Storage)]
  AC -->|supabase-js| SU
  SB -->|profiles, subscriptions,<br/>editions, feedback| AS
  S3 -->|covers, PDFs, pages| AS
```

## Estructura del proyecto

```
triba/
├── public/                     # Estáticos
├── supabase/migrations/        # SQL
├── src/
│   ├── components/             # Astro + PageFlipViewer.tsx (React)
│   ├── layouts/                # Layout.astro + global.css
│   ├── lib/                    # Clients y config (supabase, stripe, mp, etc.)
│   │   └── admin/              # Admin helpers
│   ├── middleware.ts
│   ├── pages/                  # Rutas (.astro) + api/
│   └── scripts/                # Vanilla JS
├── astro.config.mjs
├── tailwind.config.mjs
└── package.json
```
