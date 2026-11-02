# ROADMAP — TRIBA

Próximas mejoras, trabajo en curso y registro de cambios grandes. Convenciones y reglas de código: [`AGENTS.md`](./AGENTS.md). Cómo correr, deployar y operar: [`README.md`](./README.md). No guardar claves, contraseñas, datos de suscriptoras ni tokens.

## Estado al 02/11/2026 (resumen)

**Hecho y en `main`** (último commit de código `af851cd`; `npm run check` 0 errores, `npm test` 222 tests, build OK al 02/11): todas las reparaciones de la auditoría QA, las decisiones de la dueña (sin pruebas gratis, solo Argentina al reabrir el Mail Club, bloqueo del segundo checkout, aviso de baja programada, Google Fonts en privacidad, voseo), la corrección de MP que pisaba el plan, el guard de duplicadas también en reconcile, el script de limpieza listo y los tests de `portal` y `upgrade-checkout`.

**Hecho el 02/11/2026 (renovaciones MP)**
- Incidente: ~37 suscriptoras MP quedaron con `active` y el período vencido aunque MP les cobró. Causa: `resolveAuthorizedPayment` solo buscaba entre las `incomplete`, así que el webhook de renovación era no-op. Arreglado (`/authorized_payments/{id}` resuelve el `preapproval_id`) y datos reparados con `scripts/resync-mp-periods.mjs` (dry-run por defecto; `--real` escribe).
- Red de seguridad: el cron diario (`renewExpiredMpSubscriptions`, `src/lib/reconcile.ts`) renueva las MP `active` vencidas con preapproval `authorized` y un cobro posterior al vencimiento, usando `applyMpRenewal` (compartida con el webhook). Si renueva alguna deja `logger.warn` y auditoría `subscriber.renewed`: es señal de que el webhook falló. Las canceladas/pausadas no se tocan.
- Stripe digital ya espera pago confirmado (`payment_status`) igual que Mail Club; `invoice.paid` confirma ambos planes.
- Tests nuevos: webhook de MP completo (`tests/mercadopago-webhook.test.ts`), renovación por cron, Stripe digital pendiente. Suite: 222 tests.
- Carrera del upgrade (P1) revisada y descartada: dos `applyUpgrade` concurrentes aplican el mismo precio (idempotente en Stripe y MP) y la bienvenida ya es at-most-once. Cerrarla del todo exigiría un estado nuevo y migración.
- Panel admin: una suscripción `active` con el período pasado se muestra "Vencida" (lista, ficha y CSV).
- Contraseña por admin cierra las sesiones abiertas de la usuaria (migración `034_revoke_user_sessions.sql`, **aplicada el 02/11**; sin ella la clave igual cambiaba y la respuesta avisaba). La admin que se cambia la propia clave conserva su sesión.
- Errores de la API en inglés: el middleware traduce el `error` de los endpoints públicos (`src/lib/error-i18n.ts`) según el `Referer` o la cookie `triba_locale`; `tests/error-i18n.test.ts` falla si un mensaje en español nuevo queda sin traducción.
- Imagen para compartir: cada edición (ES y EN) usa su portada como `og:image` (`EditionDetail.astro` → `Layout.astro`, tarjeta `summary` porque las portadas son de 225×300). Para un banner 1200×630 hay que subir portadas más grandes o generar una tarjeta por edición (dependencia nueva).
- Accesibilidad revisada: el skip link existe (`Layout.astro`), `FlipCover` gira con `:focus-within` y respeta `prefers-reduced-motion`, y no quedan `alert()` fuera del admin. Esos ítems estaban desactualizados.
- Tests nuevos de `creators`, `feedback`, `api/pdf` y middleware (acceso admin, verificación de identidad, gate de suscripción, idioma, cabeceras). Se comprobó que fallan si se rompe el control de acceso.
- `/api/pdf`: una URL externa en `pdf_url` ya pasa por el control de acceso (antes se redirigía sin revisar la suscripción).
- Sesión una sola vez por request: `Navbar`, `MagazinePage` y `MyAccountPage` usan `Astro.locals` del middleware (antes cada uno creaba su cliente y releía la sesión, con riesgo de renovaciones de token duplicadas). **Falta probarlo con una sesión iniciada en el navegador** (menú, `/revista`, `/mi-cuenta`); si algo falla: `git revert 536299d`.
- `planFromPreapproval`: el `reason` de MP se escribe y se lee en un solo lugar (`preapprovalReason` / `planFromPreapproval`, `mercadopago-status.ts`) con test de ida y vuelta. Revisadas las 71 suscripciones MP: 70 coinciden; la única distinta (`cf7265c0`) es un upgrade posterior, que el código ya conserva.
- **Acceso sin depender del puntero del perfil (02/11):** una auditoría contra MP y Stripe encontró 3 personas que pagaban y figuraban mal (una con rol `free` y sin puntero, fila `1900a238`; dos con el puntero en una fila vencida mientras tenían otra viva, filas `f26a5786` y `8fd95d15`). Se repararon (solo `profiles`, sin tocar proveedores). Para que no vuelva: el middleware y el cambio de plan (`getActiveSubscriptionForUser`) usan cualquier suscripción vigente de la persona (`pickLiveSubscription`, `subscription-guard.ts`), y el cron diario reenlaza perfiles con puntero vencido o ausente (`healProfileSubscriptions`, `reconcile.ts`; auditoría `subscriber.profile_relinked`). Resultado: 93 personas con pago vigente, 0 con puntero o rol mal.
- **Cobros dobles nuevos (decide la dueña, se suman a las duplicadas):** Las dos personas de las filas MP `f26a5786` y `8fd95d15` tienen dos preaprobaciones cada una, del 10/08 (una cancelada o pausada hoy). Reembolsos aparte.
- Precio viejo de Stripe: las suscripciones Stripe `cdb0a656`, `beb05d6f` y `1900a238` pagan 10,50 € por "Suscripción Triba Digital" (precio de agosto; el digital actual es 7 €). No es un error de plan: es una decisión comercial si se las migra al precio vigente.
- Upgrades fallidos revisados: 2 tarjetas rechazadas (ambas personas quedaron en Mail Club) y 9 de una sola persona (ya en duplicadas). Sin problema general de cambio de plan.
- **03/11 es la primera prueba real del downgrade Mail Club → Digital** (suscripción `9a9b10ca`, Stripe): después del cobro verificar `plan_type = digital` y `scheduled_plan_type` vacío. El código (`customer.subscription.updated`) lo maneja pero nunca se vio con un evento real.
- **Región de las funciones:** `vercel.json` fija `dub1` (la base está en eu-west-1). El pedido de `/api/pdf` pasó de ~1,5 s a ~0,4 s.
- **FTP borrado:** se eliminó `.github/workflows/deploy.yml` (subía el repo por FTP a un servidor externo en cada push) y `scripts/deploy-ftp.mjs`. Los scripts de migraciones ya ejecutadas pasaron a `scripts/archive/`.
- **Límite de uso en una consulta:** `035_rate_limit_hit.sql` (**aplicada el 02/11**) junta el conteo y el registro en una sola llamada a la base (`rate_limit_hit`). Si la función no existe, el código usa las dos consultas de siempre y la vuelve a probar cada 5 minutos. El pedido de `/api/pdf` bajó a ~0,3 s.
- **Cron activo desde el 02/11:** `CRON_SECRET` no existía en Vercel Production, así que `/api/cron/reconcile` respondía 500 y **el cron diario nunca corrió** antes de esa fecha (ni la reconciliación, ni los recordatorios del Mail Club, ni los respaldos de arriba). Se cargó como variable sensible y se redesplegó: sin autorización da 401; la primera ejecución con el secreto dio 200, sin pendientes, y limpió 1.199 filas de `rate_limits`. Corre a las 07:00 UTC.
- Quick wins del ROADMAP que ya estaban hechos: sitemap con las ediciones reales (`sitemap.xml.ts`), JSON-LD con `set:html`, `llms.txt`, sin `picsum` en la CSP, etiqueta "Language" solo en el diccionario EN. Queda el peso muerto del newsletter (`sender.ts`, `resync-newsletters`): no tocar hasta exportar el histórico.
- **Primera prueba real de la renovación MP por webhook:** la suscripción `e36cca10` se cobra el 02/11 a las 23:45 UTC (20:45 en Argentina; MP informa el horario con `-04:00`). Los pedidos al webhook del 02/11 (00:12 y 14:18 UTC) aún cayeron en el error viejo (`no-op`): ninguna renovación había pasado por el arreglo. Verificar después del cobro que `current_period_end` avanzó a ~02/12; si no avanzó, el cron la recupera a las 07:00 UTC y queda la señal en el log. Luego `node --env-file=.env scripts/resync-mp-periods.mjs` debe dar 0 pendientes.
- Smoke test de producción (`scripts/smoke-prod.mjs`): 9/11; fallan "Home: popup no apareció" y "Home: no hay botón de cierre". Sin investigar; no afecta suscripciones.

