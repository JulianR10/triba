# Triba Mail Club — bases y plan de trabajo

**Estado (03-oct-2026):** Mail Club está publicado en `main`/producción. Esta actualización incorpora el teaser plegable del upgrade en Mi Cuenta, la separación superior de las tarjetas de upgrade/dirección y el retiro visual de la invitación al downgrade en el panel Mail Club.
**Última verificación local:** `astro check` 0 errores · `npm test` 21/21 · `npm run build` OK. Migración `025` aplicada a producción (columnas `welcome_sent_at`, `joined_at`, `sub_status` + `cancel_subscription` para dunning).
**Ramas:** `main` = trabajo + sitio live; cada push a `main` despliega producción. `mail-club` = rama histórica ya integrada.
**Preview Vercel (rama):** `https://triba-gqpgwguo2-julianrecarte.vercel.app` — referencia histórica de la matriz previa al lanzamiento.
**Regla:** validar `astro check`, tests y build antes de cada push a `main`; no commitear secretos ni datos personales.
**Especificación de origen:** `Triba Mail Club – Pedido para la web.pdf` (27-sep-2026), complementada por las decisiones de producto registradas aquí.

Este documento resume las decisiones vigentes y el orden recomendado para el upgrade. Si las notas preliminares `docs/mail-club-base-funcional.md` o `docs/verificacion-flujos-de-pago.md` difieren de lo que se confirma aquí, prevalecen las decisiones más recientes de este documento.

## 0. Avance registrado

### Completado

- [x] Revisados el pedido PDF y las áreas afectadas del proyecto existente.
- [x] Registradas las reglas funcionales y el plan de implementación de Mail Club en este documento.
- [x] Eliminado `mudanzaDominio.md` de la rama `mail-club`.
- [x] Quitado el beneficio “NEWSLETTER INCLUIDO” de la tarjeta digital en ES y EN (`src/i18n/ui.ts`).
- [x] Alineadas las notas preliminares con las decisiones vigentes: zona `Europe/Madrid`, newsletter eliminado después de exportar, lanzamiento ES/EN y plazos de envío.
- [x] Origen de envíos fijado: Madrid, España.
- [x] Cimientos de datos: migración `021_mail_club_foundations.sql` (plan_type + direcciones + consentimientos + upgrades + fundadoras + lotes, todo aditivo), tipos sincronizados y `src/lib/mail-club.ts` central (zonas/precios/corte/fundadoras) verificado con Node.
- [x] Alta Mail Club: `POST /api/create-checkout` con `plan=mail_club` deriva zona/moneda/proveedor del país postal en servidor, guarda dirección y consentimiento; precios Mail Club separados en Stripe (`STRIPE_PRICE_MAIL_CLUB_EUR/USD`) y MP; webhooks activan `plan_type=mail_club`, asignan fundadora y envían bienvenida con dirección y mes del primer sobre.
- [x] Tarjeta Mail Club en Suscribirme (ES/EN): selector de país con precio según zona, formulario postal, aceptación de condiciones y link a `/mail-club`; reemplaza la tarjeta del newsletter en esa página.
- [x] Endurecimiento del alta (migración `022`): sin dobles suscripciones (409 hacia upgrade en Mi Cuenta), activación solo con pago confirmado (Stripe `payment_status` + `invoice.paid`, MP pago aprobado), 236 países validados en servidor, sesión antes del formulario, condiciones enlazadas a `/terminos#mail-club` (draft ES/EN + privacidad postal), consentimientos append-only y fundadoras inmutables por trigger.
- [x] Upgrade voluntario en Mi Cuenta: sección solo para plan digital activo con dirección y aceptación; `POST /api/upgrade-checkout` cobra una vez la diferencia (Stripe Checkout `payment` con `price_data`, MP Preference ARS 9.000); webhooks confirman el pago, cambian la tarifa recurrente sin prorrateo (Stripe) o el importe de la preaprobación (MP 7.000→16.000), pasan a `mail_club` y activan fundadora + bienvenida. Sin cancelar ni recrear la suscripción.
- [x] Operación admin en `/admin/mail-club`: crear lote mensual (elegibles con período vigente al corte Madrid, snapshot inmutable, idempotente), export CSV con BOM y celdas anti-fórmulas, registro manual de despacho del día 20 con aviso por email y reintento de fallidos. Corte verificado (CEST 21:59:59Z, CET 22:59:59Z).
- [x] Página pública `/mail-club` + `/en/mail-club` (ruta localizada): bloques del PDF, fotos lorem provisorias (picsum + CSP), cierre y FAQ ampliada (también en Suscribirme).
- [x] Cancelación y vuelta a digital al fin del período (migración `023`): RPC diferida, `scheduleCancel`/schedules Stripe, baja de importe MP, webhooks que completan el downgrade y cierran la baja; reembolso admin sigue revocando en el acto. La invitación visible al downgrade se retiró del panel Mail Club por decisión de producto; la ruta/API existente queda disponible para rehabilitación futura.
- [x] Retiro del newsletter en la rama: Home sin sección ni botón gratis (segundo CTA lleva a Mail Club), legales sin oferta gratuita, `POST /api/newsletter` en 410, componentes muertos eliminados. Datos y export pendientes al lanzamiento: `scripts/export-newsletters.mjs` (solo lectura, CSV + conteos Supabase/Sender).
- [x] Estabilización (check + build en 0): elegibilidad de lote exige vencimiento conocido, gate corta acceso vencido, cancel admin frena recurrencia, reembolso revoca en el acto, upgrades con apply compartido + reintento admin, dirección editable en Mi Cuenta (`PUT /api/address`), moneda validada en upgrade MP.
- [x] Hardening 2 (migración `024` + tests): un pending por usuaria (409 si hay upgrade en curso), consentimientos sin reescritura, lote despachado inmutable, elegibilidad al corte (inicio ≤ corte ≤ fin), aviso separado del despacho físico, export newsletter en unión Supabase/Sender con protección del grupo pago, `csv.ts` puro y 15 tests vitest (`npm test`).
- [x] Publicación para Preview: commit `da3d6d0` pusheado a `origin/mail-club`. Vercel genera Preview aparte; `main` y producción intactos. Pendiente configurar en Vercel las variables del entorno **Preview** (claves de prueba, `SITE` con la URL `.vercel.app` del Preview y webhooks de prueba) antes de probar pagos.

