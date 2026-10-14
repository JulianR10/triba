# Análisis de mejoras — TRIBA

Auditoría de solo lectura. No se toca código hasta pedir un fix.

## Estado de fixes (se actualiza al aplicar)

- `030_p0_rls_hardening.sql` (pendiente de aplicar vía SQL Editor, junto a `027–029`): cierra P0 datos a nivel DB — trigger anti `role`/`subscription_id` en `profiles`, fuera UPDATE directo en `subscriptions`, `cancel_subscription` solo dueño o `service_role`, fuera policies `using(true)` en `admin_audit_log`/`rate_limits`, grants mínimos + vista `public_edition_catalog` sin `pdf_url`.
- Código ya migrado: `src/lib/editions.ts` lee la vista (sin `pdf_url`, con `hasPdf`); `EditionDetail`/`Magazine`/`MiCuenta` usan `/api/pdf/{versionId}`. Verificado: `npm test` 73/73, `npm run check` 0 errores, `npm run build` ok.
- Falta Fase 1b para cierre total del PDF: revocar `select` base a `anon` (`031`) + bucket de PDFs a privado. El REST directo a `edition_languages` aún expone `pdf_url` y el bucket sigue público.
- `031_pdf_private_bucket.sql` lista (revoke base + crea bucket privado). Código listo: refs `storage://`, firma por bucket, backfill `scripts/migrate-pdfs-to-private.mjs`, huérfanos multi-bucket. Orden: deploy código → aplicar `031` → backfill `--real` → verificar lector → `--real --delete-old`.

## Alcance

- Repo y producción (`universotriba.com`), solo lectura.
- Orden: riesgo primero.
- Método: paso a paso. Cada parte cierra con qué está bien, hallazgos con archivo:línea o URL, severidad, y qué no se pudo ver (dashboards de Stripe, Mercado Pago y Supabase).

## Severidad

| Nivel | Significado |
|---|---|
| P0 | Dinero o datos en riesgo |
| P1 | Riesgo concreto |
| P2 | Deuda |
| P3 | Nit |

## Partes

1. **Arquitectura.** Hecha. Hallazgos abajo.
2. **Datos.** Hecha. Hallazgos abajo.
3. **Dinero.** Hecha. Hallazgos abajo.
4. **Seguridad y privacidad.** Hecha. Hallazgos abajo.
5. **Mail Club.** Hecha. Hallazgos abajo.
6. **Producto público.** Hecha. Hallazgos abajo.
7. **Crecimiento.** Hecha. Hallazgos abajo.
8. **Higiene.** Hecha. Hallazgos abajo.
9. **Síntesis.** Hecha. Backlog abajo.

## Dimensiones transversales

Entran en la parte que corresponda, no como capítulos sueltos:

- Accesibilidad (contraste, teclado, foco, lectores de pantalla, `prefers-reduced-motion`)
- Performance (LCP, INP, CLS, visor PDF, fuentes, imágenes, costo del SSR)
- Privacidad y cumplimiento (direcciones postales, Ley 25.326, retención, borrado, consentimiento, PII en logs)
- Medición (funnel: visita, checkout, pago, activación, cancelación)
- Deliverability (SPF, DKIM, DMARC, Sender, 429)
- Observabilidad y operación (logs, alertas de cron/webhooks, backups, runbook)
- Idempotencia y carreras (doble webhook, doble checkout, welcome duplicado)
- i18n real (rutas `/en`, hreflang, copy faltante, emails por `preferred_locale`)
- Estados de fallo (vacío, loading, pago pending, PDF expirado, MP sin portal)
- Supply chain, tests y CI
- Costos (egress de PDFs, storage, SSR on-demand, Sender)
- Datos en el repo (CSV, PDFs, `.env`): contrastar con git, no asumir

## 1. Arquitectura

Lente: velocidad y paneles que se sientan propios. La arquitectura está bien partida. Lo que frena no es el diseño: es el presupuesto de cada request.

### Qué está bien

