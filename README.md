# TRIBA

Revista digital mensual escrita por y para mujeres, sobre cultura, arte e identidad. Modelo de newsletter gratuito + suscripción paga (acceso a la revista completa, archivo histórico y descarga PDF) con pagos vía Stripe y Mercado Pago.

**Stack:** Astro 5 (server output, `@astrojs/node` standalone) · Supabase (PostgreSQL + Auth + Storage) · Tailwind CSS 3 · Stripe · Mercado Pago · `react-pageflip` para el visor.

> Documentación detallada del proyecto: [`AGENTS.md`](./AGENTS.md) (arquitectura, componentes, convenciones, quirks).
> Trabajo pendiente y decisiones: [`mejoras.md`](./mejoras.md).

---

## Quickstart

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Completar las claves en `.env` — ver [Variables de entorno](#variables-de-entorno) abajo.

### 3. Aplicar las migraciones de Supabase

Las migraciones SQL viven en `supabase/migrations/` y deben correrse en orden sobre el proyecto de Supabase (dashboard → SQL editor, o CLI):

```bash
# Si usás Supabase CLI local:
supabase db push
```

Migraciones:
1. `001_init.sql` — tablas `profiles` y `subscriptions`, trigger `handle_new_user`.
2. `002_forms.sql` — tablas de formularios (newsletter, creators, feedback).
3. `003_editions.sql` — tablas de ediciones y páginas de la revista.
4. `004_cancel_subscription.sql` — RPC `cancel_subscription`.

### 4. Crear una edición destacada (seed mínimo)

Para que la home y la página de revista muestren contenido, crear al menos una fila en `editions` con `featured = true`, `cover_url` apuntando a una imagen, y opcionalmente `pdf_url` y `badge` (ej. "Última edición").

### 5. Levantar en desarrollo

```bash
npm run dev
```

App en `http://localhost:4321`.

---

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Dev server de Astro con HMR |
| `npm run build` | Build de producción (server output, `@astrojs/node` standalone) |
| `npm run preview` | Sirve el build localmente para verificar |
| `npm run astro` | CLI de Astro (ej. `npm run astro -- check` para typecheck) |

---

## Variables de entorno

Ver `.env.example` para la lista completa con los keys. Resumen por servicio:

### Supabase (requeridas)
- `PUBLIC_SUPABASE_URL` — URL del proyecto (cliente y server).
- `PUBLIC_SUPABASE_ANON_KEY` — clave pública (cliente y server).
- `SUPABASE_SERVICE_ROLE_KEY` — clave con privilegios (solo server: webhooks, admin, rate limit).

### Stripe (requeridas para pagos con tarjeta)
- `STRIPE_SECRET_KEY` — clave secreta del dashboard de Stripe.
- `STRIPE_WEBHOOK_SECRET` — signing secret del webhook (se obtiene al crear el endpoint en el dashboard).
- `STRIPE_PRICE_EUR` — price ID del plan EUR.
- `STRIPE_PRICE_USD` — price ID del plan USD.
- `STRIPE_PRICE_ARS` — price ID del plan ARS.

### Mercado Pago (requeridas para pagos en LatAm)
- `MP_ACCESS_TOKEN` — access token de la app (sandbox o producción).
- `MP_WEBHOOK_SECRET` — signing secret del webhook (se obtiene al configurar el webhook en el dashboard de MP).

> **Importante:** sin los `*_WEBHOOK_SECRET` configurados, los webhooks van a rechazar todas las requests (fail-closed intencional) y el flujo de pago no completa la activación de la suscripción.

---

## Webhooks

Ambos providers de pago requieren un webhook apuntando al server. Sin webhooks configurados, el pago se cobra pero la suscripción nunca queda `active` en la DB.

- **Stripe**: `POST {origin}/api/webhook/stripe` — eventos `checkout.session.completed`, `customer.subscription.*`. El proyecto verifica la firma con `STRIPE_WEBHOOK_SECRET`.
- **Mercado Pago**: `POST {origin}/api/webhook/mercadopago` — notificaciones de pago. El proyecto verifica la firma con `MP_WEBHOOK_SECRET` (HMAC-SHA256, manifest aislado en `webhook/mercadopago.ts`).

Configurar ambos desde los dashboards de Stripe y MP y copiar los signing secrets a `.env`.

---

## Deploy

El proyecto usa **`@astrojs/node` standalone** como adapter de Astro. El output es un server Node que arranca con `node dist/server/entry.mjs` después de `npm run build`.

Apto para cualquier plataforma que soporte procesos Node persistentes (VPS con PM2/systemd, Railway, Render, Fly.io, etc.).

> **Pendiente:** documentar el target específico de deploy de Triba (PM2 config, Dockerfile, CI/CD) cuando se defina.

---

## Estructura del proyecto

```
triba/
├── public/                 # Estáticos (portadas, fondos, logo, fuentes)
├── supabase/migrations/    # SQL: profiles, subscriptions, editions, formularios
├── src/
│   ├── components/         # Componentes Astro/React
│   ├── layouts/            # Layout.astro + global.css
│   ├── lib/                # Clients y config: supabase, stripe, mercadopago, editions
│   ├── pages/              # Rutas (.astro) + api/ (endpoints)
│   └── scripts/            # Scripts vanilla compartidos
├── astro.config.mjs
├── tailwind.config.mjs
├── tsconfig.json
├── .env.example
└── package.json
```

Detalle completo en [`AGENTS.md`](./AGENTS.md#estructura-del-proyecto).

---

## Glosario rápido

- **Tomo**: cada edición numerada de la revista.
- **Triba Creator**: colaboradora que escribe, diseña, ilustra o aporta contenido.
- **Newsletter gratuito**: 2 artículos + 1 muestra por mes por email. No incluye la revista completa.
- **Suscripción Triba**: acceso completo a la revista, archivo y PDF. Vía Stripe o Mercado Pago.
- **Edición destacada (`featured = true`)**: la edición del mes en curso, con badge "Última edición" en la portada.

Glosario completo en [`AGENTS.md`](./AGENTS.md#glosario).