### Novedades 03-oct-2026

- [x] Teaser plegable del upgrade en Mi Cuenta: la tarjeta muestra insignia, título, cuerpo dinámico por moneda y nota del corte; el formulario completo solo aparece al pulsar **“Me interesa” / “I'm interested”**. El mismo botón cambia a **“Ocultar formulario” / “Hide form”**, vuelve al estado inicial, usa `aria-expanded`/`aria-controls`, respeta `prefers-reduced-motion` y lleva el foco al primer campo postal.
- [x] Separación superior de tarjetas en Mi Cuenta: upgrade y dirección usan `mt-12 md:mt-16`, con el mismo ritmo vertical general del sitio.
- [x] Retiro visual del downgrade: el panel Mail Club ya no muestra la tarjeta **“Volver al plan digital”**. Se conserva la edición de dirección; también se conservan la ruta/API y webhooks de downgrade existentes por si se rehabilitan. Se eliminaron su botón, mensajes, handler y claves i18n del panel.
- [x] Reset del botón de checkout tras volver de Stripe: el texto original viaja en `data-original-text` y se restaura en `pageshow` persistido.
- [x] Script `scripts/smoke-prod.mjs`: verificación pública de home, Suscribirme, Mail Club, reveal en legales y errores de consola. Volver a correrlo después de cada deploy.
- [x] Las cuentas manuales de prueba con `provider_subscription_id` inventados no representan suscripciones reales en Stripe. Por eso **“Gestionar suscripción”** falla contra Stripe para esas fixtures: el portal intenta recuperar un `subscription` inexistente. No usar ese error como evidencia contra el flujo productivo; validar el portal con una suscripción creada por checkout real.

### Recuperación y consistencia (03-oct-2026, tarde)

- [x] **TTL de upgrades abandonados.** `src/lib/upgrade-recovery.ts` expira a `failed` los `pending` de más de 60 minutos; `upgrade-checkout.ts` lo ejecuta antes de insertar y reintenta una vez ante `23505`. Un checkout abandonado ya no bloquea intentos nuevos.
- [x] **Mercado Pago rechazado ya no queda colgado.** El webhook de `payment` marca `failed` el upgrade si el pago llega `rejected`/`cancelled`, y un `failed` se puede re-confirmar si el pago aprueba después (mismo criterio que Stripe).
- [x] **Cancelación de preaprobación MP.** Si MP reporta `cancelled`/`expired`/`paused`, la suscripción queda con `cancel_at_period_end=true` y conserva el acceso hasta el vencimiento (antes quedaba `active` sin reconciliar).
- [x] **Portal y cancelación para dunning.** `/api/portal` y `/api/cancel-subscription` aceptan `active`, `trialing`, `past_due` e `incomplete`; migración `025` actualizó `cancel_subscription` para esos estados. Una suscriptora en dunning ya puede gestionar su tarjeta o cancelar.
- [x] **Cancelación honesta.** Si el proveedor falla al frenar la recurrencia, la API responde 502 y no marca la baja local (antes respondía `ok` con warning y podía seguir cobrando).
- [x] **Bienvenida at-most-once con reintento.** `subscriptions.welcome_sent_at` (migración `025`) reclama el envío de forma condicional: dos webhooks concurrentes no duplican el email; si Sender falla, el reclamo se revierte para reintentar.
- [x] **Retorno MP según estado real.** `/api/checkout-return/mail-club-upgrade` mapea `status=rejected/cancelled` a canceled y `pending/in_process` a pending, en lugar de mostrar éxito incondicional.
- [x] **Aviso de corte en dirección.** `PUT /api/address` responde `appliesThisMonth`; el perfil avisa si el cambio aplica al sobre de este mes o al siguiente.
- [x] **Snapshot completo del lote.** Los items congelan `joined_at` y `sub_status` al crearse; CSV y pantalla los prefieren sobre el cálculo en vivo.
- [x] **Despacho endurecido.** Un reintento de avisos no reescribe `dispatched_at`; un lote vacío no se marca despachado; el email se normaliza a minúsculas al crear el item.
- [x] **Alta digital validada.** El servidor rechaza combinaciones proveedor/moneda inválidas (Stripe solo EUR/USD, Mercado Pago solo ARS).
- [x] **`past_due` no degrada de inmediato.** Stripe `past_due` mantiene rol y mensaje de “actualizá tu medio de pago”; solo `canceled` libera el perfil.
- [x] **Renovación MP más estable.** El período se extiende desde el vencimiento vigente (no desde “ahora”) y los webhooks repetidos no vuelven a extenderlo.
- [x] **Retención 60 días operativa.** `scripts/purge-mail-club-retention.mjs` (dry-run por defecto, `--real`, `--days N`) purga snapshots despachados y direcciones sin suscripción activa.
- [x] **Nueva API pública.** `isBeforeCutoffThisMonth()` en `src/lib/mail-club.ts`, con test (suite 21/21).

