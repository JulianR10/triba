# TRIBA

Revista digital mensual — newsletter gratuito + suscripción paga. Escrita por y para mujeres, sobre cultura, arte e identidad.

**Stack:** Astro 5 · Supabase · Tailwind CSS 3 · Stripe · Mercado Pago · react-pdf

> Contexto completo del proyecto: [`AGENTS.md`](./AGENTS.md)

## Quickstart

```bash
npm install
cp .env.example .env   # completar claves
npm run dev             # http://localhost:4321
```

Migraciones SQL en `supabase/migrations/` (ejecutar en orden).

## Scripts

| `npm run dev` | Dev server |
| `npm run build` | Build producción |
| `npm run preview` | Sirve build local |

## Variables de entorno

Ver `.env.example`. Requeridas: Supabase (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`), MP (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`). Sin `*_WEBHOOK_SECRET` los webhooks fallan.

## Estado operativo (Ago 2026)

- **Webhook Stripe:** el endpoint apunta a `https://www.universotriba.com/api/webhook/stripe` (Stripe no sigue redirects). Fue recreado (`we_1U1plgLIVKTt84JHLV8gZN41`) apuntando al host `www` (el apex `universotriba.com` redirige a `www` y Stripe no sigue redirects) con secret sincronizado en Vercel env + `.env` — el anterior estaba desincronizado y los pagos nunca activaban la suscripción. El handler usa `periodRange()` (esta cuenta no expone `current_period_start`/`end`) y `supersedeMigratedSub()`.
- **Cobro automático de las migradas recreado:** al morir el sitio WooCommerce viejo se cortaron los cobros recurrentes. Se recrearon **26 subscriptions** en Stripe (precio viejo €10,5/mes, `price_1U0obKLIVKTt84JHfVQV5CRI`) para las migradas con tarjeta + historial, con `billing_cycle_anchor` alineado al último cobro. Estado: 21 activas, 6 `incomplete` (tarjetas caídas). Script idempotente: `node --env-file=.env scripts/recreate-migrated-billing.mjs`.
- **Cortesía migradas:** 7 días (`handle_new_user` → sub `migrated`). Las que tienen `stripe_subscription_id` linkean su sub real de Stripe al registrarse (migration `010_subscriber_stripe_link.sql`).
- **Precios actuales:** €7 / $7 / $7.000 ARS. El €10,5 es solo para las migradas recreadas.

## Pendientes

- **Enviar aviso a las 26 suscriptoras migradas** (email de Sender): informarles que su suscripción sigue activa en la web nueva con el mismo precio €10,5/mes y misma tarjeta, y que deben crear una cuenta con su mismo email para acceder a la revista. Especialmente relevante para las 8 que ya recibieron el cobro (4-Ago-2026).

## Scripts operativos

| Script | Uso |
|---|---|
| `node --env-file=.env scripts/recreate-migrated-billing.mjs [--dry-run]` | Recrea el cobro automático de las migradas (idempotente, escribe `subscriber_migrations.stripe_subscription_id`) |
| `node --env-file=.env scripts/import-wp-subscribers.mjs <csv>` | Importa suscriptores de WooCommerce (CSV) a `subscriber_migrations` + Sender |
| `node --env-file=.env scripts/fix-admin.mjs <email> '<password>'` | Promueve admin / fix de acceso |

## Accesos de prueba

**Suscriptora de prueba** (sub `stripe` activa, USD):

| Rol | Email | Password |
|---|---|---|
| Suscriptor | `suscriptora@triba.com` | `TestTriba2026!` |

> Se crea/resetea con `node --env-file=.env scripts/create-test-subscriber.mjs <email> '<password>'`.

**Admin** (entran por `/iniciar-sesion` y son redirigidos a `/admin`):

| Rol | Email |
|---|---|
| Admin | `julianrecarte@gmail.com` |
| Admin | `comunidadtriba@gmail.com` |

> Las contraseñas se guardan hasheadas en Supabase y **no son recuperables**. Para resetear una: `node --env-file=.env scripts/fix-admin.mjs <email> '<nueva-password>'`.

## Deploy

Adapter `@astrojs/vercel`. Push a `main` → deploy automático en Vercel.
