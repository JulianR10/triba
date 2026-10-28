# ROADMAP — TRIBA

Próximas mejoras, trabajo en curso y registro de cambios grandes. Convenciones y reglas de código: [`AGENTS.md`](./AGENTS.md). Cómo correr, deployar y operar: [`README.md`](./README.md). No guardar claves, contraseñas, datos de suscriptoras ni tokens.

## En curso: reparaciones de la auditoría QA (27/10/2026)

Auditoría funcional completa por segmentos (pagos, cuenta, acceso/PDF, Mail Club, formularios, admin suscriptoras/ediciones/Mail Club, transversal, base y tests) y reparaciones en tandas. **Todo lo hecho está en el árbol de trabajo sin commit**; `npm run check`, `npm test` (105 tests) y `npm run build` pasan. Falta revisar el diff, commitear y desplegar.

**Antes de desplegar / al desplegar**
1. Aplicar en Supabase, en orden: `032_least_privilege_writes.sql` (cierra escrituras directas desde el navegador y el cambio de `profiles.email`) y `033_edition_notified_at.sql` (columna `editions.notified_at`). Sin la 033, "Notificar suscriptoras" responde un error claro (no envía nada).
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
- **Segundo checkout bloqueado** (`src/lib/duplicate-checkout.ts`): al activar una suscripción, si ya había otra paga vigente creada antes, la nueva se frena en el proveedor y queda `canceled`; el perfil sigue apuntando a la primera. Se aplica en `checkout.session.completed`, `invoice.paid` (Stripe) y `activateSubscription` (MP). Idempotente en reintentos. **El cobro extra no se reembolsa solo:** queda un `logger.error` "duplicate checkout blocked" y hay que reembolsar a mano. No cubre `reconcile.ts`.
- Mail Club al reabrir: solo Argentina, validado en servidor (`MAIL_CLUB_ENABLED_COUNTRIES`, alta y upgrade). Los textos ya lo decían. El formulario sigue listando más países hasta que se reabra.
- Panel Mail Club: cartel sobre reembolsos posteriores al corte (el lote queda congelado y decide la admin).
- Política de privacidad (ES/EN) declara Google Fonts; términos y privacidad en voseo y con tildes corregidas.

**Pendiente de la auditoría (retomar acá)**
- Decisión de la dueña: reactivar una cancelación programada (Stripe sí, MP no) y la salida para quien intenta suscribirse con baja programada; fecha de reapertura del Mail Club (hoy solo `MAIL_CLUB_PAUSED = true`, sin fecha); revisión legal final de los términos.
- Contraseña por admin no cierra sesiones abiertas (requiere una función SQL que revoque `auth.sessions`).
- Errores del servidor en español para usuarias EN (falta `code` + traducción en el cliente, cambio transversal).
- Páginas de edición sin imagen propia para compartir.
- Tests faltantes: `portal`, `upgrade-checkout`, `creators`, `feedback`, `api/pdf`, middleware, webhook de Mercado Pago.

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