### Pendiente actual

- [ ] Repetir la verificación interactiva del teaser plegable del upgrade: expandir, contraer, foco, etiquetas ES/EN y `aria-expanded`.
- [ ] Cobros reales EUR/USD/ARS con webhooks, conciliados o reembolsados.
- [ ] Validar el portal de gestión con suscripciones creadas por checkout real, no con fixtures manuales.
- [ ] Correr `scripts/purge-mail-club-retention.mjs` (dry-run) cuando exista el primer lote despachado hace más de 60 días.
- [ ] Exportar/verificar la lista del newsletter y retirar/borrar únicamente los contactos gratuitos.
- [ ] Medir el sobre, confirmar tarifas/cobertura/trámites postales y margen por zona.
- [ ] Recibir las fotos definitivas y aprobar los textos legales.
- [ ] Confirmar con la dueña: España 3–7 días, formato útil del CSV para etiquetas y ausencia permanente de la invitación al downgrade.

### Siguiente orden operativo

1. Verificar el teaser en local con una suscriptora digital de prueba.
2. Commitear, pushear y desplegar; luego correr `scripts/smoke-prod.mjs`.
3. Probar cobros live EUR/USD/ARS y el portal con suscripciones reales.
4. Retirar el newsletter solo después de verificar su exportación.
5. Cerrar costeo postal, fotos y aprobación legal.

> El retiro total del newsletter queda condicionado a la exportación verificada. Los formularios y datos actuales no se han eliminado todavía; los emails transaccionales continúan.

## 1. Decisiones de producto confirmadas

### Planes, precios, zonas y proveedores

| Plan Mail Club | País/zona de destino | Moneda y precio mensual | Proveedor |
|---|---|---:|---|
| Europa | País europeo (incluidos Reino Unido, Suiza, Noruega y microestados) | EUR 10,50 | Stripe |
| Resto del mundo | País no europeo, excepto Argentina | USD 12,50 | Stripe |
| Argentina | Argentina | ARS 16.000 | Mercado Pago |

- Para una **alta nueva** al Mail Club, el país de destino postal determina zona, precio y proveedor. La regla se valida en servidor; no depende de IP, nacionalidad, residencia declarada ni país emisor de la tarjeta.
- Mantener el plan digital actual y sus precios: EUR 7, USD 7 y ARS 7.000. Stripe procesa EUR/USD; Mercado Pago procesa ARS.
- Mantener una lista explícita y revisada de códigos ISO de países europeos en el código. Los países no europeos van a USD salvo Argentina.
- Los precios incluyen envío postal mundial. El Mail Club conserva todas las prestaciones digitales: revista, archivo histórico y descarga PDF.

### Upgrade voluntario desde Mi Cuenta

- Solo se ofrece a una suscriptora digital existente con suscripción activa y al día. El upgrade **siempre lo inicia la usuaria** desde su perfil con “Pasarme al Mail Club”; no hay conversiones automáticas.
- Completa/confirma su dirección postal, acepta las condiciones y paga la diferencia del mes:

| Moneda de la suscripción existente | Diferencia inmediata | Precio Mail Club desde la próxima renovación |
|---|---:|---:|
| EUR | 3,50 | EUR 10,50/mes |
| USD | 5,50 | USD 12,50/mes |
| ARS | 9.000 | ARS 16.000/mes |