**Pendiente: decide la dueña / hay que hacerlo a mano**
1. Migraciones: `033`, `034` y `035` **aplicadas el 02/11** (verificadas: existen y el rol anónimo no puede ejecutar las funciones). Falta solo la `032_least_privilege_writes.sql`, **pospuesta y opcional**: es una mejora de seguridad (cierra escrituras directas con la clave pública sobre formularios y registros del Mail Club, y el cambio de `profiles.email`); el sitio no la necesita para funcionar ni para ir rápido. Revisado en código: no rompe ninguna pantalla (todo pasa por `supabaseAdmin`). Si se aplica, verificar con la clave pública que `feedback`, `creator_applications` y `mail_club_upgrades` no aceptan escrituras, e incluir antes el bypass del punto siguiente.
2. Alta de clientas migradas (posible falla desde la 030, ver abajo): hay 84 emails en `subscriber_migrations` sin cuenta y ninguna se registró desde el 14/10, así que no se pudo confirmar. Prueba propuesta: agregar a esa tabla un alias del email del titular (`+migtest`), registrarse con él y comprobar rol `subscriber` y suscripción `migrated`; si falla, aplicar el bypass `pg_trigger_depth() > 1` en `block_privileged_profile_columns`. No requiere la 032.
3. **Pospuesto por decisión del 02/11** (se actúa si alguien reclama): limpiar las 7 duplicadas (decidir también Karen: `--keep=`; necesita OK de la dueña). Cobros dobles: 02/11 abrilsollosqui, 03/11 segsierra, 10/11 pedrosubils21. Reembolsos de lo cobrado de más: decisión aparte.
4. Vercel: ya verificado el 02/11 que `VERIFY_MP_SIGNATURES` no está definida (la firma se valida) y que `CRON_SECRET` existe (`GET /api/cron/reconcile` sin autorización da 401). Falta: en Mercado Pago (Webhooks) confirmar que está suscripto el tópico `subscription_authorized_payment`. Los logs de Vercel (`vercel logs --query webhook/mercadopago`) muestran que los avisos llegan.
5. Fecha de reapertura del Mail Club (1/12 estimado): cambiar `MAIL_CLUB_PAUSED` a mano cuando se confirme.
6. Validar en producción con cuentas reales: altas EUR/USD/ARS, upgrade/downgrade en MP sin que `plan_type` se revierta, segundo checkout bloqueado, cancelar/portal, panel Mail Club, visor PDF, `/en/triba-creators`.

