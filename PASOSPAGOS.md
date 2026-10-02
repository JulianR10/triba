# Pasos para probar pagos de Triba Mail Club

Guía para probar Mail Club sin usar credenciales live en Preview ni tocar la base de producción.

## Estado actual (02-oct-2026)

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
- Precios live de Stripe creados y cargados en Vercel Production: `STRIPE_PRICE_MAIL_CLUB_EUR=price_1UM3BBLIVKTt84JHU5FJwZ6r`, `STRIPE_PRICE_MAIL_CLUB_USD=price_1UM3BBLIVKTt84JHu7GwpUxB`. Production no se redepleó: el sitio live no cambia hasta el merge + deploy. Falta verificar importes/moneda de esos IDs el día del lanzamiento (`prelaunch-check` + cobro mínimo live).
- `MyAccountPage` tolera lista de ediciones vacía; aviso de éxito post-compra convertido en tarjeta flotante centrada y cerrable (X, fondo, Escape) para todos los pagos.
- Aviso de éxito diferenciado por flujo (verificado en Preview con usuarios de prueba): digital conserva el texto actual; alta Mail Club confirma la suscripción postal activa; upgrade confirma el pase de digital a Mail Club con acceso digital conservado. Retorno explícito `flow=mail_club_upgrade` para Stripe y ruta `/api/checkout-return/mail-club-upgrade` para Mercado Pago (303).
- Grilla de Suscribirme con altura mínima en desktop (el footer ya no se monta sobre el formulario).
- Rediseño UI (hallmark, tokens de marca intactos): `/mail-club` Manifesto, Suscribirme con Mail Club héroe y digital secundario, Mi Cuenta pasada quirúrgica (hero sólido, reveals mínimos), emails de bienvenida (carta) y despacho (sello) sin cambiar textos ni envíos.
- Mercado Pago: webhook de prueba configurado en el dashboard (URL Preview) y variables de prueba con alcance Preview/`mail-club` verificadas por nombre. OJO: el Access Token de prueba se expuso en el chat → regenerarlo y actualizar la variable.
- Supabase Production: historial reconciliado (`017–020` marcadas aplicadas sin reejecutar) y `db push --dry-run` limpio (solo aplicaría `021–024`). Sin cambios aplicados todavía.

Pendiente:

- Mercado Pago ARS: probar en sandbox (bloqueado por cuenta compradora) o validar en live el día del lanzamiento. Confirmar regeneración del token de prueba expuesto.
- Preparación de producción (§8) y día del lanzamiento (§9).
- Puertas no técnicas: costeo postal medido, export del newsletter, fotos definitivas, aprobación legal.

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

Hecho: alta nueva Mail Club EUR (Stripe) y USD (Stripe) → activas en staging. Upgrade digital → Mail Club EUR/USD, tarjeta rechazada y downgrade al fin del período → verificados (ver Estado actual).

Falta:

- Upgrade ARS cuando esté MP de prueba.
- Webhook repetido explícito: reenviado `checkout.session.completed` desde el dashboard → HTTP 200 sin errores y sin duplicados (mismas suscripciones, fundadoras 1–4 intactas).
- Cancelación o vuelta a digital al final del período pagado.
- Confirmar que la bienvenida llega a una casilla controlada. Los emails transaccionales pueden enviarse de verdad si Preview utiliza Sender live.
- No registrar despachos físicos ni preparar envíos reales desde cuentas de prueba.
- Las cuentas que ya tienen Mail Club activo no sirven para probar un checkout nuevo: usar cuentas de prueba nuevas o cancelar la suscripción test en Stripe.
- Al terminar: cancelar las suscripciones de prueba desde Stripe Test mode (los webhooks actualizan Supabase). No borrar filas directamente de la base.

## 8. Preparación de producción, después de aprobar las pruebas

Todo esto se puede dejar cargado **antes** del día de la presentación; el
código nuevo solo empieza a usarlo cuando `mail-club` se integre en `main`
y se despliegue a Production. No requiere deploy previo.

- En Stripe **Live mode**, crear los precios mensuales Mail Club EUR 10,50 y USD 12,50 y guardar sus nuevos Price IDs live.
- En Vercel **Production**, agregar `STRIPE_PRICE_MAIL_CLUB_EUR` y `STRIPE_PRICE_MAIL_CLUB_USD` con esos IDs live.
- Conservar las credenciales y precios digitales actuales de Production (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_EUR`, `STRIPE_PRICE_USD`). Nunca poner valores de prueba en Production.
- Revisar el webhook Stripe live existente en `https://www.universotriba.com/api/webhook/stripe` y habilitar los eventos indicados en §3. Si se crea un endpoint live distinto o se rota su signing secret, actualizar el `STRIPE_WEBHOOK_SECRET` de Production con el secreto que corresponda.
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

## 9. Día del lanzamiento (orden)

1. Exportar y verificar la lista del newsletter (`scripts/export-newsletters.mjs`).
2. Confirmar variables Production + migraciones aplicadas + webhooks live.
3. Integrar `mail-club` en `main` y desplegar. Verificar checkout live mínimo.
4. Recién después, retirar newsletter y borrar solo contactos gratuitos.

## 10. Estado de variables (01-oct-2026)

Preview rama `mail-club`: Stripe completo en modo prueba (`sk_test_…`,
webhook secret y los 4 Price IDs). Supabase de pruebas. `SITE` del Preview.

Pendiente en Preview: `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` de prueba
(todavía con valores live → no probar ARS). Todo lo demás de pago en
Preview ya es de prueba.

Production (intacto): credenciales live y precios digitales vigentes.
Faltan `STRIPE_PRICE_MAIL_CLUB_EUR` y `STRIPE_PRICE_MAIL_CLUB_USD` live
(ver §8).