- El upgrade conserva cuenta, proveedor, moneda y fecha de renovación actuales; no requiere cancelar ni crear una suscripción desde cero. La regla de zona por destino se aplica a las altas nuevas, no fuerza a una suscriptora existente a cambiar de moneda al actualizar su dirección. Si la dirección del upgrade cae en otra zona, el checkout lo frena con un paso obligado: corregir la dirección o cambiar de zona vía baja al fin del período + alta nueva.
- Stripe: cobrar la diferencia una sola vez con el medio guardado; al confirmarse, cambiar el precio recurrente sin prorrateo para la próxima renovación.
- Mercado Pago: cobrar una vez la diferencia de ARS 9.000; solo tras el pago aprobado actualizar el importe recurrente de ARS 7.000 a ARS 16.000.
- Si el pago está pendiente, falla, se abandona o requiere autenticación adicional, no se completa el upgrade ni se asigna número de fundadora. Los reintentos de webhooks no pueden cobrar ni actualizar más de una vez.
- Volver a digital o cancelar surte efecto al final del período ya pagado. El acceso digital se conserva hasta esa fecha. No cancelar/recrear la suscripción durante un upgrade.

### Corte mensual, dirección y despacho

- Zona horaria única: `Europe/Madrid`.
- Origen de envíos: **Madrid, España**, siempre.
- El corte es el **día 15 inclusive hasta las 23:59:59, hora de España**. Alta o upgrade con pago confirmado hasta ese instante recibe el sobre del mes en curso; después del corte, el primero corresponde al mes siguiente.
- Para entrar en el lote, la suscripción debe estar activa y efectivamente pagada/vigente al corte. Un checkout iniciado o un pago pendiente no alcanza.
- El despacho se realiza el día 20 de cada mes. La dirección puede actualizarse desde Mi Cuenta hasta el corte; el cambio posterior afecta al siguiente envío.
- Crear un lote mensual con snapshot inmutable de elegibilidad y dirección. Cambios de perfil posteriores al corte no alteran las etiquetas ya preparadas; repetir una operación del lote no duplica destinatarias.
- Envíos gratuitos a todo el mundo, por correo ordinario, sin tracking. Plazos informativos desde el despacho: España 3–7 días; resto de Europa 1–2 semanas; Argentina y resto del mundo 3–6 semanas. Si no llega, se contempla reposición según las condiciones finales aprobadas.
- Administración registra manualmente la salida del lote. Solo al registrar el despacho se envía el email de aviso correspondiente.
- Retener dirección/snapshot postal durante **60 días** para coincidir con la ventana de reposición; reflejarlo de forma coherente en la política de privacidad.

### Numeración de socias fundadoras

- Las primeras 100 altas confirmadas de Mail Club reciben un número de fundadora único.
- Cuenta tanto el alta nueva como el primer upgrade digital→Mail Club. Se asigna una sola vez al confirmarse el primer pago de Mail Club.
- El número queda asociado para siempre a la persona: no se sobrescribe al cambiar de plan, volver a Mail Club o cancelar; tampoco se reutiliza.
- Pagos fallidos/pendientes no reservan número. La asignación debe ser transaccional e idempotente ante eventos concurrentes o webhooks repetidos.

### Dirección, aceptación y cuenta

En el alta nueva y el upgrade solicitar:

- Nombre de la destinataria.
- País ISO, provincia/estado, ciudad y código postal.
- Dirección y complemento (portal, piso y puerta).

La usuaria puede editar su dirección en el perfil. Exigir aceptación de condiciones Mail Club y guardar versión y fecha en altas y upgrades. La dirección y los consentimientos no deben exponerse en consultas generales del perfil ni en APIs públicas.

### Newsletter, idioma y contenido

- No habrá newsletter como producto gratuito ni como beneficio incluido en el plan digital o Mail Club. Eliminar el copy “NEWSLETTER INCLUIDO” y retirar formularios, altas, contenidos/automatizaciones y menciones públicas de newsletter.
- **Antes de retirarlo**, exportar la lista actual completa y verificar archivo y conteo; después se pueden borrar únicamente los contactos/registros del newsletter gratuito en Supabase y Sender. No borrar otros datos de suscripción ni emails transaccionales (bienvenida, pagos y despacho), que continúan.
- La página Mail Club, tarjeta de suscripción, preguntas frecuentes, condiciones, privacidad y emails necesarios salen en ES y EN desde el lanzamiento.
- El selector ES/EN del idioma de la carta física es una mejora posterior; no bloquea el lanzamiento.
- Las fotos del producto están pendientes de entrega. No cerrar la composición visual final sin recibirlas o acordar placeholders.

## 2. Auditoría del proyecto y consecuencias

