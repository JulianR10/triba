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
- Envía email de bienvenida por Resend (`sendWelcomeEmail` en `src/lib/email.ts`)

**Email de bienvenida no llega por:**
1. Dominio `comunidadtriba.com` en Resend: DNS verificado, **"Enable Sending" pendiente** — esperar hasta 48h
2. `RESEND_API_KEY` en Vercel: cambiada a key de Onboarding (`re_it5y...`) — válida
3. `RESEND_FROM`: `Triba <noreply@comunidadtriba.com>`

**Próximos pasos cuando "Enable Sending" esté ✅:**
1. Probar envío desde terminal con curl + key de Onboarding
2. Redeploy en Vercel
3. Probar suscripción + email de bienvenida
4. Si funciona, borrar `src/pages/api/diagnose-email.ts`
5. Verificar email de bienvenida en suscripción paga (Stripe/MP webhooks)

**Newsletter mensual (gratuito):**
- Dueñas lo crearán en herramienta externa (Kit, MailerLite o Brevo — a decidir)
- Triba solo sincroniza suscriptores via API (similar a `syncFreeSubscriber`)
- La revista para suscriptoras pagas la hacen en Canva (no involucra a Triba)

**Pendiente arquitectura:**
- Decidir herramienta de email marketing para reemplazar Kit (trial expirado)
- Conectar nueva herramienta con flujo de suscripción de Triba

**Kit eliminado:** Jul 2026. Se borró `src/lib/kit.ts` y todas sus referencias en webhooks, newsletter e import script. La herramienta de reemplazo la definen las dueñas.
