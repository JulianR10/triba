# TRIBA

Revista digital mensual por y para mujeres. Sitio Astro SSR con suscripciones digitales y Mail Club postal.

Astro 5 SSR en Vercel · Supabase (auth, base, Storage) · Stripe y Mercado Pago · Sender (correo) · visor PDF en React.

## Desarrollo local

```bash
npm ci
cp .env.example .env   # completar localmente; no compartir secretos
npm run dev
```

## Validación

```bash
npm run check
npm test
npm run build
```

## Planes y precios

Los precios por plan, zona y proveedor viven en el código: `src/lib/pricing.ts` (digital) y `src/lib/mail-club.ts` (Mail Club y zonas). No se copian acá para que no se desactualicen.

## Producción

Push a `main` despliega en Vercel. Antes de deployar, aplicar las migraciones SQL pendientes de `supabase/migrations/` (en orden). Después del deploy:

1. `node scripts/smoke-prod.mjs`.
2. `GET /api/cron/reconcile` sin autorización debe responder 401 (no 500). Requiere `CRON_SECRET` en Vercel Production.

Webhooks: `/api/webhook/stripe` y `/api/webhook/mercadopago`. Mantener las firmas y secretos fuera del repo.

## Operación Mail Club

Zona horaria `Europe/Madrid`. El cron (`/api/cron/reconcile`, 07:00 UTC) reconcilia pagos y envía recordatorios idempotentes.

| Día | Qué pasa |
|---|---|
| 14 | El cron recuerda a las admins crear o revisar el lote; no lo crea. |
| 15 | Corte: elegibilidad y dirección quedan congeladas en el snapshot. |
| 19 | El cron recuerda registrar el despacho; no lo realiza. |
| 20 | Administración registra la salida física; recién entonces se envían los avisos. |

- Los cambios de dirección posteriores al corte aplican al mes siguiente.
- Los snapshots de envío se purgan a los 60 días (primero en dry-run). La dirección actual se conserva mientras haya Mail Club vigente o un `past_due` recuperable.
- Fundadora: número consecutivo, único e inmutable, sin tope.

## Scripts operativos

Los que escriben van en dry-run por defecto; revisar antes de añadir `--real`.

| Comando | Para qué |
|---|---|
| `node scripts/smoke-prod.mjs` | Verificación después de cada deploy. |
| `node --env-file=.env scripts/purge-mail-club-retention.mjs` | Purga de retención Mail Club. |
| `node --env-file=.env scripts/cleanup-orphan-storage.mjs` | Archivos huérfanos de Storage (`editions` y `editions-pdfs`). |
| `node --env-file=.env scripts/cleanup-mp-pending.mjs` | Cancela preaprobaciones MP pendientes. |
| `node --env-file=.env scripts/update-mp-mailclub-price.mjs --amount <ARS>` | Cambia el precio MP de Mail Club; `--real` solo tras aviso de 30 días. |
| `node --env-file=.env scripts/resync-stripe-periods.mjs` | Resincroniza los períodos de Stripe con la base. |
| `node --env-file=.env scripts/dedupe-subscriptions.mjs` | Deja una suscripción viva por persona (ver ROADMAP). |
| `node --env-file=.env scripts/export-newsletters.mjs` | Exporta el newsletter histórico. |
| `node --env-file=.env scripts/send-mailclub-preview.mjs --email=<destino> --dry` | Preview; sin `--dry` envía correo real. |

## Documentación

- [`AGENTS.md`](./AGENTS.md): convenciones, invariantes y dónde vive cada flujo.
- [`ROADMAP.md`](./ROADMAP.md): trabajo en curso, próximas mejoras y cambios grandes.
