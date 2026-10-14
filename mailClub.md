# Operación — pagos y Triba Mail Club

Fuente única para reglas y pendientes operativos. No guardar claves, contraseñas, datos de suscriptoras ni tokens. Convenciones de código: [`AGENTS.md`](./AGENTS.md).

## Estado y bloqueos

- Mail Club está publicado; producción y Previews usan el proyecto Supabase `Triba`.
- **Migraciones `027–031` aplicadas** en el dashboard (2026-10-14, en orden, `028` con baja/recreación del trigger `022`): recordatorios 14/19 activos, fundadoras sin tope, vista del dashboard, hardening RLS + catálogo sin `pdf_url`, base cerrada a anon. Backfill de PDFs al bucket privado completo y verificado (5/5, copias públicas borradas; URL directa → 400, lector vía `/api/pdf` → 302).
- Último estado documentado: faltaba `CRON_SECRET` en Vercel Production. Confirmarlo/configurarlo antes de depender del cron.
- Pendiente: pagos reales de validación EUR/USD/ARS, portal con suscripción real, exportación verificada del newsletter histórico, costeo postal y aprobación final de fotos/textos legales.

## Productos y pagos

| Plan | Destino | Precio mensual | Proveedor |
|---|---|---:|---|
| Digital | Europa | EUR 7 | Stripe |
| Digital | Resto | USD 7 | Stripe |
| Digital | Argentina | ARS 7.000 | Mercado Pago |
| Mail Club | Europa | EUR 10,50 | Stripe |
| Mail Club | Resto, excepto Argentina | USD 12,50 | Stripe |
| Mail Club | Argentina | ARS 16.000 | Mercado Pago |

- Para nuevas altas Mail Club, el país de destino determina zona, moneda y proveedor en el servidor.
- El upgrade digital es voluntario. Diferencia: EUR 3,50, USD 5,50 o ARS 9.000; cambiar la recurrencia solo tras confirmar el pago y sin duplicar el cargo.
- Cancelar o volver a digital conserva acceso hasta el fin del período pagado. `past_due` no equivale a baja definitiva.
- Webhooks: Stripe `https://www.universotriba.com/api/webhook/stripe`; Mercado Pago `https://www.universotriba.com/api/webhook/mercadopago`. Mantener las firmas y secretos fuera del repo.

## Operación postal

Zona horaria: `Europe/Madrid`. Corte: día 15 inclusive. Despacho físico: día 20.

| Día | Acción |
|---|---|
| 14 | El cron recuerda a admins crear/revisar el lote; no lo crea. |
| 15 | Cierra el corte; elegibilidad y dirección quedan congeladas en el snapshot. |
| 19 | El cron recuerda registrar el despacho; no lo realiza. |
| 20 | Administración registra la salida física; entonces se envían los avisos a suscriptoras. |

La elegibilidad del corte determina quién recibe el sobre. No se revalida el estado vivo de la suscripción al despachar, aunque venza o se cancele después. Reintentar lote o avisos no debe duplicar destinatarias ni emails.

- Los cambios de dirección posteriores al corte aplican al mes siguiente.
- Los snapshots de envío se purgan tras 60 días. La dirección actual se conserva mientras haya Mail Club activo y vigente o un `past_due` recuperable; ante error al consultar suscripciones, la purga la conserva. Ejecutar primero la purga en dry-run.
- Numeración de fundadora: consecutiva, única e inmutable, sin tope (100, 101, 102…). Alta y primer upgrade cuentan; pagos pendientes/rechazados no asignan número.

## Cron y deploy

`GET /api/cron/reconcile` corre a las 07:00 UTC: reconcilia pagos y envía recordatorios idempotentes el 14 y 19, calculados en `Europe/Madrid`. Requiere `CRON_SECRET` y la tabla de migración `027`.

Antes del deploy que activa el cron y la numeración sin tope:

1. Migraciones `027` a `031`: aplicadas 2026-10-14.
2. Configurar `CRON_SECRET` en Vercel Production y redeplegar.
3. Verificar que `GET /api/cron/reconcile` sin autorización responde 401, no 500.
4. Después del deploy, ejecutar `node scripts/smoke-prod.mjs`.

## Validación pendiente de producción

- Validar alta y renovación real en EUR, USD y ARS; conciliar o reembolsar cada operación según el protocolo aprobado.
- Probar portal/cancelación con una suscripción creada por checkout real; las cuentas fixture tienen IDs de proveedor ficticios.
- Exportar y verificar la lista histórica del newsletter con `node --env-file=.env scripts/export-newsletters.mjs` antes de borrar contactos gratuitos. `POST /api/newsletter` está retirado (410); conservar contactos del grupo pago y emails transaccionales.
- Medir el sobre y recibir tarifas de Correos antes de dar por validado el margen:

| Coste por envío | EUR | USD | ARS |
|---|---:|---:|---:|
| Franqueo | pendiente | pendiente | pendiente |
| Materiales y preparación | pendiente | pendiente | pendiente |
| Comisión de cobro | pendiente | pendiente | pendiente |
| Reposición y margen | pendiente | pendiente | pendiente |

- Recibir fotos definitivas y aprobar textos legales.

## Scripts operativos

| Comando | Precaución |
|---|---|
| `node scripts/smoke-prod.mjs` | Ejecutar después de cada deploy. |
| `node --env-file=.env scripts/purge-mail-club-retention.mjs` | Dry-run; revisar antes de añadir `--real`. |
| `node --env-file=.env scripts/cleanup-orphan-storage.mjs` | Dry-run; revisar antes de añadir `--real`. Cubre ambos buckets (`editions` y `editions-pdfs`). |
| `node --env-file=.env scripts/migrate-pdfs-to-private.mjs` | Dry-run; `--real` copia PDFs al bucket privado y reescribe `pdf_url`. `--real --delete-old` borra los PDFs del bucket público (solo tras verificar el lector). |
| `node --env-file=.env scripts/cleanup-mp-pending.mjs` | Dry-run; `--real` cancela preaprobaciones MP. |
| `node --env-file=.env scripts/update-mp-mailclub-price.mjs --amount <ARS>` | Dry-run; `--real` solo tras aviso de 30 días. |
| `node --env-file=.env scripts/send-mailclub-preview.mjs --email=<destino> --dry` | Preview local; sin `--dry` envía correo real. |
