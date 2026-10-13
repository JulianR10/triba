# TRIBA

Revista digital mensual — suscripción digital + Triba Mail Club (sobre postal). Escrita por y para mujeres, sobre cultura, arte e identidad.

**Stack:** Astro 5 · Supabase · Tailwind CSS 3 · Stripe · Mercado Pago · Sender · react-pdf

> Contexto para desarrollo/IA: [`AGENTS.md`](./AGENTS.md) · Análisis funcional completo: [`docs/flujo-funcional.md`](./docs/flujo-funcional.md)

## Quickstart

```bash
npm install
cp .env.example .env   # completar claves
npm run dev             # http://localhost:4321
```

Migraciones SQL en `supabase/migrations/` (ejecutar en orden).

## Variables de entorno

Ver `.env.example`. Requeridas: Supabase (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`), MP (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`), Sender (`SENDER_API_KEY`, `SENDER_FROM_EMAIL`, `SENDER_FROM_NAME`), cron (`CRON_SECRET`, cualquier string aleatorio). Sin `*_WEBHOOK_SECRET` los webhooks fallan; sin `CRON_SECRET` la reconciliación automática responde 500.

## Scripts

| Comando | Uso |
|---|---|
| `npm run dev` | Dev server |
| `npm run check` | Type-check de Astro |
| `npm test` | Tests unitarios |
| `npm run build` | Build producción |
| `npm run preview` | Sirve build local |

El inventario completo, con scripts operativos, migraciones históricas y utilidades retiradas, está en [`scripts/README.md`](./scripts/README.md). No ejecutar scripts marcados como históricos/deprecados sin revisar primero su alcance y el estado actual de producción.

## Scripts operativos frecuentes

| Script | Uso |
|---|---|
| `node --env-file=.env scripts/prelaunch-check.mjs` | Chequeo local de configuración (solo lectura) |
| `node scripts/smoke-prod.mjs` | Smoke test público después de un deploy |
| `node --env-file=.env scripts/cleanup-orphan-storage.mjs [--real]` | Barrido de archivos huérfanos en Storage (dry-run default) |
| `node --env-file=.env scripts/cleanup-mp-pending.mjs [--real]` | Cancela intentos MP abandonados (dry-run default) |
| `node --env-file=.env scripts/purge-mail-club-retention.mjs [--real] [--days 60]` | Retención postal (dry-run default) |
| `node --env-file=.env scripts/resync-newsletters.mjs [--all\|--email=x]` | Re-sincroniza pendientes históricos de newsletter con Sender |
| `node --env-file=.env scripts/update-mp-mailclub-price.mjs --amount <ARS> [--real] [--list-emails]` | Actualización trimestral ARS de preaprobaciones MP (dry-run default, aviso 30 días) |
| `node --env-file=.env scripts/send-mailclub-preview.mjs --email=<destino> --dry` | Preview local del email real (sin envío) |

`create-test-subscriber.mjs`, `fix-admin.mjs`, `resend-welcome.mjs` y el envío real del preview son acciones manuales sensibles; ver las guardas en [`scripts/README.md`](./scripts/README.md).

## Accesos de prueba

Suscriptoras de prueba (sub `stripe` activa hasta oct-2027, creadas en el Supabase de producción):

| Plan | Email | Password | Detalle |
|---|---|---|---|
| Digital | `suscriptora-digital@triba.test` | `TribuTest2024!` | EUR €7/mes — tarjeta en Mi Cuenta |
| Mail Club | `suscriptora-mailclub@triba.test` | `TribuTest2024!` | EUR €10,50/mes — formulario de dirección en Mi Cuenta |

> Se crean/resetean con `node --env-file=.env scripts/create-test-subscriber.mjs <email> '<password>' [digital|mail_club] [EUR|USD|ARS]` (re-ejecutar no duplica: reutiliza la suscripción existente). El script también resetea la contraseña si la cuenta ya existe.
>
> ⚠️ Son fixtures locales: su `provider_subscription_id` no existe en Stripe, por eso **“Gestionar suscripción” falla a propósito** en estas cuentas (el portal intenta recuperar una suscripción real). Para probar portal, cancelaciones o cobros, usar una suscripción creada por checkout real.

**Admin** (entran por `/iniciar-sesion` y son redirigidos a `/admin`):

| Rol | Email |
|---|---|
| Admin | `julianrecarte@gmail.com` |
| Admin | `comunidadtriba@gmail.com` |

> Las contraseñas se guardan hasheadas en Supabase y **no son recuperables**. Para resetear una: `node --env-file=.env scripts/fix-admin.mjs <email> '<nueva-password>'`.

## Deploy

Adapter `@astrojs/vercel`. Push a `main` → deploy automático en Vercel.