- Rutas finas. `src/pages/index.astro` solo monta `<Home lang="es" />`. Las de `/en` hacen lo mismo.
- Lógica en `src/lib`, admin en `src/lib/admin`, invariantes duras en SQL (`cancel_subscription`, dedup).
- Gate único: `isActiveSubscription` en `src/lib/subscription-status.ts`.
- El admin ya es un shell propio (`AdminLayout.astro`), no la web de marketing.
- React solo en el visor PDF. No se toca.

### Hallazgos

**P1. Cada click es un SSR frío, sin caché.** `astro.config.mjs:34` fija `output: "server"`. No hay `Cache-Control` en HTML. Home, revista, términos y Mail Club se renderizan como si cambiaran por request. El catálogo cambia una vez por mes. Una anónima en `/` paga función de Vercel + `getSession` + dos queries de ediciones (`src/lib/editions.ts:97`). Con sesión, el middleware suma otras dos, en serie y con `select *` (`src/middleware.ts:66-80`).

**P1. La sesión se resuelve tres veces.** El middleware llama `getSession`. `Navbar.astro:16` crea otro cliente y lo vuelve a llamar. `MyAccountPage.astro:23` y `MagazinePage.astro:19` también. `/api/pdf` lo repite en `src/pages/api/pdf/[editionId].ts:84` aunque `locals` ya tiene el usuario. Las APIs ignoran esa cookie y piden `Bearer` + `getUser` (`src/lib/auth.ts:5`). El middleware arma el cliente sin `responseHeaders` (`src/middleware.ts:52`), así que el refresh de cookie del server no se escribe. El panel depende de un segundo login en cada botón.

**P1. Mi cuenta no es un panel.** El admin sí: shell, nav, sin chrome de marketing. La suscriptora entra a un archivo de 1093 líneas metido en el `Layout` público, con navbar, footer, fuentes de Google y scripts de reveal. No hay navegación de cliente. Cada sección es un documento nuevo con todo ese costo.

**P2. El catálogo usa el cliente de browser en el server.** `editions.ts:1` importa `createBrowserClient` y se llama desde el frontmatter. Si falla, `getEditions` devuelve `[]` sin mirar el error. Home puede quedar sin revistas y nadie se entera.

**P2. El estado de la suscripción no tiene un solo módulo.** `PaymentProvider` cubre checkout, cancelar, portal y downgrade. Activar está partido: `activateSubscription` es de Mercado Pago. Stripe tiene su propio webhook (364 líneas) y otro camino en `reconcile.ts`. Una regla nueva hay que pegarla en cuatro archivos. Se verifica en la parte 3.

**P2. El dashboard admin son 12 counts por vista** (`src/lib/admin/index.ts:45`), dos de un newsletter ya retirado. Aguanta hoy. No va a sentirse instantáneo cuando crezca, y no hay una vista SQL.

### No visto

Región de Vercel contra la de Supabase, ni el TTFB real. Entra en performance, parte 6.

### Dirección

No hace falta un SPA. Tres cortes:

1. Páginas públicas anónimas cacheadas en el CDN, invalidadas al publicar una edición.
2. La sesión se lee una vez, en el middleware. Páginas y PDF usan solo `locals`.
3. Mi cuenta gana un shell como el admin, sin el chrome de marketing.

El estado de pago se unifica en la parte 3, no ahora.

## 2. Datos

El esquema está bien cuidado. El agujero es que la base deja escribir las columnas de las que el servidor se fía.

### Qué está bien

- Migraciones secuenciales e idempotentes.
- Unicidad donde importa: un pago por proveedor (`001_init.sql:13`), una edición destacada (`005_admin_support.sql:19`), un idioma por ejemplar (`018_editions_bilingual.sql:24`), un upgrade pendiente por usuaria (`024_mail_club_recovery_notices.sql:9`).
- Fundadoras y consentimientos inmutables (`022`, `024`).
- Lotes y snapshots no se otorgan a `authenticated`.
- `cancel_subscription` ya no corta el acceso al momento (`025_recovery_cancel_snapshot.sql:27`).

### Hallazgos

