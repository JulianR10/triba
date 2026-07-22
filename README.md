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

## Deploy

Adapter `@astrojs/vercel`. Push a `main` → deploy automático en Vercel.
