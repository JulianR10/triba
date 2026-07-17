# TRIBA

Revista digital mensual escrita por y para mujeres, sobre cultura, arte e identidad. Newsletter gratuito + suscripción paga (acceso a la revista completa, archivo histórico y descarga PDF) con pagos vía Stripe y Mercado Pago.

**Stack:** Astro 5 · Supabase (PostgreSQL + Auth + Storage) · Tailwind CSS 3 · Stripe · Mercado Pago · react-pageflip

> Documentación detallada del proyecto: [`AGENTS.md`](./AGENTS.md)

---

## Quickstart

```bash
npm install
cp .env.example .env    # completar claves
npm run dev              # http://localhost:4321
```

Migraciones SQL en `supabase/migrations/` (correr en orden sobre Supabase). Seed mínimo: crear una fila en `editions` con `featured = true` y `cover_url`.

---

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Dev server con HMR |
| `npm run build` | Build producción |
| `npm run preview` | Sirve build local |

---

## Variables de entorno

Ver `.env.example`. Requeridas:
- `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`
- `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`

Sin los `*_WEBHOOK_SECRET` los webhooks rechazan requests (fail-closed).

---

## Deploy

Adapter `@astrojs/vercel`. Cada push a `main` dispara deploy automático en Vercel.