**P0. Una usuaria puede cambiar su propio rol y su propia suscripción.** `001_init.sql:47` permite `UPDATE` del perfil propio, sin limitar columnas. `role` y `subscription_id` entran. `004_cancel_subscription.sql:6` permite `UPDATE` de la suscripción propia, sin `WITH CHECK`. `status`, `current_period_end` y `plan_type` entran. No hay trigger que lo impida. El middleware lee esas filas con service role y las cree (`src/middleware.ts:66`). El cliente de la usuaria ya lee esas tablas (`src/components/MagazinePage.astro:31`). En un proyecto Supabase estándar, `authenticated` tiene `GRANT`. No se vieron los grants en vivo: si `UPDATE` está concedido, cualquiera se hace admin o se activa la revista. Una query de grants en el dashboard lo confirma.

**P1. El PDF está en una tabla pública, con URL pública.** `edition_languages` se lee con `using (true)` (`018_editions_bilingual.sql:53`) y el `GRANT` es para `anon`. La URL guardada es `/storage/v1/object/public/editions/...` (`src/lib/storage.ts:4`). Portada y PDF comparten bucket. El path es predecible: `pdfs/revista-{n}-{lang}.pdf`. Si las portadas cargan sin firma, el muro de `/api/pdf` no existe. Se confirma con un GET en la parte 4. Si responde 200, esto sube a P0.

**P1. Dos políticas dicen "solo service role" y en realidad dicen "cualquiera".** `admin_audit_log` y `rate_limits` usan `using (true)` (`009_fix_audit_log_rls.sql:10`, `007_rate_limits.sql:33`). El service role ni mira RLS. Esas políticas abren la tabla a todo rol que tenga `GRANT`. El log puede llevar emails y detalles de reembolsos. Rate limit guarda IPs y, si `anon` puede escribir, el tope se borra. Mismo chequeo de grants.

**P1. `cancel_subscription` es `security definer` y no mira quién llama.** Recibe un `p_user_id` y cancela esa fila (`025_recovery_cancel_snapshot.sql:20`). Si `authenticated` puede ejecutarla, una usuaria cancela a otra. No roba contenido. Sí puede cortar el cobro ajeno.

**P2. El rol de admin en RLS está mal leído.** Las políticas de newsletter, creators y migraciones comparan `auth.jwt() ->> 'role'` con `'admin'` (`002_forms.sql:18`). En Supabase ese claim es `authenticated`, nunca `admin`. Cierran de más, no filtran de menos. El admin real entra por service role. La política da una seguridad que no existe.

**P2. El puntero de suscripción no es una invariante.** `profiles.subscription_id` apunta a una fila, pero una usuaria puede tener varias. No hay índice único de "una vigente". El gate usa solo el puntero. Una fila activa huérfana no da acceso, y un puntero viejo puede darlo de más. Se cruza en la parte 3.

**P2. Tipos desfasados.** `edition_pages` sigue en `src/lib/database.types.ts:164`. La migración `011` la borró. El resto de `025` sí está reflejado.

**P2. PII sin regla de vida, salvo el sobre.** Direcciones vivas en `mailing_addresses`. Copia congelada en `mail_club_batch_items.address_snapshot` más el email. Postulaciones y el newsletter retirado guardan email sin retención. Borrar la cuenta hace cascade y se lleva el historial de envíos: bien para el derecho de supresión, mal si hace falta prueba del despacho. El purge de 60 días no está en la base. Entra en las partes 4 y 5.

### No visto

Grants reales de `authenticated` sobre `profiles`, `subscriptions`, `admin_audit_log` y `rate_limits`. Si el bucket `editions` es público. Eso decide si los P0 y P1 están vivos o solo escritos.

### Dirección

Sacar el `UPDATE` de la usuaria sobre `role`, `subscription_id` y toda `subscriptions`. Cancelar solo por la función, y que esa función exija `auth.uid()`. Borrar las políticas `using (true)`. PDF a un bucket privado. No devolver `pdf_url` al cliente.

## 3. Dinero

El flujo cobra bien el primer mes. El problema es sostener el acceso en el tiempo y no duplicar cobros.

### Qué está bien