| Área actual | Hallazgo | Trabajo que implica |
|---|---|---|
| Checkout y precios | `create-checkout.ts` recibe proveedor/moneda, no plan/país. `pricing.ts` y `stripe.ts` solo representan el producto digital. | Resolver plan/precio/proveedor del lado servidor; añadir configuración de precios Mail Club y mantener las actuales. No confiar en importe enviado por el navegador. |
| Suscripciones | La tabla `subscriptions` no distingue digital/Mail Club. Perfiles usan `role=subscriber` y acceso compartido. | Añadir tipo de plan con migración que deje las suscripciones existentes como digitales; conservar el gate de acceso existente. |
| Dirección y privacidad | No existe perfil postal ni gestión de dirección. Hay consultas generales a `profiles`. | Usar entidad/tabla postal dedicada, con RLS por usuaria y acceso administrativo controlado; evitar filtrar dirección por `select(*)`. |
| Pagos/webhooks | Provider abstrae alta/cancelación/portal. MP activa por webhook; Stripe vincula checkout. No existe pago único de upgrade. | Incorporar operaciones de upgrade persistidas, estado y referencias de pago; finalizar cambio solo con pago confirmado; conservar verificaciones de firma e idempotencia. |
| Períodos | El webhook Stripe y algunos flujos MP usan fallback de 30 días cuando falta una fecha. | Validar la fuente real de período pagado antes de calcular elegibilidad al corte; no basar envíos en un fallback no verificado. |
| Cancelación/cambio | API y RPC actuales cancelan inmediatamente. | Cambiar coordinadamente proveedor, datos, perfil y webhooks para aplicar cancelación/downgrade al final del período pagado. |
| Administración | CSV actual exporta suscriptoras digitales sin dirección ni lote postal. No hay exportación dedicada al newsletter. | Vista/operación de Mail Club y export mensual con todos los campos; export histórico de newsletter antes de retirarlo. Neutralizar fórmulas CSV/Excel en datos introducidos por usuarias. |
| Emails | `email.ts` tiene mensajes de bienvenida digitales y de edición; no hay bienvenida postal ni aviso de despacho. | Bienvenida de Mail Club en alta/upgrade con dirección y mes del primer sobre; aviso cuando admin marca el lote como enviado. Reintentos no deben duplicarlos. |
| Sitio e i18n | No existen `/mail-club` ni `/en/mail-club`. El sitio usa páginas EN físicas y componentes compartidos. | Crear página ES/EN, tarjeta y FAQ en Suscribirme, y mantener las rutas/links localizados. Administración sigue en ES. |
| Newsletter actual | Formularios en Inicio y Suscribirme; API, tabla, grupo Sender, dashboard y textos legales. | Exportar y contrastar antes; retirar formulario/API/automatización/afirmaciones de gratuidad; borrar solo los contactos gratuitos tras verificar el export y conservar intacta la operación paga. |

## 3. Modelo técnico recomendado

1. Añadir un `plan_type` (`digital` / `mail_club`) a suscripciones y migrar filas actuales a `digital`, sin alterar proveedor, moneda, fechas ni acceso.
2. Crear una tabla postal separada con nombre, país ISO, región, ciudad, código postal, dirección, complemento y timestamps; aplicar RLS y permisos admin mínimos.
3. Guardar aceptación de términos (versión y fecha) para alta y upgrade.
4. Guardar el número de fundadora y el primer ingreso a Mail Club de forma persistente, única, transaccional e idempotente.
5. Registrar los upgrades como operaciones durables (estado, importe/moneda, proveedor, referencia de cobro, resultado de cambio recurrente y errores recuperables). Actualizar el plan/tarifa recurrente solo tras aprobarse el diferencial.
6. Modelar lotes por período con snapshot inmutable de destinatarias/direcciones, export, estado de despacho y evento de notificación. Retener datos postales hasta 60 días después del último despacho aplicable.
7. Mantener los pagos/fallos en estados claros para que admin exporte activa, cancelada o pago fallido y el lote solo incluya cuentas pagas y vigentes al corte.
8. Implementar una operación segura para actualizar trimestralmente el precio ARS de las preaprobaciones Mail Club existentes sin recrearlas; registrar resultado por suscripción y respetar aviso de al menos 30 días. Empezar con modo dry-run y solo afectar Mail Club.
9. Actualizar `src/lib/database.types.ts` canónico junto con cada migración secuencial e idempotente.

## 4. Orden de implementación

1. **Cerrar cimientos:** reconciliar este documento con las notas preliminares; definir la lista ISO europea; diseñar migraciones, RLS, estados e idempotencia; dejar las suscripciones actuales como digitales.
2. **Altas Mail Club:** tarjeta/selector por zona y formulario postal + aceptación; validación de país en servidor; Stripe EUR/USD y Mercado Pago ARS; webhooks, acceso digital y email de bienvenida.
3. **Mi Cuenta y cambios:** dirección postal; upgrade explícito con pago diferencial; retorno a digital/cancelación para fin del período; manejo de pagos pendientes/fallidos y recuperación.
4. **Operación postal/admin:** numeración de fundadoras, corte Madrid, snapshots, lotes, CSV seguro, registro manual de despacho, aviso y retención de 60 días.
5. **Contenido y legal:** página Mail Club, textos ES/EN, tarjeta/FAQ, condiciones y privacidad. La publicación legal queda sujeta a revisión aprobada; las fotos dependen de entrega.
6. **Retirar newsletter gratuito:** export completo desde producción antes de la fecha de presentación, verificarlo, retirar formularios y nuevas altas, y borrar solo los contactos/registros del newsletter gratuito tras confirmar el backup/export.
7. **Validación y lanzamiento:** pruebas de lógica/webhooks primero; prueba de pago real en EUR, USD y ARS antes de habilitar públicamente; registrar resultados y conciliar/reembolsar según protocolo acordado.

