# Pasos para probar pagos de Triba Mail Club

Guía para probar Mail Club sin usar credenciales live en Preview ni tocar la base de producción.

## Estado ya preparado

- Rama Vercel: `mail-club`.
- Preview estable: <https://triba-git-mail-club-julianrecarte.vercel.app>.
- Supabase de pruebas: `Triba-mail-club` (`ktgnaudcobcayrxhucsn`), separado de producción.
- Migraciones `001`–`024` aplicadas al Supabase de pruebas.
- Variables de Preview para la rama `mail-club` apuntan al Supabase de pruebas; Auth permite el dominio Preview.
- Preview redeplegado y comprobado. Una cuenta temporal de Auth se creó y eliminó durante la prueba.
- Staging sembrado con la edición #5 (solo metadatos ES + portada pública, sin PDF).
- `MyAccountPage` tolera lista de ediciones vacía (hero/visor solo con `featured`).

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

## 7. Redeplegar y probar

Después de guardar las variables, redeplegar el Preview para que Vercel las aplique. Confirmar que el deployment pertenece a la rama `mail-club` y usar cuentas de prueba.

Matriz mínima:

- Alta nueva Mail Club: Europa/EUR → Stripe; resto del mundo/USD → Stripe; Argentina/ARS → Mercado Pago.
- Upgrade digital → Mail Club en EUR, USD y ARS; usar suscripciones digitales creadas en los respectivos modos de prueba.
- Pago aprobado, rechazado, pendiente y webhook repetido; comprobar que no se dupliquen cargos, suscripciones, fundadoras ni emails.
- Cancelación o vuelta a digital al final del período pagado.
- Confirmar que la bienvenida llega a una casilla controlada. Los emails transaccionales pueden enviarse de verdad si Preview utiliza Sender live.
- No registrar despachos físicos ni preparar envíos reales desde cuentas de prueba.

## 7. Preparación de producción, después de aprobar las pruebas

- En Stripe **Live mode**, crear los precios mensuales Mail Club EUR 10,50 y USD 12,50 y guardar sus nuevos Price IDs live.
- En Vercel **Production**, agregar `STRIPE_PRICE_MAIL_CLUB_EUR` y `STRIPE_PRICE_MAIL_CLUB_USD` con esos IDs live.
- Conservar las credenciales y precios digitales actuales de Production (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_EUR`, `STRIPE_PRICE_USD`). Nunca poner valores de prueba en Production.
- Revisar el webhook Stripe live existente en `https://www.universotriba.com/api/webhook/stripe` y habilitar los eventos indicados en §3. Si se crea un endpoint live distinto o se rota su signing secret, actualizar el `STRIPE_WEBHOOK_SECRET` de Production con el secreto que corresponda.
- Revisar el webhook live de Mercado Pago en `https://www.universotriba.com/api/webhook/mercadopago` y habilitar los tipos indicados en §4. Si se crea una configuración distinta o rota el secreto de firma, actualizar `MP_WEBHOOK_SECRET` de Production.
- Mantener en Production el Access Token live de Mercado Pago. No se necesita una variable nueva de precio para ARS.
- Hacer un go/no-go de pagos, webhooks, costos postales, textos legales y fotos antes de publicar Mail Club.

## Variables pendientes de prueba

Configurado en Preview rama `mail-club`: los cuatro Price IDs de prueba
(`STRIPE_PRICE_EUR`, `STRIPE_PRICE_USD`, `STRIPE_PRICE_MAIL_CLUB_EUR`,
`STRIPE_PRICE_MAIL_CLUB_USD`) y `STRIPE_WEBHOOK_SECRET` de prueba.

Falta reemplazar en Preview: `STRIPE_SECRET_KEY` (sigue el valor live;
cargar el `sk_test_…`), `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` (cargar los
valores de prueba). No redeplegar para pruebas de pago hasta completar esto.
