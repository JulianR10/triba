# Pasos para probar pagos de Triba Mail Club

Guía para probar Mail Club sin usar credenciales live en Preview ni tocar la base de producción.

> Nota 03-oct-2026: las secciones 1–8 conservan la matriz histórica previa al lanzamiento. Producción ya está publicada; no usar cuentas con `provider_subscription_id` manuales como evidencia del portal o de los cobros.

## Estado actual (03-oct-2026)

Hecho (además de lo anterior):

- Rama Vercel: `mail-club`; Preview: <https://triba-git-mail-club-julianrecarte.vercel.app>.
- Supabase de pruebas: `Triba-mail-club` (`ktgnaudcobcayrxhucsn`), con migraciones `001`–`024` y edición #5 sembrada (metadatos ES + portada pública, sin PDF).
- Variables de Preview para la rama `mail-club` apuntan al Supabase de pruebas; Auth permite el dominio Preview; protección Vercel desactivada para Preview.
- Stripe Test mode configurado y verificado por API: clave `sk_test_…`, webhook secret, 4 Price IDs (digital EUR/USD 7, Mail Club EUR 10,50 / USD 12,50).
- Alta Mail Club EUR probada (Italia, tarjeta de prueba) → suscripción activa en staging. Alta USD probada → activa en staging.
- Upgrade digital → Mail Club EUR y USD verificados de punta a punta en Preview: alta digital con tarjeta de prueba, pago único de la diferencia (€3,50 / U$S 5,50, un solo cargo), cambio de tarifa recurrente a Mail Club (EUR 10,50 / USD 12,50), fundadoras #2 y #3 asignadas sin duplicados, bienvenida por email.
- Tarjeta rechazada (`4000000000000002`): Stripe la rechaza, no se crea suscripción y el perfil queda `free`.
- 3D Secure (`4000000000003220`, alta Mail Club EUR): challenge mock completado en iframe, retorno con `flow=mail_club`, activación por la vía asincrónica (`checkout.session.completed` pendiente + `invoice.paid`), fundadora #4 asignada sin duplicados. Suscripción de prueba cancelada y filas eliminadas después.
- Downgrade a digital al fin del período verificado vía app: flags `scheduled_plan_type=digital` + schedule Stripe con fase Mail Club vigente y fase digital posterior (`end_behavior=release`). Requirió fix: anclar la fase actual con su `start_date` vigente (commits `18c0ad1`/`eccb46f`).
- Limpieza: suscripciones e2e canceladas desde Stripe (webhooks conciliaron las bajas en staging) y filas de prueba eliminadas. Restan solo usuarios `e2e-*@example.com` inertes (sin suscripciones ni perfil) + sus consentimientos y números de fundadora, que son inmutables por diseño y no se reutilizan.
- Precios live de Stripe creados y cargados en Vercel Production: `STRIPE_PRICE_MAIL_CLUB_EUR=price_1UM3BBLIVKTt84JHU5FJwZ6r`, `STRIPE_PRICE_MAIL_CLUB_USD=price_1UM3BBLIVKTt84JHu7GwpUxB`. **Verificados por API el 03-oct-2026**: live, activos, recurrentes mensuales, €10,50 / $12,50, producto “Triba Mail Club”, sin duplicados; coinciden con Production y con `MAIL_CLUB_PRICE_CENTS`. Falta solo el cobro real de validación.
- `MyAccountPage` tolera lista de ediciones vacía; aviso de éxito post-compra convertido en tarjeta flotante centrada y cerrable (X, fondo, Escape) para todos los pagos.
- Aviso de éxito diferenciado por flujo (verificado en Preview con usuarios de prueba): digital conserva el texto actual; alta Mail Club confirma la suscripción postal activa; upgrade confirma el pase de digital a Mail Club con acceso digital conservado. Retorno explícito `flow=mail_club_upgrade` para Stripe y ruta `/api/checkout-return/mail-club-upgrade` para Mercado Pago (303).
- Grilla de Suscribirme con altura mínima en desktop (el footer ya no se monta sobre el formulario).
- Rediseño UI (hallmark, tokens de marca intactos): `/mail-club` Manifesto, Suscribirme con Mail Club héroe y digital secundario, Mi Cuenta pasada quirúrgica (hero sólido, reveals mínimos), emails de bienvenida (carta) y despacho (sello) sin cambiar textos ni envíos.
- Mercado Pago: webhook de prueba configurado en el dashboard (URL Preview) y variables de prueba con alcance Preview/`mail-club` verificadas por nombre. OJO: el Access Token de prueba se expuso en el chat → regenerarlo y actualizar la variable.
- Supabase Production: historial reconciliado (`017–020` marcadas aplicadas sin reejecutar) y `db push` aplicado: `021–025` están en producción (`025` verificada por REST).
- Webhook Stripe reenviado manualmente → 200 sin duplicados (ver §7).
- Decisión MP: sin sandbox (bloqueado por cuenta compradora); se valida en live el día del lanzamiento. Webhook de prueba configurado en el dashboard; variables de prueba en Preview/`mail-club` verificadas por nombre. El token de prueba expuesto en el chat conviene regenerarlo por higiene, sin urgencia (los tokens test no mueven dinero real).
- Envío postal: confirmado que está **incluido** en el precio del plan (sin cargo separado). Pendiente de las propietarias: medir el sobre prototipo y cotizar Correos para validar el margen (`docs/postal-costing.md`).

