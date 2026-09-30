# Base funcional y técnica — Triba Mail Club

Estado: bases de producto acordadas; código funcional todavía sin implementar.
Fuente funcional: `Triba Mail Club – Pedido para la web.pdf` (7 páginas) y decisiones posteriores de producto.

## 1. Decisiones confirmadas

### Planes y monedas

| Plan Mail Club | País/zona de envío | Proveedor | Precio mensual |
|---|---|---|---:|
| Europa | País europeo | Stripe | EUR 10,50 |
| Resto del mundo | País no europeo, excepto Argentina | Stripe | USD 12,50 |
| Argentina | Argentina | Mercado Pago | ARS 16.000 |

El país de **destino postal** determina el precio y el proveedor para una nueva alta al Mail Club. No se decide por IP, residencia declarada, nacionalidad ni país emisor de la tarjeta. La tabla definitiva de códigos ISO deberá ser explícita en el código y verificarse antes de habilitar el checkout; la recomendación aprobada incluye Reino Unido, Suiza, Noruega y microestados en la zona EUR.

La regla de zona se aplica a las altas nuevas del Mail Club, que requieren dirección postal. El plan solo digital conserva su flujo y moneda actuales.

### Suscriptoras digitales existentes

- Una suscriptora digital activa conserva su proveedor y moneda al hacer upgrade, aunque la dirección postal pertenezca a otra zona.
- La diferencia se cobra en su moneda actual: EUR 3,50; USD 5,50; ARS 9.000.
- Tras confirmarse ese pago, la renovación siguiente pasa al precio Mail Club correspondiente a esa moneda: EUR 10,50; USD 12,50; ARS 16.000.
- El upgrade cuenta para el número de socia fundadora.

Esta excepción protege suscripciones existentes; no cambia la regla de destino postal para nuevas altas.

### Corte, envíos y datos

- Membresías activas cuyo período está pagado y vigente al corte del día 15 inclusive reciben el sobre de ese mes, despachado el día 20.
- Alta/upgrade con pago confirmado hasta el día 15 inclusive: primer sobre en el envío de ese mes. Después del 15: primer sobre en el envío del mes siguiente. El primer cobro se realiza al confirmar el alta/upgrade.
- La dirección de entrega se puede actualizar desde el perfil. Si se actualiza hasta el corte, afecta el envío de ese mes; después del corte, el siguiente.
- El envío está incluido a todo el mundo y se despacha por correo ordinario, sin tracking. Plazos informativos: España 3–7 días; resto de Europa 1–2 semanas; Argentina y resto del mundo 3–6 semanas.
- Se conserva la dirección hasta dos meses después del último despacho aplicable, para permitir gestionar reposiciones.
- El borrador conserva el criterio de reclamo/reposición y las condiciones de aduana; su redacción final requiere aprobación junto con los términos.
- El número de fundadora se asigna en orden al primer pago Mail Club confirmado, incluyendo upgrades, hasta completar las primeras 100.

### Newsletter y contenido

- No habrá newsletter gratuito ni newsletter incluido como beneficio de ningún plan. Retirar formularios, altas, contenidos/automatizaciones y el copy “NEWSLETTER INCLUIDO”.
- Antes del retiro, exportar y verificar la lista actual completa; luego borrar únicamente los contactos/registros del newsletter gratuito de Supabase y Sender. Mantener emails transaccionales y datos de suscripción.
- Página, tarjeta, FAQ, condiciones, privacidad y emails de Mail Club salen en ES y EN desde el lanzamiento.
- El selector de idioma de la carta (ES/EN) es una mejora posterior del PDF y no bloquea la salida inicial; no confundirlo con preparar la página Mail Club en inglés.
- Los textos legales parten del borrador del PDF y deben quedar revisados/aprobados antes de la publicación.

## 2. Auditoría de la app actual

