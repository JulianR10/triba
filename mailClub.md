# Operación — pagos y Triba Mail Club

Fuente única para reglas y pendientes operativos. No guardar claves, contraseñas, datos de suscriptoras ni tokens. Convenciones de código: [`AGENTS.md`](./AGENTS.md).

## Estado y bloqueos

- Mail Club está publicado; producción y Previews usan el proyecto Supabase `Triba`.
- **Migraciones `027–031` pendientes** (se aplican en otro momento, vía SQL Editor del dashboard, en orden). Mientras tanto:
  - Sin `027`: los recordatorios del 14/19 no se envían y el cron responde 502 en ese tramo (la reconciliación de pagos igual se ejecuta antes).
  - Sin `028`: todo funciona hasta la fundadora 100; la 101 fallaría sin esta migración.
  - Sin `029`: el dashboard usa automáticamente el cálculo anterior de 12 conteos.
  - Sin `030`: sigue el P0 datos (UPDATE propio en `role`/`subscription_id`/`subscriptions`, `cancel_subscription` sin guard de dueño, policies `using(true)` en `admin_audit_log`/`rate_limits`, grants amplios y sin vista `public_edition_catalog`). El código ya no pide `pdf_url` al cliente (usa `hasPdf` + `/api/pdf/{versionId}` con fallback pre-030), pero el REST directo a `edition_languages` aún expone `pdf_url` y el bucket `editions` sigue público hasta `031`.
  - Sin `031`: `edition_languages` sigue legible por anon (el `pdf_url` se obtiene por REST directo) y los PDFs siguen en el bucket público. El código ya soporta el bucket privado `editions-pdfs` (refs `storage://`, firma por bucket en `/api/pdf`). Orden de cierre: deploy del código → aplicar `031` → `node --env-file=.env scripts/migrate-pdfs-to-private.mjs --real` → verificar lector → mismo script con `--real --delete-old`.
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

1. Aplicar migraciones `027` a `031` en Supabase cuando se decida, en orden (`029` es solo lectura: el dashboard usa el cálculo anterior hasta que exista la vista; `031` exige el código con vista+fallback ya deployado).
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