- Firmas verificadas en ambos webhooks.
- Upsert idempotente por `(provider, provider_subscription_id)`.
- Mail Club no se activa sin pago confirmado.
- Cancelar frena primero al proveedor y si falla no miente con un ok (`cancel-subscription.ts:40`).
- Bienvenida Mail Club con reclamo at-most-once (`mail-club-activation.ts:38`).
- Upgrade con TTL y un solo pending por usuaria (`024`).
- MP valida monto y moneda del upgrade (`webhook/mercadopago.ts:280`).

### Hallazgos

**P0. Las renovaciones Stripe no extienden el acceso.** La cuenta no expone `current_period_start/end`, así que `periodRange` inventa +30 días (`webhook/stripe.ts:22`). El handler `subscription.updated` escribe ese mismo fallback (`:330`). Al segundo mes, `current_period_end` local queda viejo y el gate corta el acceso mientras Stripe sigue cobrando. El reconcile repite el fallback (`reconcile.ts:114`).

**P0. El checkout digital permite duplicar suscripciones.** El camino Mail Club rechaza con 409 si ya hay una vigente (`create-checkout.ts:100`). El camino digital no chequea nada: crea otra sesión de Stripe o MP. Doble recurrencia, varias filas por usuaria, y el puntero `profiles.subscription_id` queda ambiguo. Cancelar y portal eligen "la última", no el puntero (`cancel-subscription.ts:19`, `portal.ts:23`).

**P1. Digital se activa sin pago confirmado.** Mail Club espera `payment_status === paid`. Digital activa con cualquier `stripeSub.status`, incluido `incomplete` (`webhook/stripe.ts:169`). Si el primer cobro es asincrónico, la usuaria entra igual. La bienvenida digital no es idempotente: cada retry de `checkout.session.completed` la reenvía.

**P1. Cancelar toca una fila, el RPC toca todas.** La API frena la recurrencia solo en la última cancelable, pero `cancel_subscription` marca `cancel_at_period_end` en todas las del usuario. Con duplicadas, el proveedor y la base divergen.

**P1. El webhook MP puede salir caro.** Un evento sin match barre hasta 50 `incomplete` y llama a la API de MP por cada una (`mercadopago-activation.ts:82`). El fallback por email pagina `listUsers` hasta 12.000 (`webhook/mercadopago.ts:69`). Todo antes de autenticar más que la firma. Además `VERIFY_MP_SIGNATURES=false` apaga la firma por env.

**P1. Carrera en el upgrade.** `confirmUpgradePayment` marca `payment_confirmed` y después aplica (`webhook/stripe.ts:63`). Dos eventos concurrentes pasan el chequeo y aplican dos veces el cambio de tarifa en Stripe. La bienvenida se salva por el claim; el cambio de precio, no.

**P2. El plan MP se adivina por texto.** `planFromPreapproval` busca `"Mail Club"` en el `reason` (`mercadopago-status.ts:8`). Si el reason cambia, un Mail Club se activa como digital. El fallback de moneda es ARS, correcto para MP, pero silencioso.

**P2. Lo que el cron no ve.** `findReconcileCandidates` solo mira `status = incomplete` (`reconcile.ts:42`). Un webhook Stripe perdido en digital no deja fila: pagó, no existe localmente, y ni el cron ni el botón admin lo encuentran. Los pagos MP irresolubles solo quedan en logs.

**P2. Estados Stripe no mapeados.** El `update` escribe `sub.status` directo al enum local (`:323`). `incomplete_expired`, `unpaid` o `paused` rompen el check y devuelven 500 con retry. Un `deleted` libera el perfil aunque exista otra sub activa (`:347`).

### No visto

Dashboards de Stripe y MP: precios reales por `priceId`, reintentos de cobro, y si algún `customer.subscription.updated` llega sin períodos. Eso confirma el P0 de renovaciones.

### Dirección

Una sola fuente para el período de Stripe (invoice o la API de facturación, no el fallback +30d). Guard anti-duplicado también en digital. Cancelar, portal y downgrade por el puntero del perfil, no por "la última". Upgrade con transición atómica pending→payment_confirmed. Límite y alerta en los fan-out del webhook MP.

## 4. Seguridad y privacidad