## 5. Criterios de salida

- Una alta nueva Mail Club no puede forzar moneda/proveedor desde el navegador; el país postal validado determina EUR/Stripe, USD/Stripe o ARS/Mercado Pago.
- Suscriptoras digitales actuales siguen digitales hasta iniciar el upgrade; un upgrade conserva moneda/proveedor, cobra el diferencial exacto una sola vez y cambia la renovación solo al confirmarse.
- Upgrade rechazado/pendiente, checkout abandonado o webhook repetido no activa Mail Club, no duplica cobro/email y no asigna un segundo número fundador.
- Cancelación o regreso a digital mantienen el acceso ya pagado hasta fin de período y no cobran el siguiente precio de Mail Club.
- El lote mensual incluye a las suscriptoras elegibles en el corte Madrid del día 15; direcciones congeladas no cambian al editar el perfil después del corte.
- El CSV contiene destinataria, dirección, email, zona/moneda, fecha de alta Mail Club, estado, número de fundadora y los campos necesarios para etiquetas; texto controlado para que Excel no ejecute fórmulas.
- Repetir lote, webhooks, aviso de despacho o cambio de importe no duplica destinatarias, cargos, cambios ni emails.
- Export del newsletter gratuito verificado antes de retirar las altas; luego se eliminan solo esos contactos/registros, sin afectar a suscriptoras pagas.
- La versión ES/EN sale a la vez; términos y privacidad describen zona/precio, fecha de corte, envíos, retención de 60 días, reposiciones y aduanas con revisión legal aprobada.
- Se preserva el flujo digital vigente y el acceso a revista/archivo/PDF.

## 6. Verificaciones/dependencias previas a producción

- Stripe: verificar precios recurrentes Mail Club separados de los digitales y que la cuenta procese/liquide EUR y USD como se espera.
- Mercado Pago: verificar pago único del upgrade, fecha en que entra en vigor `auto_recurring.transaction_amount` y qué notificación recibe la suscriptora. El email propio no depende de un aviso de MP.
- Confirmar una fuente confiable de vigencia/período pagado para Stripe y MP; validar los fallbacks de período actuales antes de usarlos en el corte postal.
- Revisar la lista concreta de códigos ISO europeos, incluidas las excepciones ya acordadas (Reino Unido, Suiza, Noruega y microestados).
- Acordar/probar la actualización trimestral ARS y el aviso previo de 30 días.
- Revisar y aprobar legalmente condiciones y privacidad, especialmente desistimiento en UE y la regla de reposición.
- Recibir fotos o acordar placeholders; preparar y revisar la traducción EN de los textos de lanzamiento.
- La lista de emails real y los pagos reales se exportan/prueban desde entornos autorizados; no guardar emails, datos de tarjeta ni secretos en este archivo.

## 7. Decisiones recientes que reemplazan notas preliminares

Las decisiones más recientes del usuario resuelven estos puntos; también quedaron reflejadas en `docs/mail-club-base-funcional.md` y `docs/verificacion-flujos-de-pago.md`:

- Corte/envío: `Europe/Madrid`, no `America/Argentina/Buenos_Aires`.
- Newsletter: no existe como producto ni beneficio de plan. Exportar y verificar primero; después se permite borrar únicamente los contactos/registros del newsletter gratuito. Las notas preliminares ya se alinearon con esta decisión.
- Idioma: Mail Club ES y EN se lanza desde el principio.
- Estimación España: publicar 3–7 días (unificar el 2–7 días que aparecía en una sección del PDF). Mantener el resto de plazos acordados para Europa y el resto del mundo.
- Retención postal: 60 días para coincidir con el plazo de reposición.

## 8. Plan: 6 puntos del PDF (02-oct-2026)

Comparativo PDF vs. implementación. Estado: `pendiente` / `en progreso` / `hecho`.

### P1. Actualización trimestral ARS en MP (PDF §7) · Estado: en progreso
- Script `scripts/update-mp-mailclub-price.mjs`: dry-run por defecto, `--real` aplica.
  Afecta SOLO `subscriptions` `provider=mercadopago, plan_type=mail_club, status=active`;
  compara `transaction_amount` en MP y actualiza lo distinto vía
  `PreApproval.update({auto_recurring:{transaction_amount, currency_id:ARS}})`.
  Idempotente (salta si ya coincide), resultado por suscripción, nunca recrea preaprobaciones.
