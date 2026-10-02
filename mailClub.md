# Triba Mail Club — bases y plan de trabajo

**Estado (cierre del día):** implementación Mail Club completa en la rama y publicada para Preview; pendiente validación externa (pagos, correo, legal, fotos) y lanzamiento.  
**Última verificación local:** `astro check` 0 errores · `npm test` 15/15 · `npm run build` OK.  
**Rama de trabajo:** `mail-club` (`C:\Users\julia\Desktop\Proyectos web\triba-mail-club`), publicada en `origin/mail-club` (commit `da3d6d0`).  
**Preview Vercel (rama):** `https://triba-gqpgwguo2-julianrecarte.vercel.app` — producción (`www.universotriba.com`) intacta.  
**Regla:** `main` = sitio live; `mail-club` = trabajo aparte. Sin merge a `main` hasta el lanzamiento.  
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
- [x] Cancelación y vuelta a digital al fin del período (migración `023`): RPC diferida, `scheduleCancel`/schedules Stripe, baja de importe MP, webhooks que completan el downgrade y cierran la baja; reembolso admin sigue revocando en el acto.
- [x] Retiro del newsletter en la rama: Home sin sección ni botón gratis (segundo CTA lleva a Mail Club), legales sin oferta gratuita, `POST /api/newsletter` en 410, componentes muertos eliminados. Datos y export pendientes al lanzamiento: `scripts/export-newsletters.mjs` (solo lectura, CSV + conteos Supabase/Sender).
- [x] Estabilización (check + build en 0): elegibilidad de lote exige vencimiento conocido, gate corta acceso vencido, cancel admin frena recurrencia, reembolso revoca en el acto, upgrades con apply compartido + reintento admin, dirección editable en Mi Cuenta (`PUT /api/address`), moneda validada en upgrade MP.
- [x] Hardening 2 (migración `024` + tests): un pending por usuaria (409 si hay upgrade en curso), consentimientos sin reescritura, lote despachado inmutable, elegibilidad al corte (inicio ≤ corte ≤ fin), aviso separado del despacho físico, export newsletter en unión Supabase/Sender con protección del grupo pago, `csv.ts` puro y 15 tests vitest (`npm test`).
- [x] Publicación para Preview: commit `da3d6d0` pusheado a `origin/mail-club`. Vercel genera Preview aparte; `main` y producción intactos. Pendiente configurar en Vercel las variables del entorno **Preview** (claves de prueba, `SITE` con la URL `.vercel.app` del Preview y webhooks de prueba) antes de probar pagos.

### Pendiente (gates de lanzamiento)

- [x] Notas preliminares reconciliadas con la decisión de borrado (`docs/mail-club-base-funcional.md`).
- [x] Gate de configuración: `scripts/prelaunch-check.mjs` (bloquea sin claves/precios reales; probado: exit 1 sin `.env`).
- [x] Planilla de costeo: `docs/postal-costing.md` (completar con prototipo medido y cotización Correos).
- [ ] Exportar la lista del newsletter desde producción (`scripts/export-newsletters.mjs`) y verificar archivo/conteo antes de borrar contactos gratuitos.
- [ ] Cobros reales EUR/USD/ARS en sandbox y producción con webhooks, conciliados o reembolsados.
- [ ] Medir el sobre, confirmar tarifas/cobertura/trámites postales y margen por zona.
- [ ] Recibir las fotos definitivas (hoy lorem con seeds fijos) y aprobar los textos legales.

### Para mañana (en orden)

1. Configurar variables del entorno **Preview** en Vercel (claves de prueba + `SITE` del Preview + webhooks de prueba) y correr `prelaunch-check` contra ese entorno.
2. Probar en el Preview: alta y upgrade por moneda, rechazo/pendiente/SCA, webhooks repetidos, cancelación y downgrade al fin del período, lote + CSV + despacho.
3. Completar `docs/postal-costing.md` con el sobre medido y la cotización de Correos.
4. Exportar y verificar la lista del newsletter (sin borrar todavía).
5. Cobros reales EUR/USD/ARS, fotos definitivas y aprobación legal → go/no-go y merge a `main`.

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

- El upgrade conserva cuenta, proveedor, moneda y fecha de renovación actuales; no requiere cancelar ni crear una suscripción desde cero. La regla de zona por destino se aplica a las altas nuevas, no fuerza a una suscriptora existente a cambiar de moneda al actualizar su dirección.
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

### P4. Formato tarjeta: PDF §8 pedía "al lado, mismo formato" · Estado: pendiente (dueña)
- Implementado Mail Club héroe + digital secundario (decisión hallmark, tokens intactos).
  Confirmar con la propietaria que vale el layout héroe antes del lanzamiento.

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
6. Post-merge: P4/P5 (formato héroe, plazo 3–7) y CSV de etiquetas a confirmar con la dueña.