Un P0 verificado en vivo, y una buena noticia sobre los archivos sensibles.

### Qué está bien

- Webhooks con firma. Uploads directo a Storage con paths fijados por el servidor, sin traversal, y cleanup limitado a `covers/` y `pdfs/`.
- El cancel no miente si el proveedor falla.
- Producción con HSTS, CSP, `nosniff` y robots que excluye `/admin` y `/api`.
- `.env` y `suscriptoresViejos.csv` están en `.gitignore` y NO están commiteados (`git ls-files` solo muestra `public/articulo-gratis.pdf`, el gratuito intencional). El service role no se expone al cliente.

### Hallazgos

**P0. El muro del PDF no existe para el bucket público. Verificado en vivo.** El objeto `.../editions/pdfs/revista-5-es.pdf` responde **200 con 3,3 MB sin autenticación**. Las portadas también salen por URL pública. El path es predecible (`pdfs/revista-{n}-{lang}.pdf`) y `edition_languages` es legible por `anon`. `/api/pdf` con su URL firmada de 5 minutos es teatro para ese archivo. (La edición 4 con ese patrón dio 400: ese nombre puntual no existe, no prueba que esté privada.)

**P0 condicional, el de la parte 2.** `UPDATE` propio en `profiles` y `subscriptions` sin límite de columnas. Si `authenticated` tiene el grant, hay auto-promoción a admin y auto-activación. Pendiente el chequeo de grants en el dashboard de Supabase.

**P1. El rate limit es parcial y se rompe con IPv6.** Solo cubre `creators` y los dos checkouts. Webhooks, `/api/pdf`, login y admin no tienen. Si la tabla falla, abre el paso (`rate-limit.ts:22`). La clave se parte por `":"`: una IPv6 se trunca y mezcla cubetas.

**P1. Emails en casi todos los logs.** `logger.error({ err, email })` en webhooks, reconcile, notify y upgrades. Si el log sale a un agregador, hay PII fuera de la base sin regla de retención.

**P2. Uploads con validación autodeclarada.** `contentType` y `size` los manda el cliente; el servidor nunca ve bytes (`sign.ts:32`). Con sesión admin el riesgo es bajo. Endurecer con verificación post-subida.

**P2. `checkOrigin: false` + acciones admin por cookie.** SameSite=Lax mitiga el CSRF clásico, pero los POST de `/api/admin` vía cookie quedan sin segunda barrera. Documentarlo como decisión.

**P2. Privacidad operativa, no declarativa.** La página de privacidad nombra derechos y un email de contacto, pero no hay auto-exportación ni auto-borrado: todo es manual. La retención postal de 60 días vive en un script, no en una política visible. El flujo de supresión por email es el cuello de botella cuando escale.

**P3.** `picsum.photos` sigue en la CSP en vivo con un comentario "provisorio". `unsafe-inline` en scripts y estilos es deuda aceptada por Astro.

### No visto

Grants reales en Supabase (decide el P0 de la parte 2). Los `pdf_url` exactos por edición (están en la base, no en el HTML). Si el log de Vercel retiene los emails logueados.

### Dirección

Bucket de PDFs a privado y URLs firmadas de verdad, o el gate sobra. Cerrar los `UPDATE` propios y las políticas `using (true)`. Rate limit en PDF, webhooks y auth, con clave que soporte IPv6 y fail-closed. Sacar el email de los logs o enmascararlo. Cuenta con exportar y borrar mis datos, y la retención escrita en la política.

## 5. Mail Club

El módulo mejor diseñado del sistema. Los hallazgos son operativos, no estructurales.

### Qué está bien

- Elegibilidad al corte, no al momento de generar: preview y creación comparten `listMailClubEligible`.
- Snapshot congela dirección, alta y estado: el CSV no cambia si la usuaria cancela después del 15.
- Lote despachado inmutable. Aviso separado del despacho físico: si Sender falla, el aviso queda pendiente sin reenviar.
- Purga con dry-run en UI y script. Fundadoras 1–100 inmutables por trigger.
- Upgrade valida zona contra moneda y proveedor.

### Hallazgos