### Actualización post-lanzamiento

- Mail Club está publicado en `main`/producción.
- Mi Cuenta ahora usa un teaser plegable para el upgrade: **“Me interesa” / “Ocultar formulario”**, con foco accesible y respeto por `prefers-reduced-motion`.
- El panel Mail Club ya no invita al downgrade; conserva la edición de dirección.
- El botón de checkout restaura su etiqueta original al volver desde Stripe mediante bfcache.
- `scripts/smoke-prod.mjs` cubre home, Suscribirme, Mail Club, reveal en legales y errores de consola. Hay que volver a ejecutarlo después de cada deploy.
- Las cuentas manuales de prueba con IDs de Stripe inventados no pueden abrir el portal: `POST /api/portal` intenta recuperar una suscripción inexistente y responde 500. El portal debe validarse con suscripciones creadas por checkout real.
- **Recuperación 03-oct (tarde):** upgrades `pending` expiran a los 60 min (`upgrade-recovery.ts`); el portal y la cancelación aceptan `past_due`/`incomplete`; la cancelación devuelve error 502 si el proveedor falla; la bienvenida usa reclamo `welcome_sent_at` (at-most-once con reintento); el retorno MP distingue approved/pending/rejected; el lote congela `joined_at`/`sub_status`; `scripts/purge-mail-club-retention.mjs` implementa la retención de 60 días.
- **Precios live verificados por API (03-oct):** EUR 10,50 y USD 12,50, live, activos, mensuales, mismo producto, sin duplicados. Vercel Production y `MAIL_CLUB_PRICE_CENTS` coinciden.
- **Conciliación automática (05-oct):** un pago MP aprobado podía quedar en `incomplete` sin activar (gate de estado + `preapproval_id` ausente en `/v1/payments`) — corregido con `isActivationBlocked` + `resolveAuthorizedPayment()` y tests. Red de seguridad en 3 capas con la misma `src/lib/reconcile.ts`: cron diario `GET /api/cron/reconcile` (requiere `CRON_SECRET` en Vercel), botón manual en admin/ficha, y aviso pre-lote (activar-y-continuar / crear-igual). Orden operativo: crear el lote alcanza; el cron cubre eventos perdidos.

Pendiente (uno a la vez, en orden):

1. Verificación interactiva del teaser plegable del upgrade.
2. Cobro live de validación: alta digital, upgrade digital → Mail Club y upgrade ARS en Mercado Pago, con conciliación o reembolso.
3. Portal de gestión validado con suscripciones creadas por checkout real.
4. Export y verificación del newsletter desde producción, con retiro posterior solo de contactos gratuitos.
5. Costeo postal medido, fotos definitivas y aprobación legal.

## 1. Conseguir acceso de forma segura

- Pedir a las propietarias acceso a los dashboards de Stripe y Mercado Pago, o que configuren ellas los valores indicados abajo.
- No compartir contraseñas, claves API ni secretos de webhook por chat, correo o en el repositorio.
- No modificar variables del entorno Vercel **Production** durante las pruebas.