- Protocolo (aviso 30 días, ya comprometido en términos): 1) correr sin flags → lista
  emails afectados (`--list-emails` CSV); 2) avisar por email propio; 3) esperar ≥30 días;
  4) `node --env-file=.env scripts/update-mp-mailclub-price.mjs --amount <ARS> --real`.
- MP no acepta programar el cambio: el nuevo importe rige desde la próxima renovación.

### P2. ¿MP avisa a la suscriptora del cambio de monto? (pregunta PDF §2) · Estado: hecho (diseño)
- Verificado en código/SDK: `preApproval.update` solo dispara IPN al webhook propio;
  MP **no** notifica ni pide confirmación a la pagadora. Por eso el aviso previo corre por
  email propio (P1) y los términos ya lo exigen (30 días).
- Resta validar en el dashboard de MP el día del lanzamiento que el débito sale con el
  nuevo importe (ver PASOSPAGOS §9).

### P3. Privacidad menciona idioma de la carta (PDF §13 vs §6) · Estado: hecho
- El selector ES/EN de la carta es post-lanzamiento (§6), así que la mención en
  `PrivacyPage.astro` (ES/EN) se quitó hasta que exista el campo. Cuando se implemente el
  selector, restaurar la mención + columna en CSV/admin.

### P4. Formato tarjeta: PDF §8 pedía "al lado, mismo formato" · Estado: hecho (literal PDF)
- Dos tarjetas blancas iguales lado a lado (`md:grid-cols-2`, mismo padding/estructura) en
  `SubscribePage.astro`; Mail Club conserva solo la etiqueta Nuevo como diferenciador.
  Sin tocar lógica, ids, copy ni rutas. Verificado con `build` OK.

### P5. Plazo España 2–7 (§9) vs 3–7 (§10/§12) · Estado: hecho (código en 3–7)
- Inconsistencia interna del PDF; el código unifica en **3–7 días** (página, FAQ, términos
  ES/EN). Confirmar con la propietaria que vale 3–7.

### P6. Menores · Estado: hecho
- FAQ seguimiento con `universotriba@gmail.com` (ES/EN), igual que términos.
- CSV etiquetas: `csv.ts` neutraliza fórmulas + BOM para Excel; cubre "Excel o CSV" del
  PDF §5. Validar con la dueña que el CSV le sirve para imprimir etiquetas.

## 9. Secuencia de salida a producción (acordada 02-oct-2026)

Push a la rama ≠ deploy. `main` deploya a prod; `mail-club` solo genera Preview.
Mergear a `main` solo con estos pasos seguidos; después prod queda congelado hasta el
próximo push a `main` y se puede seguir trabajando en local/rama sin tocar prod.

1. Exportar newsletter desde prod (`scripts/export-newsletters.mjs`) y verificar
   archivo/conteo. Recién después se retiran altas y se borran gratuitos.
2. Aplicar migraciones `021–024` en Supabase prod (historial `017–020` ya reconciliado,
   `db push --dry-run` limpio). Sin esto el deploy rompe (500s). Ventana sin escrituras.
3. Verificar vars Production (Price IDs live ya cargados) + webhooks live Stripe/MP con
   eventos nuevos + `SITE_URL` + secretos.
4. Merge `mail-club` → `main` + deploy + prueba live mínima (alta + upgrade, conciliar o
   reembolsar) + regenerar token MP de prueba expuesto.
5. Recién después: retirar newsletter y borrar solo contactos gratuitos.
6. Post-merge: P5 (plazo 3–7) y CSV de etiquetas a confirmar con la dueña.

## 10. Auditoría pre-lanzamiento PDF vs código (02-oct-2026)

Comparativo exhaustivo ES+EN. Estado: `hecho` / `pendiente` (+ `dueña` si requiere su decisión).

### Hecho (verificado en código)

- Precios y diferencias exactas: Mail Club EUR 10,50 / USD 12,50 / ARS 16.000
  (`src/lib/mail-club.ts:23-27`); upgrade EUR 3,50 / USD 5,50 / ARS 9.000 (`:30-34`).
- Dos tarjetas en Suscribirme (digital secundaria + Mail Club héroe) y newsletter
  retirado del público (`POST /api/newsletter` en 410).
- Zona/moneda/proveedor derivados del país postal en servidor en el alta
  (`src/pages/api/create-checkout.ts:79-90`); AR→ARS/MP, Europa→EUR/Stripe, resto→USD/Stripe.
- Upgrade sin cancelar: cobra diferencia una vez, cambia recurrencia sin prorrateo
  (Stripe `proration_behavior:none`, MP 7.000→16.000) vía `src/lib/upgrade-apply.ts:48-74`.