**P1. Nada recuerda crear el lote ni despacharlo.** El corte es el 15 y el despacho el 20, pero `vercel.json` solo tiene el cron de reconcile. Si nadie entra al admin esos días, no hay sobre. Sin alerta, mail interno ni tarea programada. El negocio físico depende de memoria humana.

**P2. La purga puede borrar la dirección de quien está en mora.** Conserva direcciones solo con `status = active` y período vigente. Una usuaria en `past_due` que regulariza después pierde la dirección justo cuando el cobro se reintenta. El criterio debería incluir dunning.

**P2. Exportar el CSV con todas las direcciones no deja auditoría.** El POST de retención sí escribe en `admin_audit_log`. La descarga del CSV y el dispatch, no. Quién bajó qué PII y cuándo queda sin rastro.

**P2. La creación del lote es N+1.** Por suscripción: perfil, dirección, fundadora y hasta tres queries más para la fecha de alta. Con cientos de suscriptoras, el admin cuelga en la pantalla del mes. Igual en el detalle del lote.

**P2. Cancelar entre el corte y el despacho igual envía.** El dispatch no revalida elegibilidad. Con cancelación diferida suele ser correcto, pero si el período venció entre el 15 y el 20, el sobre sale igual. Falta la guarda o la decisión explícita.

**P3. Fundadora 101.** Agotados los 100 números, `assignFounderNumber` devuelve null y la bienvenida sale sin número. Merece un texto previsto, no un null silencioso.

### No visto

El runbook real del día 15 y 20. Costo postal por zona contra los precios fijados (entra en la 8).

### Dirección

Recordatorio automático los días 14 y 19. Purga que respete `past_due`. Audit log en export y dispatch. Elegibilidad en un par de queries con join. Decidir por escrito si el despacho revalida o no.

## 6. Producto público

La base de accesibilidad existe. El HTML tarda y el SEO técnico sangra por detalles.

### Qué está bien

- Diálogos con `aria-modal` y etiquetas, carruseles y dots etiquetados, portadas con `alt` y `loading="lazy"`, `lang` correcto por idioma, reveal con `prefers-reduced-motion`.
- react-pdf solo carga donde se usa. Popup y banners con botón de cierre etiquetado.

### Hallazgos

**P1. El HTML tarda ~1,1 s para 52 KB.** Medido en vivo en `/` y `/revista`. No es el peso, es el SSR por request sin caché (parte 1). Fuentes de Google por stylesheet bloqueante; Bootzy local con preload, bien.

**P1. El JSON-LD sale roto en producción.** El `<script type="application/ld+json">` del layout usa `${siteUrl}` en un script plano y Astro lo deja literal: `"url": "${siteUrl}"`. El schema no existe para Google ni para IA. Se desarrolla en la 7.

**P1. El sitemap no existe donde robots dice.** `robots.txt` declara `/sitemap.xml` y esa URL da **404**. El real es `/sitemap-index.xml`. Google nunca encuentra el mapa. Se desarrolla en la 7.

**P2. Las tarjetas flip no son operables por teclado.** `div` con `cursor-pointer`: sin foco, sin Enter, sin rol. El contenido detrás queda fuera del tab.

**P2. Sin skip link.** Con navbar fija, el teclado tabula todo antes de llegar a lo importante.

**P2. MP sin portal termina en `alert()`.** La suscriptora de Mercado Pago que quiere gestionar su plan recibe un popup del navegador. Para el plan más caro es el peor final posible.

**P2. Cada navegación es un documento nuevo.** Sin transiciones de vista, el panel parpadea entre secciones (parte 1). Los banners de `?checkout=success` dependen de query params y cada página re-resuelve sesión.

### No visto

Lighthouse real (LCP, CLS, INP), contraste medido, pasada completa de teclado en checkout y cuenta, lector de pantalla en el visor PDF.

### Dirección

Caché del HTML público, JSON-LD con `set:html`, robots al índice real, skip link, flips como enlaces reales, y una página propia de gestión para MP. Lo fino (hreflang, OG, sitemap con slugs) entra en la 7.

## 7. Crecimiento

