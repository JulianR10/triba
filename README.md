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

Ver `.env.example`. Requeridas: Supabase (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`), MP (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`), Sender (`SENDER_API_KEY`, `SENDER_FROM_EMAIL`, `SENDER_FROM_NAME`). Sin `*_WEBHOOK_SECRET` los webhooks fallan.

## Scripts

| Comando | Uso |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Build producción |
| `npm run preview` | Sirve build local |

## Scripts operativos

| Script | Uso |
|---|---|
| `node --env-file=.env scripts/cleanup-orphan-storage.mjs [--real]` | Barrido de archivos huérfanos en Storage (dry-run default) |
| `node --env-file=.env scripts/resync-newsletters.mjs [--all\|--email=x]` | Re-sincroniza newsletters con `sender_synced=false` a Sender |
| `node --env-file=.env scripts/reconcile-mp-subscribers.mjs [--real]` | Activa retroactivamente pagadores MP sin acceso |
| `node --env-file=.env scripts/recreate-migrated-billing.mjs [--dry-run]` | Recrea el cobro automático de las migradas (idempotente) |
| `node --env-file=.env scripts/import-wp-subscribers.mjs <csv>` | Importa suscriptores de WooCommerce a `subscriber_migrations` + Sender |
| `node --env-file=.env scripts/fix-admin.mjs <email> '<password>'` | Promueve admin / fix de acceso |
| `node --env-file=.env scripts/update-mp-mailclub-price.mjs --amount <ARS> [--real] [--list-emails]` | Actualización trimestral ARS de preaprobaciones MP (dry-run default, aviso 30 días) |
| `node --env-file=.env scripts/purge-mail-club-retention.mjs [--real] [--days 60]` | Retención postal: purga snapshots y direcciones vencidas (dry-run default) |
| `node scripts/smoke-prod.mjs` | Smoke test de producción (home, Suscribirme, Mail Club, legales y consola) |

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