- Downgrade a digital al fin del período (`src/pages/api/downgrade.ts`) + cancelación existente.
- Fecha de corte visible pre-pago (15/20) en tarjeta, upgrade, FAQs y página.
- Casilla de condiciones exigida en servidor (alta y upgrade; edición de dirección la omite).
- Dirección editable desde Mi Cuenta (`PUT /api/address`); fundadoras 1–100 inmutables.
- Términos: 10 puntos ES+EN (`src/components/TermsPage.astro:80-97,164-181`), con los dos
  mails del PDF (reposición `universotriba@`, desistimiento `comunidadtriba@`).
- Privacidad: dirección postal, finalidad limitada, retención 30 días + 60 días por envío.
- Mail de bienvenida con dirección + mes del primer sobre en alta y upgrade
  (`src/lib/mail-club-activation.ts`, `src/lib/email.ts:126-214`); aviso de despacho al registrar lote.
- CSV con BOM anti-fórmulas: 7 campos postales + email, zona/moneda, fecha de alta
  derivada, estado, nº fundadora (`src/lib/admin/mail-club.ts:186-252`).
- Página `/mail-club` + `/en/mail-club`: hero, cómo funciona (5 pasos), cierre, FAQ (9).
- Script de actualización trimestral ARS en MP (`scripts/update-mp-mailclub-price.mjs`, P1).
- Nav: link Mail Club entre Inicio y Revista (desktop/mobile, ES/EN) con ola letra por
  letra (`src/components/MailClubWaveLink.astro`); CTA home con efecto novedad
  (`variant="mailclub"` en `src/components/Button.astro` + `Home.astro`); cierre sobre
  `cartas.webp` a sangre con velo de contraste.

### Pendiente

- [x] **Bloque 2 integrado al hero.** `MailClubPage.astro` muestra la foto con 6 puntitos numerados
  + leyenda `box2Items` a la derecha (`box2Title` como encabezado); sin sección separada ni nota.
- [x] **Upgrade con control de zona.** `isUpgradeZoneCompatible()` en `mail-club.ts` + guard en
  `upgrade-checkout.ts` que devuelve `code: ZONE_MISMATCH` con `current/expected`; `MyAccountPage`
  muestra paso obligado (corregir dirección con foco en país, o cómo cambiar de zona vía baja +
  alta nueva) con textos ES/EN en `ui.ts`.
- [x] **Upgrade con tarjeta guardada (PDF §2).** `upgrade-checkout.ts` intenta primero el cobro
  off-session de la diferencia exacta (`upgrade-payment.ts`: medio por defecto, clave idempotente
  por upgrade). Sin tarjeta o con SCA → Checkout existente automático; rechazo → 402 inline con
  reintento explícito a Checkout (`force_checkout`). Webhook suma `payment_intent.succeeded` /
  `payment_failed` con confirmación compartida e idempotente. MP sin cambios. Resta matriz en
  Preview (OK sin SCA, 3DS→Checkout, rechazo→otra tarjeta, sin tarjeta→Checkout).
- [x] **Dirección 6 de 7 obligatorios.** Servidor (`mail-club-address.ts`) exige provincia y código
  postal; solo el complemento queda opcional. `required` en los 3 formularios (alta, upgrade,
  edición) + test. Direcciones viejas incompletas se completan en la próxima edición.
- [x] **Admin con direcciones en pantalla.** Botón Ver por lote + `GET .../batches/[id]/items`
  (`listMailClubBatchItems`): dirección congelada, email, zona/moneda, alta, estado y fundadora.
  `joined_at`/estado extraídos a helpers compartidos con el CSV (sin duplicar lógica).
- [x] **Mail con despedida.** `email.ts:126-201` cierra con `Gracias por sumarte a nuestro universo.
  Equipo Triba` (ES+EN); etiqueta literal del PDF `Lo vamos a mandar a esta dirección:`
  (`We'll send it to this address:` en EN) y `corregirla` / `correct it`.
- [x] **Micro-copy perfil.** `upgradeBody` sin `/mes` (`{full}` solo, ES+EN); `upgradeTitle` huérfano
  eliminado (la pantalla visible es `Sumate al Mail Club` / `Join the Mail Club`). FAQ restaurada al
  literal del PDF (`en “Pasarme al Mail Club”`, nombre del botón en el perfil según §11).
- [x] **SEO vivo.** Metas `subscribe.description` (ES+EN) y `home.description` (ES+EN) sin newsletter,
  con digital/Mail Club; eliminadas claves muertas `newsletterTitle/Lead/Body`, `freeNewsletter`,
  tarjeta `news*` de suscribirme y `newsletterPlaceholder` (cero usos verificados).
- [ ] **Pendientes dueña ya registrados:** España 3–7 (P5), CSV vs `.xlsx` para etiquetas (P6), fotos definitivas, aprobación legal, pagos reales EUR/USD/ARS, export lista newsletter y confirmación de que la invitación al downgrade debe permanecer oculta.