El producto vende, pero nadie mide y Google llega a medias.

### Qué está bien

- Títulos y descripciones por página en los dos idiomas, OG completo, canónicas correctas.
- Checkout sin sesión con intento guardado 24 h. FAQ en la página de precio.
- SPF con Sender incluido y reintentos con backoff ante el 429.
- El SSR ayuda a los bots: el contenido llega renderizado.

### Hallazgos

**P1. Google no encuentra el mapa.** `robots.txt` apunta a `/sitemap.xml` y da 404. El índice real existe pero nadie lo declara.

**P1. El schema es texto muerto.** El JSON-LD sale con `"${siteUrl}"` literal. Ni Google ni una IA pueden usarlo.

**P1. Las ediciones no se indexan.** El sitemap no tiene ninguna ficha `/revista/[slug]`. A cambio incluye `/mi-cuenta` y el login en inglés: páginas privadas en el mapa público.

**P1. Dos idiomas sin señal de idioma.** Hay `/` y `/en/` duplicando contenido y cero `hreflang`.

**P1. Cero medición.** Ni un evento de analytics en todo el repo. Visita, checkout iniciado, pago, activación y cancelación: todo ciego.

**P2. DMARC en modo mirar.** `p=none`: monitorea pero no frena suplantación. El remitente es `hola@comunidadtriba.com`, dominio distinto al del sitio.

**P2. Un solo proveedor de mail, plan gratuito.** Bienvenida, avisos y transaccionales dependen de Sender con 429 a nivel cuenta. El dispatch manda en serie sin throttle propio. Sin plan B.

**P2. La imagen social es un SVG.** `og:image` apunta al logo en SVG con card `summary_large_image`. La mayoría de las redes no lo renderiza.

**P3. Sin `llms.txt`.** Los crawlers de IA entran sin guía. Con el contenido tras el muro, conviene decirles qué citar.

### No visto

Search Console (errores reales de indexación). DKIM (selector de Sender no verificado desde afuera). Tasas de apertura y rebote. Origen del tráfico actual.

### Dirección

Robots al índice real, sitemap con fichas de ediciones y sin páginas privadas, JSON-LD válido de revista y ofertas, `hreflang` cruzado, imagen social raster 1200×630, `llms.txt`, cinco eventos de funnel en herramienta sin cookies, DMARC a cuarentena cuando el volumen lo pida.

## 8. Higiene

Los tres carruseles son una sola familia. Los tests no cubren el dinero.

### Qué está bien

- `MagazineSlider` y `MagazineCarousel` envuelven a `MagazineScroller`: composición, no triplicación.
- El newsletter es una lápida 410 consciente, no olvido.
- CSV con neutralización de inyección. Smoke de producción 12/12. Pino con redacción de auth y cookies.

### Hallazgos

**P1. Los tests no cubren el dinero.** 25 tests en un solo archivo, todos de funciones puras: zonas, fechas, CSV. Cero cobertura en webhooks, activación, reconcile, gate y cancelación. Justo donde la parte 3 encontró los P0.

**P1. Sin CI.** No hay `.github`, ni lint, ni check en scripts. `astro check` se corre a mano. El `database.types.ts` desfasado de la parte 2 es el bug que un CI agarra.

**P2. Scripts de un solo uso junto a producción.** Migración WooCommerce, recreación de billing, imports, `fix-admin`, `create-test-subscriber`: ya cumplieron. Sin distinción de los vivos (purge, smoke, resync). `deploy-ftp.mjs` trae host y usuario hardcodeados legacy con parseo casero de `.env`.

**P2. `csvCell` copiado tres veces.** `src/lib/csv.ts` y dos scripts lo reimplementan. Si cambia el criterio, uno puede quedar vulnerable a inyección por fórmula.

**P2. Dos loggers.** El admin de ediciones y `locale.ts` usan `console.error`: logs sin estructura, fuera del nivel configurable y de la redacción.

**P2. Sin seguimiento de errores ni alertas.** Si el cron o un webhook fallan, nadie se entera hasta el reclamo. Sin Sentry ni aviso, la observabilidad es decorativa.