## 2. Stripe: crear precios de prueba

En Stripe, activar **Test mode** y crear precios recurrentes mensuales para:

| Plan | Moneda | Importe mensual | Variable de Vercel Preview |
|---|---:|---:|---|
| Digital | EUR | 7 | `STRIPE_PRICE_EUR` |
| Digital | USD | 7 | `STRIPE_PRICE_USD` |
| Mail Club | EUR | 10,50 | `STRIPE_PRICE_MAIL_CLUB_EUR` |
| Mail Club | USD | 12,50 | `STRIPE_PRICE_MAIL_CLUB_USD` |

Guardar los cuatro Price IDs (`price_…`) del modo de prueba. Los IDs de prueba no sirven en live y los precios digitales también deben ser de prueba para validar upgrades.

## 3. Stripe: configurar el webhook de prueba

Crear un endpoint de webhook en **Test mode** con esta URL:

```text
https://triba-git-mail-club-julianrecarte.vercel.app/api/webhook/stripe
```

Habilitar estos eventos:

- `checkout.session.completed`
- `invoice.paid`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `payment_intent.succeeded` (upgrade con tarjeta guardada)
- `payment_intent.payment_failed` (auditoría de rechazos del upgrade)

Guardar el signing secret (`whsec_…`) generado para ese endpoint de prueba. Cada endpoint/modo tiene su propio secreto.

## 4. Mercado Pago: configurar credenciales y webhook de prueba

- Obtener el **Access Token de prueba** de la aplicación de Mercado Pago.
- Crear/configurar un webhook de prueba con esta URL:

```text
https://triba-git-mail-club-julianrecarte.vercel.app/api/webhook/mercadopago
```

- Suscribirse a los tipos que procesa la aplicación:
  - `subscription_preapproval`
  - `subscription_authorized_payment`
  - `payment`
- Guardar el secreto de firma generado para ese webhook.

Argentina sigue usando Mercado Pago. No hay que crear un Price ID de Mercado Pago: el flujo de la aplicación configura los importes ARS.

## 5. Cargar variables solo en el Preview de `mail-club`
En Vercel → proyecto `triba` → **Settings → Environment Variables**, configurar estas variables para **Preview**, con alcance a la rama `mail-club`:

| Variable | Valor para Preview |
|---|---|
| `STRIPE_SECRET_KEY` | Clave Stripe de prueba (`sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret del webhook Stripe de prueba (`whsec_…`) |
| `STRIPE_PRICE_EUR` | Price ID digital EUR de prueba |
| `STRIPE_PRICE_USD` | Price ID digital USD de prueba |
| `STRIPE_PRICE_MAIL_CLUB_EUR` | Price ID Mail Club EUR de prueba |
| `STRIPE_PRICE_MAIL_CLUB_USD` | Price ID Mail Club USD de prueba |
| `MP_ACCESS_TOKEN` | Access Token de prueba de Mercado Pago |
| `MP_WEBHOOK_SECRET` | Secreto del webhook de prueba de Mercado Pago |

Reemplazar en Preview las credenciales live que existan para estas variables. No cambiar las variables de **Production**. Las variables Supabase ya apuntan al proyecto aislado de pruebas.

## 6. Desactivar la protección del Preview (bloqueante)

El deployment Preview tiene activado **Vercel Authentication** (Deployment
Protection): las páginas muestran el login de Vercel y los webhooks reciben
`401`, así que Stripe/Mercado Pago no pueden notificar pagos.

En Vercel → proyecto `triba` → **Settings → Deployment Protection**,
desactivar la protección para el entorno **Preview**. No tocar Production.
Sin este paso, ninguna prueba de pago puede funcionar.

## 7. Probar (matriz)

Después de guardar las variables, redeplegar el Preview para que Vercel las aplique. Confirmar que el deployment pertenece a la rama `mail-club` y usar cuentas de prueba.

Hecho: altas Mail Club EUR/USD, upgrades EUR/USD, tarjeta rechazada, 3DS/`invoice.paid`, downgrade al fin del período y webhook repetido → verificados (ver Estado actual).

Upgrade con tarjeta guardada (nuevo, pendiente de matriz en Preview):
- Tarjeta OK sin SCA → cobro off-session instantáneo, sin salir de Mi Cuenta.
- 3DS (`4000000000003220`) → cae al Checkout automáticamente y se completa ahí.
- Rechazo (`4000000000000002`) → 402 inline + botón "Pagar con otra tarjeta" → Checkout.
- Sin tarjeta guardada → Checkout directo (flujo anterior intacto).

Falta (solo live, día del lanzamiento):

- Upgrade ARS con Mercado Pago (sin sandbox; validar con cargo real mínimo).
- Confirmar que la bienvenida llega a una casilla controlada. Los emails transaccionales pueden enviarse de verdad si Preview utiliza Sender live.
- No registrar despachos físicos ni preparar envíos reales desde cuentas de prueba.
- Las cuentas que ya tienen Mail Club activo no sirven para probar un checkout nuevo: usar cuentas de prueba nuevas o cancelar la suscripción test en Stripe.
- Al terminar: cancelar las suscripciones de prueba desde Stripe Test mode (los webhooks actualizan Supabase). No borrar filas directamente de la base.

## 8. Preparación de producción, después de aprobar las pruebas

Todo esto se puede dejar cargado **antes** del día de la presentación; el
código nuevo solo empieza a usarlo cuando `mail-club` se integre en `main`
y se despliegue a Production. No requiere deploy previo.

- En Stripe **Live mode**, crear los precios mensuales Mail Club EUR 10,50 y USD 12,50 y guardar sus nuevos Price IDs live. ✅ Hecho 02-oct y cargados en Vercel Production (ver Estado actual).
- En Vercel **Production**, agregar `STRIPE_PRICE_MAIL_CLUB_EUR` y `STRIPE_PRICE_MAIL_CLUB_USD` con esos IDs live.
- Conservar las credenciales y precios digitales actuales de Production (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_EUR`, `STRIPE_PRICE_USD`). Nunca poner valores de prueba en Production.
- Revisar el webhook Stripe live existente en `https://www.universotriba.com/api/webhook/stripe` y habilitar los eventos indicados en §3 (incluidos `payment_intent.succeeded` y `payment_intent.payment_failed` del upgrade con tarjeta guardada). Si se crea un endpoint live distinto o se rota su signing secret, actualizar el `STRIPE_WEBHOOK_SECRET` de Production con el secreto que corresponda.
- Revisar el webhook live de Mercado Pago en `https://www.universotriba.com/api/webhook/mercadopago` y habilitar los tipos indicados en §4. Si se crea una configuración distinta o rota el secreto de firma, actualizar `MP_WEBHOOK_SECRET` de Production.
- Mantener en Production el Access Token live de Mercado Pago. No se necesita una variable nueva de precio para ARS.
- Supabase Production: su historial registra migraciones hasta la `016`,
  pero el esquema ya trae cambios posteriores (ediciones bilingües,
  `preferred_locale`) sin `subscriptions.plan_type` ni tablas Mail Club.
  No hacer `db push` a ciegas. Orden: reconciliar el historial 017–020
  contra el esquema live (marcar como aplicadas las ya presentes,
  sin re-ejecutarlas) y después aplicar 021–024. Requiere la contraseña de
  la base de producción y una ventana sin escrituras.
- Hacer un go/no-go de pagos, webhooks, costos postales, textos legales y fotos antes de publicar Mail Club.

## 9. Lanzamiento y controles posteriores

1. Exportar y verificar la lista del newsletter (`scripts/export-newsletters.mjs`).
2. Confirmar variables Production + migraciones aplicadas + webhooks live.
3. Publicar en `main` y desplegar. Verificar checkout live mínimo.
4. Recién después, retirar newsletter y borrar solo contactos gratuitos.

## 10. Estado de variables (03-oct-2026)

Preview rama `mail-club`: Stripe completo en modo prueba, Supabase de pruebas, `SITE` del Preview y variables MP de prueba (verificadas por nombre; regenerar el token expuesto cuando se pueda).

Production: credenciales live y precios digitales vigentes + los 2 Price IDs live de Mail Club ya cargados. Queda pendiente la prueba live mínima (incluido ARS y portal con suscripciones reales) y el retiro del newsletter.