**Pendiente: trabajo de código (sin orden de prioridad fijo)**
- Botón "Reactivar" una baja programada (solo Stripe) y revisión legal de términos: esperan decisión de la dueña.
- Rendimiento (medir antes: caché del HTML público, archivo propio para Mi Cuenta) y deuda menor: ver "Próximas mejoras". El invariante de `profiles.subscription_id` conviene resolverlo junto con la limpieza de duplicadas.

## En curso: reparaciones de la auditoría QA (27/10/2026)

Auditoría funcional completa por segmentos (pagos, cuenta, acceso/PDF, Mail Club, formularios, admin suscriptoras/ediciones/Mail Club, transversal, base y tests) y reparaciones en tandas. **Todo está commiteado y pusheado a `main`**; las migraciones 033, 034 y 035 ya están aplicadas (02/11); la 032 queda pospuesta y opcional (ver arriba). Falta validar en producción.

**Antes de desplegar / al desplegar**
1. Migraciones: `033_edition_notified_at.sql` (columna `editions.notified_at`) ya está aplicada, así que "Notificar suscriptoras" funciona. La `032_least_privilege_writes.sql` (cierra escrituras directas desde el navegador y el cambio de `profiles.email`) sigue pospuesta y es opcional.
2. Las migraciones 030 y 031 figuran como aplicadas el 14/10 (ver abajo): conviene confirmar igual con la clave pública que `subscriptions` no se puede actualizar y que `edition_languages` no se lee.
3. Probar en un navegador lo que solo se leyó en código: panel Mail Club (botón Simular y alerta "Activas sin dirección"), visor de PDF sin sesión / sin suscripción, cancelar y gestionar desde el menú, postulación en `/en/triba-creators`.
4. Contacto único de soporte: `src/lib/contact.ts` (`comunidadtriba@gmail.com`). Cambiar ahí si se prefiere otro; los textos legales y las FAQ lo tienen escrito a mano.