| Área | Situación encontrada | Consecuencia para Mail Club |
|---|---|---|
| Checkout y auth | `src/pages/api/create-checkout.ts` acepta proveedor y moneda, pero no plan, país ni dirección. `src/lib/checkout-intent.ts` persiste solo proveedor/moneda y `SubscribePage` reanuda el checkout automáticamente tras login. | Extender la intención para distinguir Mail Club y redirigir a completar dirección/condiciones tras login; no persistir dirección postal en `localStorage`. El servidor deriva precio/proveedor del país validado. |
| Precios | `src/lib/pricing.ts` contiene los precios digitales actuales. `src/lib/stripe.ts` solo configura IDs Stripe digitales; Mercado Pago recibe el importe recurrente actual desde la configuración de precio. | Configurar precios Mail Club separados en Stripe y ARS para Mercado Pago; no reutilizar accidentalmente los IDs/importes digitales. |
| Base de datos | `subscriptions` registra proveedor, moneda, estado y fechas, pero no tipo de plan. No existe entidad de dirección postal ni de envíos. Última migración: `020`. | Migración siguiente, idempotente y reflejada en `src/lib/database.types.ts`. Las suscripciones existentes deben quedar como digitales. |
| Dirección y privacidad | No hay captura ni edición de direcciones. `profiles` se consulta con `select(*)` en varios lugares. | Preferir tabla postal dedicada con RLS; no ampliar indiscriminadamente el perfil que leen componentes generales. |
| Perfil | `src/components/MyAccountPage.astro` ofrece el acceso digital; no incluye upgrade, gestión postal ni downgrade. | Incorporar dirección, upgrade Mail Club, regreso al plan digital y estado de envíos en la cuenta. |
| Cancelación/cambio de plan | `src/pages/api/cancel-subscription.ts`, `src/lib/payment-provider.ts` y la RPC `cancel_subscription` cancelan inmediatamente. | El requisito pide conservar el período pagado. Cambiarlo coordinadamente en proveedor, base de datos, perfil y webhooks. |
| Webhooks | Stripe activa suscripciones en `checkout.session.completed`; Mercado Pago maneja activación/renovación con eventos idempotentes. No hay flujo de pago único de upgrade Mail Club. | Agregar estados e idempotencia para el pago diferencial y su actualización posterior de recurrencia. Mantener firmas/verificación actuales. |
| Corte y período pago | Stripe guarda un fallback de período de 30 días cuando el webhook no expone las fechas; Mercado Pago renueva el fin con `now + 30 días` en algunos eventos. | No usar esos fallbacks sin validarlos como fuente de elegibilidad postal. El lote del corte debe basarse en la vigencia real pagada al día 15. |
| Administración | `/admin/suscriptoras` ya exporta CSV genérico, sin dirección ni datos de envío. No hay exportación exclusiva de la lista gratuita. | Agregar exportación de envíos por mes con los campos pedidos y un export previo de newsletter. El CSV debe protegerse contra fórmulas de Excel originadas en campos de usuario. |
| Emails | `src/lib/email.ts` contiene emails transaccionales digitales y de edición. No hay bienvenida Mail Club con dirección/primer despacho ni aviso de despacho. | Agregar email de bienvenida al alta/upgrade con dirección y mes del primer sobre, más aviso cuando se registra el despacho. |
| Página pública/i18n | No existen `/mail-club` ni `/en/mail-club`. i18n usa páginas físicas EN, `src/i18n/ui.ts` y `src/i18n/locale.ts`. | Añadir página ES/EN y actualizar rutas localizadas; el acceso puede enlazarse desde Suscribirme sin alterar la navegación global existente. |
| Newsletter | Hay formularios en `Home.astro` y `SubscribePage.astro`, API `/api/newsletter`, textos en i18n, términos/privacidad y estado Sender en el dashboard. No hay export administrativo dedicado. | Exportar y verificar antes de retirar. En la salida eliminar el beneficio “NEWSLETTER INCLUIDO”, formularios, nuevas altas y automatizaciones; borrar luego solo los contactos/registros del newsletter gratuito, sin afectar pagos ni emails transaccionales. |
| Documentación pública | `README.md` y `docs/flujo-funcional.md` describen el newsletter gratis como oferta vigente. | Actualizar documentación de producto al mismo tiempo que la retirada, manteniendo scripts/tablas necesarios para conservar y exportar la lista histórica. |

## 3. Modelo técnico recomendado

1. Añadir el tipo de plan (`digital` / `mail_club`) a suscripciones, migrando todas las filas actuales a `digital`.
2. Guardar la dirección postal en una tabla dedicada con nombre de destinataria, país ISO, provincia/estado, ciudad, código postal, dirección y complemento (portal/piso/puerta); acceso propio para la usuaria y acceso administrativo protegido.
3. Registrar membresía/orden de fundadora de forma transaccional e idempotente. Un intento o pago rechazado no reserva número; reintentos de webhooks no duplican alta ni email.
4. Crear una copia inmutable de la dirección asociada al lote mensual de envío. Los cambios de dirección hasta el corte afectan el sobre de ese mes; los cambios posteriores, al siguiente. Exportar etiquetas desde esa copia.
5. Guardar cada upgrade como una operación con estado (pendiente, cobro confirmado, plan actualizado, fallido), proveedor y referencia de cobro. Solo actualizar el precio recurrente después de confirmar el pago único.
6. Registrar aceptación de condiciones con versión y fecha tanto en alta Mail Club como en upgrade.
7. Habilitar un proceso seguro de actualización trimestral del importe ARS para las preaprobaciones Mail Club de Mercado Pago, sin recrear suscripciones; registrar resultado por suscripción y notificar con al menos 30 días de anticipación.
8. Enviar bienvenida al alta/upgrade con dirección y mes del primer sobre; enviar aviso de despacho solo al registrar la salida del lote.