**P3. Peso muerto del newsletter.** Tabla, conteos del dashboard, resync y export para un producto retirado. La tabla se conserva hasta borrar la lista; los conteos por vista y el resync ya sobran.

### Costos (cualitativo)

Todo SSR on-demand: cada visita pública es función + queries. Egress de PDFs por URLs firmadas. Sender free con 429 a nivel cuenta. A futuro pesa el N+1 del admin y los 12 counts por vista.

### No visto

Backups y PITR de Supabase (nada en el repo lo declara). `npm outdated`. Duración de test + check en CI inexistente.

### Dirección

Tests en los caminos de dinero con Supabase mockeado. CI mínimo: install, check, test, build. Archivar scripts de migración y borrar el FTP. Unificar `csvCell` y el logger. Sentry con alerta en cron y webhooks. Declarar backups antes de necesitarlos.

## 9. Síntesis

El código está bien escrito y el negocio bien modelado. Los cuatro P0 no son desprolijidad: son límites que quedaron del lado equivocado — el bucket del lado público, el período del lado inventado, el checkout del lado confiado y la base del lado escribible. Mover esos cuatro límites es el 80% del valor.

### P0 — dinero o datos, ya

1. **PDF público.** `revista-5-es.pdf` descarga sin login. Bucket a privado y URLs firmadas de verdad, o todo el muro sobra.
2. **Renovaciones Stripe no extienden el acceso.** El fallback +30d deja el período local viejo y el gate corta a quien pagó. Fuente real del período, no inventada.
3. **Checkout digital duplica suscripciones.** Sin guard anti-doble, hay doble recurrencia. Mismo 409 que Mail Club.
4. **UPDATE propio en `profiles` y `subscriptions`.** Auto-admin y auto-activación si el grant existe. Confirmar grants y cerrar columnas.

### P1 — riesgo concreto, este mes

5. Digital se activa sin pago confirmado + bienvenida duplicable.
6. Cancelar toca una fila, el RPC marca todas: divergencia proveedor-base.
7. Webhook MP con fan-out caro y firma apagable por env.
8. Carrera en el upgrade: doble aplicación del cambio de tarifa.
9. Rate limit parcial, fail-open y roto en IPv6.
10. Emails en los logs sin regla de retención.
11. JSON-LD roto, sitemap declarado en 404, ediciones fuera del índice, sin `hreflang`, cero medición.
12. Tests que no cubren el dinero + sin CI.
13. Nada recuerda crear el lote del 15 ni despachar el del 20.

### P2 — deuda, este trimestre

RLS con `using (true)` y rol admin mal leído. `cancel_subscription` sin `auth.uid()`. Puntero de suscripción sin invariante. Tipos desfasados. N+1 en lotes y dashboard. Purga que borra morosos. CSV y dispatch sin auditoría. Uploads autodeclarados. CSRF documentado a medias. Supresión manual de datos. Flips sin teclado, sin skip link, portal MP en `alert()`. DMARC en `p=none`, un solo proveedor de mail, OG en SVG. Scripts de migración junto a producción, doble logger, sin alertas.

### P3 — nits, cuando se toque el archivo

Fundadora 101, `picsum` en la CSP, peso muerto del newsletter, `llms.txt`, etiqueta "Language" hardcodeada.

### Quick wins (días, sin reescribir nada)

- Robots al índice real + sitemap con slugs y sin páginas privadas.
- JSON-LD con `set:html`.
- Guard anti-duplicado en checkout digital.
- `hreflang` cruzado.
- Archivar scripts muertos y borrar el FTP.
- CI mínimo: install, check, test, build.

### Estructural (semanas, con diseño)

- Período de Stripe desde fuente real.
- Sesión única en el middleware + HTML público cacheado.
- Shell propio para Mi Cuenta.
- Estado de suscripción en un solo módulo.
- Bucket privado + RLS cerrada.
- Cinco eventos de funnel + Sentry con alertas.
- Recordatorios del 15 y 20.

## Fuera de alcance

- Pentest y reescritura.
- Dashboards de Stripe, Mercado Pago y Supabase, salvo que se dé acceso.