**Hecho en esta tanda**
- **Pagos:** los webhooks de Stripe y Mercado Pago ya no responden 200 si no pudieron guardar la suscripción o el perfil (ahora 500 y el proveedor reintenta); estado de Stripe pasa por `mapStripeSubscriptionStatus`; renovación de MP usa `next_payment_date` en vez de +30 días; reconciliación de Stripe usa `periodRange`; una admin que paga, se cancela o se reembolsa conserva su rol (`roleAfterPayment`); el checkout de Mail Club exige "un solo cobro vigente" igual que el digital; errores de checkout sin textos técnicos; "Procesando" ya no queda en un spinner infinito.
- **Cuenta:** el portal usa el cliente de servidor (antes casi seguro fallaba por permisos); el upgrade con tarjeta guardada nunca muestra error ni marca `failed` si el cobro salió; `applyUpgrade` aplica el plan primero y el fallo del mail ya no lo revierte; etiquetas de estado (cancelada, vencida, pago en proceso); el menú muestra "cancelación programada hasta …"; cancelar/gestionar sin `alert()`, traducido y con la fecha en la confirmación.
- **Reembolso admin:** si el proveedor falla no se toca nada en Triba (502); corta todas las filas con cobro vigente; la confirmación muestra importe y fecha reales (`GET …/refund`); textos corregidos del botón Cancelar.
- **Acceso:** el visor distingue "iniciá sesión" / "suscribite" / "venció" / error de carga; el plazo cuenta desde que empieza a cargar; `/api/pdf` responde 401/403 a pedidos de datos y sigue redirigiendo en navegación; Mi Cuenta sin sesión redirige al login; errores de login/alta/recuperación traducidos por código; el middleware verifica la identidad contra Supabase Auth en rutas admin, PDF y Mi Cuenta.
- **Mail Club / admin:** panel Mail Club repara el código mal ubicado (Simular y alertas); aviso de despacho con reclamo por destinataria (sin doble envío); dirección validada (sin saltos de línea, código postal ES/AR y regla amplia para el resto).
- **Ediciones:** los PDF suben con nombre único (ya no se pisa el vigente) y los archivos reemplazados o de una edición borrada se limpian de Storage tras guardar; al crear, la destacada anterior solo se reemplaza cuando la nueva quedó completa; aviso a suscriptoras con reclamo atómico (`notified_at`), conteo de destinatarias y confirmación distinta para reenviar; errores sin mensajes de base de datos.
- **Mails:** nombre, dirección, título y descripción se escapan (`escapeHtmlText`); CSV de suscriptoras neutraliza fórmulas y los filtros Digital/Mail Club exportan lo correcto.
- **Formularios:** las postulaciones de Creators en inglés ya se guardan (`CREATOR_AREAS`); mensajes de éxito/error legibles y traducidos.
- **Base:** limpieza diaria de `rate_limits` desde el cron.
- **Textos:** footer con enlace de contacto, mails de contacto unificados, "Escribinos" sin destino reemplazados.

**Hecho en la segunda tanda (28/10/2026)**
- **Mail Club admin:** el despacho exige que el corte haya pasado (409); fechas del panel en hora de Madrid; la tabla marca "N sin avisar" en lotes despachados parcialmente.
- **Notificar edición:** solo a quien hoy tiene acceso (misma regla que el gate), paginado de 1000 en 1000 y envío en lotes de 5 en paralelo.
- **Lista de espera:** éxito en color neutro y mensaje propio para 429 (ES/EN).
- **Admin:** auditoría con `await` en todas las acciones, `data-email` escapado, rate limit + auditoría en exportes y vista previa.
- **SEO:** `noindex` en login, Mi Cuenta y 404 (sin canonical propio); `robots.txt` cubre las rutas EN.
- **Locale:** URLs de retorno de checkout, upgrade y portal según el idioma de la usuaria; el retorno de MP usa la cookie; el 404 respeta la cookie.
- **Tests y limpieza:** `locale-paths` y `mail-club-dispatch` (112 tests); `@astrojs/sitemap` removido, `pdf-poppler` a devDependencies, `engines.node >=22`; hints de código sin uso resueltos.