## 4. Orden de implementación

1. **Cimientos:** migración, tipos, clasificación de países, modelo de dirección/membresía/envío y consentimiento.
2. **Alta nueva:** formulario, validación de zona, precios Mail Club, Stripe EUR/USD y Mercado Pago ARS, webhooks y bienvenida. El Mail Club conserva acceso a revista, archivo y descarga PDF.
3. **Gestión de suscriptoras:** edición de dirección; upgrade con diferencia (Stripe: cargo único a la tarjeta guardada y nueva tarifa sin prorrateo para la renovación siguiente; Mercado Pago: pago único y, tras aprobación, actualización del importe recurrente); cambio a digital/cancelación al fin de período; manejo de fallos e idempotencia.
4. **Operación de correo:** corte mensual, snapshots, CSV/Excel, número de fundadora y aviso de despacho.
5. **Presentación:** página Mail Club, tarjeta en Suscribirme, preguntas frecuentes, ES/EN, términos y privacidad.
6. **Retiro del newsletter gratis:** exportar y verificar la lista completa (unión Supabase/Sender); después del día de presentación retirar formularios y cortar nuevas altas, y borrar únicamente los contactos/registros gratuitos que no pertenezcan al grupo pago.
7. **Validación:** pruebas de alta, pagos, webhooks repetidos, upgrades, renovación, cambio/cancelación, dirección antes/después del corte, lote/CSV, emails y reintentos; prueba de cobro real EUR, USD y ARS antes de abrir.

## 5. Criterios de salida

- El importe y proveedor de una nueva alta Mail Club se derivan en servidor del país de envío; manipular el formulario no permite forzar otra zona.
- Un upgrade legado conserva proveedor/moneda, cobra exactamente la diferencia una sola vez y actualiza la recurrencia solo después de pago confirmado.
- Ni cancelación ni vuelta a digital quitan acceso antes del final del período ya pagado.
- En el corte se genera una sola lista por mes, con suscripciones elegibles y direcciones congeladas; los cambios posteriores no alteran etiquetas ya exportadas.
- El CSV incluye destinataria/dirección, email, zona/moneda, fecha de alta Mail Club, estado y número de fundadora; abrirlo no ejecuta fórmulas introducidas en datos postales.
- Reintentar un webhook no duplica membresías, números de fundadora, cambios de precio ni emails.
- La exportación del newsletter precede a la retirada; tras verificarla se borran solo los contactos/registros gratuitos que no estén en el grupo pago.
- La versión EN queda lista sin alterar textos o rutas de administración, que permanecen en ES.
- La release mantiene el flujo digital actual y el acceso vigente a revista/archivo/PDF.

## 6. Comprobaciones operativas pendientes antes de producción

- Verificar en Stripe Dashboard que existen precios recurrentes Mail Club separados en EUR y USD, y qué configuración permite cobrar/liquidar EUR en la cuenta actual.
- Verificar en Mercado Pago el cobro único del upgrade, la actualización de `transaction_amount`, el momento efectivo del nuevo importe y las notificaciones enviadas por MP. La documentación consultada permite actualizar el importe, pero no garantiza aviso/aceptación; el email propio no debe depender de MP.
- Confirmar la fecha de vencimiento real que se usará para elegibilidad al corte; no basarla en los fallbacks locales de 30 días hasta validarlos.
- Usar la zona horaria `Europe/Madrid` para interpretar el cierre del día 15 inclusive y el despacho del día 20.
- Confirmar el proceso de actualización trimestral del precio ARS y el aviso a suscriptoras con al menos 30 días de anticipación.
- Validar el texto definitivo de condiciones/privacidad y las direcciones de contacto que aparecen en los borradores.
- Confirmar fotos/recursos visuales antes de cerrar la página pública; si no llegan, acordar placeholder antes de producción.
