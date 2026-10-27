# ROADMAP — TRIBA

Próximas mejoras, trabajo en curso y registro de cambios grandes. Convenciones y reglas de código: [`AGENTS.md`](./AGENTS.md). Cómo correr, deployar y operar: [`README.md`](./README.md). No guardar claves, contraseñas, datos de suscriptoras ni tokens.

## En curso: limpiar suscripciones duplicadas (27/10/2026)

Siete personas tenían más de una suscripción paga viva y se les cobró de más (todos los cobros verificados contra Stripe y Mercado Pago: capturados, sin reembolsos ni disputas). El checkout ya se bloqueó; falta cancelar las sobrantes.

| Persona | Cobro doble | Cobrado de más | Queda |
|---|---|---|---|
| pedrosubils21 | ago, sep, oct (ambas el día 10) | 21.000 ARS | MP vinculada al perfil (`132f5d36…`) |
| karenortegajimenez616 | sep, oct | 14 EUR (si sobra la de 7) | **A confirmar**: por fecha real, la de 10,50 EUR (creada en Stripe el 04/08) |
| segsierra | oct (7 cobros en el mes) | 6 cobros de 7 (5 USD + 1 EUR) | Stripe del 03/09 |
| abrilsollosqui, francescapescegrecco, agus2014ahumada, indirafidani | oct | 7.000 ARS cada una | la más antigua de cada una |

Próximos cobros dobles: 02/11 (abrilsollosqui), 03/11 (segsierra), 10/11 (pedrosubils21) y siguientes.

Pasos con `scripts/dedupe-subscriptions.mjs` (dry-run por defecto, `--real` y `--email=` para acotar, `--backup=` guarda el estado):
1. Corregir el script para ordenar por la fecha de creación **en el proveedor** (Stripe `created`, MP `date_created`); la `created_at` de la base no es confiable.
2. Dry-run, respaldo y OK de la dueña (incluida la decisión sobre Karen).
3. Stripe: `subscriptions.cancel(id, { invoice_now:false, prorate:false })`; los avisos a clientas están apagados en Stripe, no genera mail.
4. Mercado Pago: cancelar **una sola persona primero**; la documentación de MP dice que notifica por email al cancelar (no aclara a quién). Es irreversible.
5. Base: duplicadas a `canceled` y `profiles.subscription_id` apuntando a la que queda (si apuntara a una cancelada de MP, la persona perdería acceso al vencer).
6. Verificar: ninguna usuaria con más de una viva, rol `subscriber` y gate activo.

Fuera de alcance: reembolsos de lo ya cobrado de más (se decide aparte).

## Próximas mejoras

Resumen de la auditoría de octubre; ítems marcados *(verificar)* no se revisaron tras los fixes de hoy.

**P1 — riesgo concreto**
- Digital se activa con cualquier `status` de Stripe, incluido `incomplete`, y la bienvenida digital no es idempotente. Mail Club ya espera pago confirmado. *(`webhook/stripe.ts`)*
- Webhook de Mercado Pago: un evento sin match barre hasta 50 `incomplete` y pagina `listUsers` (hasta 12.000); la firma se apaga con `VERIFY_MP_SIGNATURES=false`.
- Carrera en el upgrade: dos eventos concurrentes pueden aplicar dos veces el cambio de tarifa. *(verificar)*
- Rendimiento: SSR sin caché en páginas públicas y la sesión se resuelve varias veces por request (middleware, Navbar, Mi Cuenta, `/api/pdf`); Mi Cuenta es un archivo de ~1.100 líneas dentro del layout público.
- Emails en logs sin regla de retención. *(verificar)*
- Tests que no cubren el dinero: agregar casos de upgrade/webhooks y de Mercado Pago.

**P2 — deuda**
- `planFromPreapproval` decide el plan por el texto "Mail Club" del `reason` de MP.
- El cron de reconcile solo mira `status = incomplete`: un pago de Stripe digital sin fila local no lo ve nadie.
- Puntero `profiles.subscription_id` sin invariante en la base (origen de ambigüedad con duplicadas).
- Tipos desfasados, N+1 en lotes y dashboard, purga que borra morosos, CSV y despacho sin auditoría, uploads autodeclarados.
- Accesibilidad: flips sin teclado, sin skip link, portal MP en `alert()`.
- DMARC en `p=none` (mantener hasta tener reportes), un solo proveedor de mail, OG en SVG, scripts de migración junto a los de producción, doble logger, sin alertas.

**P3 — cuando se toque el archivo**
Fundadora 101, `picsum` en la CSP, peso muerto del newsletter, `llms.txt`, etiqueta "Language" hardcodeada.

**Quick wins**: robots y sitemap al índice real, JSON-LD con `set:html`, archivar scripts muertos y borrar el FTP.
**Estructural**: sesión única en el middleware + HTML público cacheado, shell propio para Mi Cuenta, estado de suscripción en un solo módulo, cinco eventos de funnel + alertas.

## Pendientes de validación en producción

- Alta y renovación reales en EUR, USD y ARS; conciliar o reembolsar según el protocolo.
- Portal y cancelación con una suscripción creada por checkout real (las cuentas de prueba tienen IDs de proveedor ficticios).
- Probar el cambio Mail Club → Digital en la renovación real (el schedule de Stripe se verificó, la transición no).
- Exportar y verificar el newsletter histórico (`scripts/export-newsletters.mjs`) antes de borrar contactos gratuitos.
- Confirmar `CRON_SECRET` en Vercel Production y que `GET /api/cron/reconcile` sin autorización responde 401.
- Costeo postal (franqueo, materiales, comisión de cobro, margen) en EUR, USD y ARS.
- Fotos definitivas y textos legales aprobados.
- Mail de reset de contraseña: plantilla en español en Supabase y prueba con una casilla Outlook.

## Cambios grandes

**27/10/2026**
- **Período de Stripe real** (`f745d20`): `periodRange` usa `items[0]` en vez de `+30 días`; 54 suscripciones resincronizadas, 32 volvieron a tener acceso.
- **Downgrade Mail Club → Digital idempotente** (`078c18b`): la guardia ahora ve `scheduled_plan_type`; se reutiliza el schedule de Stripe y se libera si falla el armado.
- **Checkout digital bloqueado si ya hay suscripción paga vigente** (`f3a340a`).
- **Cancelar frena todas las suscripciones vigentes en el proveedor** antes de marcar la baja (`9081e27`, `src/lib/cancel-providers.ts`).
- **Panel admin: definir la contraseña de una usuaria** (`4710cce`), auditado y sin permitirlo sobre otras admins.

**14/10/2026**
- Migraciones `027–031` aplicadas: recordatorios 14/19, fundadoras sin tope, hardening RLS y catálogo sin `pdf_url`; PDFs en bucket privado `editions-pdfs` con backfill verificado.