**Hecho tras las decisiones de la dueña (28/10/2026)**
- Sin períodos de prueba: `trialing` ya no cuenta como suscripción vigente (`subscription-guard.ts`).
- **Segundo checkout bloqueado** (`src/lib/duplicate-checkout.ts`): al activar una suscripción, si ya había otra paga vigente creada antes, la nueva se frena en el proveedor y queda `canceled`; el perfil sigue apuntando a la primera. Se aplica en `checkout.session.completed`, `invoice.paid` (Stripe) y `activateSubscription` (MP). Idempotente en reintentos. **El cobro extra no se reembolsa solo:** queda un `logger.error` "duplicate checkout blocked" y hay que reembolsar a mano. También lo aplica `reconcile.ts` (ver abajo).
- **Baja programada y nuevo checkout:** quien intenta suscribirse con la baja ya programada recibe 409 `cancellation_scheduled` con la fecha desde la que puede volver (`getLivePaidSubscription`, `subscription-guard.ts`). Si tiene otra suscripción sin baja, sigue el mensaje de gestionar.
- **Reconciliación (Stripe) también bloquea el segundo cobro:** `activateStripeCandidate` pasaba `incomplete` → `active` y repuntaba el perfil sin mirar si ya había otra paga; ahora usa el mismo `blockIfDuplicateCheckout` que el webhook.
- **Webhook de Mercado Pago, revisado sin cambios:** la firma está activa por defecto (solo se apaga con `VERIFY_MP_SIGNATURES=false`; **confirmar que esa variable no existe en Vercel**). El barrido de hasta 50 filas `incomplete` y la paginación de `listUsers` solo corren con un evento firmado, así que es costo operativo, no hueco de seguridad; queda como mejora de rendimiento.
- **MP: los eventos repetidos ya no pisan el plan ni cancelan duplicadas.** `activateSubscription` corre en cada evento `preapproval` autorizado; antes reescribía `plan_type` desde el `reason` (que no cambia con un upgrade/downgrade, solo el monto) y revisaba duplicadas siempre. Ahora una fila activa conserva su plan y el bloqueo corre solo en la primera activación. Sin esto, las 7 duplicadas existentes habrían perdido una suscripción MP sin pasar por el protocolo de limpieza. Pendiente probarlo con una cuenta MP real.
- Mail Club al reabrir: solo Argentina, validado en servidor (`MAIL_CLUB_ENABLED_COUNTRIES`, alta y upgrade). Los textos ya lo decían. El formulario sigue listando más países hasta que se reabra.
- Panel Mail Club: cartel sobre reembolsos posteriores al corte (el lote queda congelado y decide la admin).
- Política de privacidad (ES/EN) declara Google Fonts; términos y privacidad en voseo y con tildes corregidas.

**Pendiente de la auditoría (retomar acá)**
- Decisión de la dueña: botón "Reactivar" una cancelación programada (Stripe sí, MP no; hoy se muestra solo la fecha desde la que puede volver a suscribirse); fecha de reapertura del Mail Club (hoy solo `MAIL_CLUB_PAUSED = true`, sin fecha); revisión legal final de los términos.
- **Posible falla desde la 030 (sin verificar):** `handle_new_user()` (migración 012) actualiza `profiles.subscription_id` al registrarse alguien con registro en `subscriber_migrations`. Ese UPDATE pasa por el trigger de la 030 (`block_privileged_profile_columns`), que exige `auth.jwt() ->> 'role' = 'service_role'`; en un alta GoTrue no trae ese claim, así que el registro de esas personas podría fallar con "Database error saving new user". Probar un alta con un email de `subscriber_migrations` y, si falla, permitir el caso con `pg_trigger_depth() > 1` en esa función (la 032 la redefine: si se aplica, incluir el bypass en ella). Dato del 02/11: 84 de los 97 emails migrados siguen sin cuenta y ninguno se registró desde el 14/10, por lo que no hay evidencia a favor ni en contra; no hay usuarios de Auth sin perfil (altas rotas a mitad).
- Tests que siguen sin existir: ninguno de los listados en la auditoría. (Cubiertos: `creators`, `feedback`, `api/pdf`, middleware, webhook de Mercado Pago, `portal`, `upgrade-checkout` con los bloqueos, cobro hecho => pending y tarjeta rechazada => 402.)

## En curso: limpiar suscripciones duplicadas (27/10/2026)

Siete personas tenían más de una suscripción paga viva y se les cobró de más (todos los cobros verificados contra Stripe y Mercado Pago: capturados, sin reembolsos ni disputas). El checkout ya se bloqueó; falta cancelar las sobrantes.

| Persona | Cobro doble | Cobrado de más | Queda |
|---|---|---|---|
| pedrosubils21 | ago, sep, oct (ambas el día 10) | 21.000 ARS | MP vinculada al perfil (`132f5d36…`) |
| karenortegajimenez616 | sep, oct | 14 EUR (si sobra la de 7) | **A confirmar**: por fecha real, la de 10,50 EUR (creada en Stripe el 04/08) |
| segsierra | oct (7 cobros en el mes) | 6 cobros de 7 (5 USD + 1 EUR) | Stripe del 03/09 |
| abrilsollosqui, francescapescegrecco, agus2014ahumada, indirafidani | oct | 7.000 ARS cada una | la más antigua de cada una |

Próximos cobros dobles: 02/11 (abrilsollosqui), 03/11 (segsierra), 10/11 (pedrosubils21) y siguientes.

Pasos con `scripts/dedupe-subscriptions.mjs` (dry-run por defecto; `--backup=` guarda el estado; `--real` **exige** `--email=` para cancelar de a una persona; `--keep=<id del proveedor>` fuerza cuál queda):
1. ~~Corregir el script para ordenar por la fecha de alta en el proveedor~~ **Hecho (28/10):** ordena por Stripe `created` / MP `date_created`, muestra monto y plan, y avisa si el perfil apunta a otra fila. El dry-run del 28/10 detectó las 7 personas de la tabla (segsierra con 6 sobrantes).
2. Dry-run, respaldo y OK de la dueña. **Pendiente de su decisión:** Karen. El script propone dejar la de 10,50 EUR (alta 04/08) y cancelar la de 7 EUR (22/09); si ella decide lo contrario, usar `--keep=`.
3. Stripe: `subscriptions.cancel(id, { invoice_now:false, prorate:false })`; los avisos a clientas están apagados en Stripe, no genera mail.
4. Mercado Pago: cancelar **una sola persona primero**; la documentación de MP dice que notifica por email al cancelar (no aclara a quién). Es irreversible.
5. Base: duplicadas a `canceled` y `profiles.subscription_id` apuntando a la que queda (si apuntara a una cancelada de MP, la persona perdería acceso al vencer).
6. Verificar: ninguna usuaria con más de una viva, rol `subscriber` y gate activo.

Fuera de alcance: reembolsos de lo ya cobrado de más (se decide aparte).

## Próximas mejoras

Resumen de la auditoría de octubre; ítems marcados *(verificar)* no se revisaron tras los fixes de hoy.

**P1 — riesgo concreto**
- ~~Digital se activa con cualquier `status` de Stripe~~ **Hecho (02/11):** espera pago confirmado; la bienvenida sale una sola vez por la transición atómica de `invoice.paid`.
- Webhook de Mercado Pago: un evento sin match barre hasta 50 `incomplete` y pagina `listUsers` (hasta 12.000); la firma se apaga con `VERIFY_MP_SIGNATURES=false`.
- Carrera en el upgrade: revisada el 02/11, riesgo bajo (el cambio de tarifa es idempotente); sin código.
- Rendimiento: SSR sin caché en páginas públicas y la sesión se resuelve varias veces por request (middleware, Navbar, Mi Cuenta, `/api/pdf`); Mi Cuenta es un archivo de ~1.100 líneas dentro del layout público.
- Emails en logs sin regla de retención. *(verificar)*
- Tests que no cubren el dinero: agregar casos de upgrade/webhooks y de Mercado Pago.

**P2 — deuda**
- ~~`planFromPreapproval` decide por texto~~ **Hecho (02/11):** el texto vive en un solo helper con test; sigue siendo el `reason` la única señal del plan en MP.
- El cron de reconcile mira `incomplete` (y ahora renueva MP vencidas): un pago de Stripe digital sin fila local no lo ve nadie.
- Puntero `profiles.subscription_id` sin invariante en la base (origen de ambigüedad con duplicadas).
- Tipos desfasados, N+1 en lotes y dashboard, purga que borra morosos, CSV y despacho sin auditoría, uploads autodeclarados.
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
- ~~Confirmar `CRON_SECRET` en Vercel Production y el 401 del cron~~ **Hecho el 02/11** (no existía; se cargó y se verificó).
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
