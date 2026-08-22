# MAPA FUNCIONAL DE TRIBA — documento de referencia

> Generado desde el código real (agosto 2026). Cada `FLOW-xx` / `COMP-xx` traza a archivo y línea del repo.

## 0. Inventario con IDs

| ID | Elemento |
|---|---|
| PAGE-01→10 | Públicas: `/`, `/revista`, `/revista/[slug]`, `/suscribirme`, `/iniciar-sesion`, `/mi-cuenta`, `/triba-creators`, `/terminos`, `/privacidad`, `/404` |
| PAGE-11→18 | Admin: `/admin`, `/admin/suscriptoras`, `/admin/creators`, `/admin/feedback`, `/admin/audit-log`, `/admin/ediciones`, `/admin/ediciones/nuevo`, `/admin/ediciones/[id]` |
| COMP-01 | Navbar (desktop + mobile + dropdown) |
| COMP-02 | NewsletterForm (home) |
| COMP-03 | Card-stack carousel mobile (home) |
| COMP-04 | MagazineScroller + FlipCover + MagazineCard (familia carrusel) |
| COMP-05 | Currency segments (suscribirme) |
| COMP-06 | CheckoutButton |
| COMP-07 | Newsletter card form (suscribirme) |
| COMP-08 | FAQ accordion |
| COMP-09 | Auth cards: login / signup / forgot / reset / check-email |
| COMP-10 | Banner checkout dismiss |
| COMP-11 | Tus tomos carousel (mi-cuenta) |
| COMP-12 | PDFViewer.tsx |
| COMP-13 | Feedback form |
| COMP-14 | Creators application form |
| COMP-15 | Featured CTA switch (revista) + selector de portada |
| COMP-16 | Admin Layout + toast/confirm + logout |
| COMP-17 | Admin Dashboard (cards/quick actions) |
| COMP-18 | Admin Suscriptoras (filtros/búsqueda/paginación/export) |
| COMP-19 | Admin Migrar |
| COMP-20 | Admin Cancelar |
| COMP-21 | Admin Reembolsar |
| COMP-22 | Admin Creators (aprobar/rechazar) |
| COMP-23 | Admin EditionForm (crear/editar/borrar + uploads) |
| COMP-24 | Admin Notificar suscriptoras |
| FLOW-01 | Newsletter gratis |
| FLOW-02 | Login |
| FLOW-03 | Signup |
| FLOW-04 | Recuperar/reset contraseña |
| FLOW-05 | Logout |
| FLOW-06 | Checkout Stripe |
| FLOW-07 | Checkout Mercado Pago |
| FLOW-08 | Activación Stripe (webhook) |
| FLOW-09 | Activación MP (webhook self-healing) |
| FLOW-10 | Polling post-pago |
| FLOW-11 | Cancelar suscripción (usuario) |
| FLOW-12 | Acceso/descarga PDF |
| FLOW-13 | Feedback |
| FLOW-14 | Postulación creators |
| FLOW-15 | Admin: CRUD ediciones + upload |
| FLOW-16 | Admin: notificar edición |
| FLOW-17 | Admin: operaciones suscriptoras (lista/busca/migra/cancela/reembolsa/exporta) |
| FLOW-18 | Admin: revisar creators |

---

## 1. ÁRBOL GENERAL

```
SITIO — universotriba.com (Astro SSR on-demand, Sin ISR)
│
├─ MIDDLEWARE (todas las rutas)  [SEC-00]
│   ├─ session via cookies → locals.user
│   ├─ solo en /admin* y /api/admin*: profile → locals.profile
│   ├─ /admin* sin session  → 302 /iniciar-sesion?redirect=...
│   ├─ /api/admin* sin session → 401 JSON · sin role admin → 403 JSON
│   ├─ /admin* sin role admin → 302 /
│   └─ HTML responses: CSP (frame-src 'none'), nosniff, referrer, permissions
│
├─ PÚBLICO
│  ├─ PAGE-01  HOME  (/)
│  │   ├─ SEC-01 Hero: logo · botones [Suscribirme → PAGE-04][Recibir newsletter → #newsletter]
│  │   └─ COMP-03 card-stack carousel (solo mobile: dots + swipe)
│  │   ├─ SEC-02 "¿Qué somos?": copy estático
│  │   ├─ SEC-03 Ediciones: COMP-04 [MagazineSlider mobile | deslizables] + [MagazineCard grid desktop]
│  │   │                        cada FlipCover: hover → flip → link /suscribirme
│  │   │                    + Button "Ver más" → PAGE-04
│  │   ├─ SEC-04 Creators: Button → PAGE-07
│  │   └─ SEC-05 Newsletter: COMP-02 (FLOW-01)
│  │
│  ├─ PAGE-02  REVISTA  (/revista)
│  │   ├─ COMP-15 portada destacada: CTA dinámico [sub activa→/mi-cuenta][no sub→/suscribirme]
│  │   ├─ COMP-04 MagazineCarousel: selección de edición (client-side, NO navega)
│  │   └─ SEC-visor: COMP-12 PDFViewer del artículo gratis (kind=free o /articulo-gratis.pdf)
│  │                 + CTA Seguir leyendo/Suscribirme según sub
│  │
│  ├─ PAGE-03  EDICIÓN  (/revista/edicion-N)
│  │   ├─ no existe edición → redirect /revista
│  │   ├─ Botones [Leer aquí → #visor-revista][Descargar PDF → /api/pdf/:id?download=1]
│  │   └─ COMP-12 PDFViewer con URL firmada
│  │
│  ├─ PAGE-04  SUSCRIBIRME  (/suscribirme)
│  │   ├─ COMP-10 banners resultado checkout [canceled][pending] ← query params
│  │   ├─ COMP-05 currency segments [EUR|USD|ARS] → muestra plan correspondiente
│  │   ├─ COMP-06 CheckoutButton [EUR/USD→Stripe][ARS→MP]  (FLOW-06/07)
│  │   ├─ COMP-07 newsletter card form (FLOW-01 bis)
│  │   ├─ COMP-08 FAQ accordion (solo uno abierto)
│  │   └─ flushPendingCheckout: intent guardado + sesión → auto-clic del botón correcto
│  │
│  ├─ PAGE-05  INICIAR SESIÓN  (/iniciar-sesion)
│  │   ├─ COMP-09 login (FLOW-02) · signup (FLOW-03) · forgot/reset (FLOW-04)
│  │   ├─ ?signup=true → arranca en signup · ?recovery=true → reset
│  │   ├─ banner checkout-pending si hay intent en localStorage
│  │   └─ redirect válido (mismo origin) o role-driven
│  │
│  ├─ PAGE-06  MI CUENTA  (/mi-cuenta)   ⭐ núcleo pago
│  │   ├─ gate SSR: hasActiveSub = isActiveSubscription(status) (active|migrated)
│  │   │   └─ NO activa → panel por outcome [canceled→Suscribirme | success/pending→spinner+poll (FLOW-10) | else→Suscribirme]
│  │   ├─ banners checkout [success|canceled|pending]
│  │   ├─ hero edición destacada: [Seguir leyendo → #visor-revista][Descargar PDF → /api/pdf]
│  │   ├─ banner admin (solo role admin → /admin)
│  │   ├─ COMP-11 Tus tomos carousel (pag 4|8) → /revista/edicion-N#visor-revista
│  │   ├─ COMP-12 PDFViewer (destacada, URL firmada)
│  │   └─ COMP-13 Feedback (FLOW-13)
│  │
│  ├─ PAGE-07  TRIBA CREATORS  (/triba-creators)
│  │   └─ COMP-14 formulario postulación (FLOW-14)
│  │
│  ├─ PAGE-08/09/10  TÉRMINOS / PRIVACIDAD / 404   (estáticas, sin interacción)
│  │
│  └─ GLOBAL: COMP-01 Navbar (todas las públicas) + Footer
│
└─ ADMIN  (todo detrás de middleware)
   ├─ PAGE-11  DASHBOARD   → COMP-17 (cards link, quick actions, audit reciente)
   ├─ PAGE-12  SUSCRIPTORAS → COMP-18/19/20/21 (FLOW-17)
   ├─ PAGE-13  CREATORS    → COMP-22 (FLOW-18)
   ├─ PAGE-14  FEEDBACK    → lectura SSR
   ├─ PAGE-15  AUDIT-LOG   → lectura SSR paginada
   ├─ PAGE-16  EDICIONES   → listado SSR
   ├─ PAGE-17  EDICIONES/NUEVO → COMP-23 mode=create (FLOW-15)
   └─ PAGE-18  EDICIONES/[ID] → COMP-23 mode=edit + delete + COMP-24 notificar (FLOW-16)
```

**API (20 endpoints, todos JSON, auth Bearer):**

```
PÚBLICOS (requireUser / rate-limit por IP):
  POST /api/newsletter           5/min      · 23505 → existing/resync
  POST /api/creators             3/min      · dedup email 24h (trigger 015)
  POST /api/feedback             usuario+msg dedup 24h (trigger 016)
  POST /api/create-checkout      10/min     · → provider.createCheckout
  GET  /api/subscription-status             · polling
  POST /api/cancel-subscription             · RPC cancel_subscription
  POST /api/portal                          · MP sin portal → {note}
  GET  /api/pdf/:id                         · gate + signed URL 302
WEBHOOKS:
  POST /api/webhook/stripe       firma constructEvent
  POST /api/webhook/mercadopago  WebhookSignatureValidator
ADMIN (requireAdmin vía locals):
  POST /api/admin/uploads/sign
  POST /api/admin/editions · GET/PATCH/DELETE /api/admin/editions/:id · POST .../notify (body {emails?} → retry filtrado, resp {failures})
  GET  /api/admin/subscribers · export · migrate · :id/cancel · :id/refund  (resp totalActive/totalCanceled/totalNone globales)
  GET/PATCH /api/admin/creators
```

---

## 2. FLUJOS FUNCIONALES CON RAMIFICACIONES

### FLOW-01 · Newsletter gratis  ★core-conversión *(actualizado 2026-08-22 — $ST-04 mitigado)*
```
[Usuaria] ingresá email → submit COMP-02/07
  → handler: btn.disabled=true (in-flight) + aria-live
  → fetch POST /api/newsletter {email}
     → rate-limit IP 5/min ── excedido → 429 "Demasiados intentos" → msg error → reintenta
     → validación email (regex) ── inválido → 400
     → insert newsletters
        ── OK → syncSenderForEmail(email) con retry backoff (429/5xx → sleep 800ms*2^attempt + retry-after, máx 2 reintentos en src/lib/sender.ts)
             ├─ Sender OK (incl. retry) → sender_synced=true, sender_synced_at=now, sender_sync_error=null → {ok:true} → "¡Gracias por suscribirte!"
             └─ Sender FALLA tras retries → sender_synced=false + sender_sync_error (slice 500) → {ok:true} (user ve éxito) + logger.error + visible en admin: dashboard card "Newsletter" muestra "N pendientes de sync" y banner "Ejecutá resync-newsletters.mjs"
                  Resync: siguiente POST con mismo email (23505) o script scripts/resync-newsletters.mjs re-dispara automatización idempotente
        ── 23505 (ya existe) → lee sender_synced
             ├─ false → re-alta Sender (con mismo retry) → {existing:true, resynced:true} → "te reenviamos la bienvenida"
             └─ true  → {existing:true, resynced:false} → "Ya estás suscripta"
        ── otro error → 500 → msg "Error al suscribirte"
  → finally: btn re-habilitado
ESTADOS: idle / sending(disabled) / success / existing / resynced / connection-error / server-error
DEPENDENCIA: Sender grupo newsletter-gratuito (automatización welcome) · tabla newsletters · rate_limits · src/lib/admin index dashboard newsletter_pending_sync
```

### FLOW-02 · Login
```
[Usuaria] email+clave → submit COMP-09 login
  → btn "Ingresando..." disabled
  → supabase.auth.signInWithPassword
  ├─ authError → msg error inline → habilita → vuelve a form
  └─ OK →
       ¿hay ?redirect=? (y mismo origin via isSafeRedirect)
       ├─ Sí → redirecciono y listo
       └─ No → leo profiles.role
            ├─ admin → /admin
            └─ rest → /mi-cuenta
ESTADOS: idle / busy / error / redirect
```

### FLOW-03 · Signup (alta instantánea, sin confirmación)
```
[Usuaria] email+clave+confirmar → submit
  → validación local: password===confirm · min 6 → error inline
  → supabase.auth.signUp({emailRedirectTo: origin+redirect})
  ├─ error → "already registered/exists" → msg "Ya existe una cuenta con este email. Iniciá sesión"
  ├─ data.session → redirect (✓ caso real, confirm OFF)
  ├─ data.user.identities.length === 0 → msg "Ya existe una cuenta..." (dupe)
  └─ else → showCard(check-email)  ← ruta casi muerta (solo si Supabase activara confirm)
ESTADOS: idle / creating / error-dupe / session / check-email
```
> Nota de detección: `check-email-card` es rama de seguridad que hoy no se ejecuta (confirm email OFF), no es bug pero es código muerto de mantenimiento.

### FLOW-04 · Recuperar contraseña
```
[Olvidé mi contraseña] → showCard(forgot)
  → supabase.auth.resetPasswordForEmail(redirect='{origin}/iniciar-sesion?recovery=true')
  ├─ error → msg inline
  └─ OK → recovery-success card ("revisá tu email")
[Llega email → click link fue:?recovery=true] → reset-card
  → password===confirm + min 6 → supabase.auth.updateUser({password})
  ├─ error → inline
  └─ OK → /mi-cuenta
```

### FLOW-05 · Logout ⭐ dependencia transversal
```
Desencadenantes (3): dropdown .logout-dropdown-btn · botón mobile #logout-btn-mobile · AdminLayout "Salir"
  → handler global delegado en Navbar (window._accountActionsBound)  ← COMP-01 debe estar en la página
  → supabase.auth.signOut() → window.location.href="/"
  → Navbar SSR en próxima carga deja de mostrar "MI CUENTA"
DEPENDENCIA: NAVBAR (COMP-01) está acoplado a AccountMenuItems via delegación; admin usa su propio botón.
```

### FLOW-06 · Checkout Stripe  ⭐core-conversión
```
[Usuaria] click COMP-06 (EUR/USD)
  → btn "Procesando..." disabled · oculta error previo
  → supabase.auth.getSession()
  ├─ NO session → saveCheckoutIntent(provider,currency) [localStorage TTL 24h]
  │     → redirect /iniciar-sesion?signup=true&redirect=/suscribirme?currency=X
  │       (banner "Estás por suscribirte" en login · tras login/signup vuelve y auto-repite)
  └─ session → POST /api/create-checkout {provider,currency}
       → rate-limit 10/min(IP) · requireUser(401) · provider/currency whitelist(400)
       → StripePaymentProvider.createCheckout: Stripe Checkout Session mode=subscription
         success_url={origin}/mi-cuenta?checkout=success
         cancel_url={origin}/suscribirme?checkout=canceled
       ├─ url → window.location.href (abandona el sitio)
       └─ error → 500 → msg inline rojo + btn restaurado
  [Stripe devuelve al browser]  ?checkout=success → PAGE-06 banner success (FLOW-08/10)
  ?checkout=canceled → PAGE-04 banner canceled (dismissible) → puede reintentar
ESTADOS: idle / processing / external-host / success / canceled / error
```

### FLOW-07 · Checkout Mercado Pago  ⭐
```
[Usuaria] click COMP-06 (ARS)
  → igual que FLOW-06 (intent si no hay sesión)
  → MP PreApproval.create: payer_email, external_reference=userId, back_url=.../mi-cuenta?checkout=success
  → init_point → redirige a MP
  [MP devuelve con sus propios params (preapproval_id|collection_id, status|collection_status)]
  → getCheckoutOutcome: parses MP status
     ├─ authorized/active/approved → success
     ├─ rejected/cancelled/canceled/refunded → canceled
     ├─ pending/in_process → pending (banner "procesando" + poll)
     └─ unknown → none
  → mi-cuenta consolida: history.replaceState limpia params MP (evita re-trigger en refresh)
```

### FLOW-08 · Webhook Stripe → activación  ⭐
```
Stripe POST (firma constructEvent; falla → 400 "Invalid signature")
  ├─ checkout.session.completed (mode=subscription)
  │   → retrieve subscription + periodRange (actual: sin current_period_start/end → start_date ?? created; fin=+30d)
  │   → userId = client_reference_id || metadata.user_id ; email = session.customer_email || fallback por userId
  │   → UPSERT subscriptions onConflict(provider, provider_subscription_id)
  │   → UPSERT profiles {role:subscriber, subscription_id}
  │   → supersedeMigratedSub(userId): sub migrated → cancelada
  │   → syncPaidSubscriber(email) [Sender grupo suscriptora-paga]
  │   → sendWelcomeEmail(email, false)
  ├─ customer.subscription.updated / deleted
  │   → UPDATE subscriptions.status + period
  │   → si status canceled|past_due → profiles {role:free, subscription_id:null}
  └─ errores → 500
ESTADOS: pending → active / past_due / canceled · (incomplete/trialing quedan sin handler de acceso)
```

### FLOW-09 · Webhook MP → activación self-healing  ⭐⭐ (el más complejo)
```
MP POST (WebhookSignatureValidator, sin toleranceSeconds; no secret → 500; mal → 401)
  ├─ subscription_preapproval → handlePreApprovalEvent(preapprovalId)
  │   → GET /preapproval/:id
  │   → solo actúa si status authorized|active  ← si llega "pending" por consistencia eventual, AQUÍ no activa
  │   → userId = external_reference
  │     └─ si no → email = payer_email ?? resolvePayerEmail(chain authorized_payments/search → v1/payments/:id)
  │         └─ si no → lookUpUserIdByEmail (listUsers paginado, loop guard 60)
  │   → sin userId → warn + skip (acceso perdido hasta reconcile manual)
  │   → activateSubscription (ver abajo)
  ├─ subscription_authorized_payment → handleAuthorizedPaymentEvent(paymentId)
  │   → GET /v1/payments/:id ; gate status==="approved"
  │   → preapproval existente → solo EXTENDER current_period_end +30d (renovación)
  │   └─ sin sub linkeada → self-heal: fetch preapproval + resolver userId + activateSubscription
  │        (NOTA: NO gatea por status de preapproval acá — un payment APPROVED es la verdad)
  │
  activateSubscription():
  │   upsert subscriptions(provider,provider_subscription_id) status=active
  │   → UPDATE profiles {role:subscriber, subscription_id} (explícito, evita race con handle_new_user)
  │   → email presente → rellena profiles.email solo si null
  │   → cancela sub migrated del user
  │   → solo si NO existía la sub previa: syncPaidSubscriber + sendWelcomeEmail (retries 96h duplicarían)
  └─ ok({received:true})
ESTADOS: approved-created / approved-renewal / pending(no-op) / unresolved-user(warn) / error
```

### FLOW-10 · Polling post-pago  ⭐ *(actualizado 2026-08-22 — P4)*
```
Gatillo: PAGE-06 SSR con outcome success|pending + panel "Procesando..." (sin sub aún)
  → startCheckoutPoll(getToken, onTimeout, onNetworkError) cada 3s, máx 20 intentos (~60s)
     → GET /api/subscription-status (Bearer token) → subscription.status
       ├─ active|migrated → reload (SSR re-renderiza panel con acceso) + reset consecutiveFailures
       ├─ !active → reintenta (consecutiveFailures=0)
       └─ fetch error / !ok → consecutiveFailures++
          └─ >=3 consecutivos → onNetworkError() una vez → "[data-processing-note]" = processingNetworkError
     ├─ timeout (>20) → onTimeout → msg processingNote2
```
> Lag real: MP devuelve a back_url antes de que el webhook active → el poll cubre ese hueco. Resuelto P4: ya no es silencioso, a los ~9s avisa "Conexión inestable, seguimos intentando...".

### FLOW-11 · Cancelar suscripción (usuario)  ⭐
```
Dropdown → "Cancelar suscripción" → showConfirm ("perderás el acceso al final del período")
 → POST /api/cancel-subscription
   → requireUser · busca sub status=active del user (404 si no)
   → provider.cancelSubscription (Stripe sub.cancel / MP preapproval status=cancelled)
       └─ error del gateway → providerWarnings (no falla el flujo)
   → RPC cancel_subscription (BD local; si falla → 500 y NO revierte el cancel del gateway ★)
 → {ok} → toast "Suscripción cancelada" + si warnings → alert() con detalle + reload
DEPENDENCIA: NAVBAR/AccountMenuItems debe estar presente; el toast es `showToast` de `src/lib/ui.ts` (compartido, auto-crea su contenedor)
```
> Resuelto 2026-08-14 (P5/P6): el dropdown importa `showToast` de `src/lib/ui.ts` directo → el éxito se confirma con toast antes del reload.

### FLOW-12 · Acceso/descarga PDF  ⭐
```
GET /api/pdf/:id
  → editionId int · edition existe (404) · pdf_url existe (404)
  → storagePath extraíble → 302 directo a URL pública
  → user? → profile admin → allow · subscriber+sub active|migrated → allow
  → NO user o sin acceso → SI featured o kind=free → allow (de todos modos público)
  └─ else → sin sesión → 302 `/iniciar-sesion?redirect=path+query` · con sesión → 302 `/suscribirme` (sin JSON)
  → createSignedUrl(path, 300s, download=1 si ?download=1) → 302
  → error signedUrl → 500 JSON (enlace muerto)
```
> Rutas que lo disparan: Descargar PDF (PAGE-03/06) · PDFViewer client (PAGE-02/03/06 ya son URLs firmadas SSR). Expiración ~30min para viewer vs firmas de 5min de descarga.

### FLOW-13 · Feedback  ⭐ (solo suscriptora)
```
PAGE-06 form: contador 0/2000 · btn disabled si vacío o >2000
  → submit → btn "Enviando..." síncrono (anti doble-click)
  → session? NO → msg "Debés iniciar sesión" (red)
  → POST /api/feedback {mensaje}
     → requireUser · 400 vacío/2000+ · rate 1/min (por query created_at) → 429
     → trigger 016 (mismo user+mensaje/24h) → 429 "Ya enviaste ese mensaje..."
     → insert → ok
  → msg success "¡Gracias por tu feedback!" (se auto-oculta a los 3s) / msg error según status
ESTADOS: idle / typing(contador) / submitting / success / 429 / server-error / net-error / not-logged
```

### FLOW-14 · Postulación Creators
```
PAGE-07 form (nombre/email/pais/areas checkbox≥1/propuesta/trabajo_url opcional)
  → btn disabled síncrono
  → POST /api/creators
     → rate-limit 3/min IP → 429
     → validación: obligatorios(400) · email regex(400) · largos(400) · areas≥1(400)
     → trigger 015 dedup email/24h → 429 "Ya te postulaste recientemente..."
     → insert → ok
  → success: msg verde "¡Gracias por postularte!" + form.reset()
  └─ error: msg rojo (server/red)
  → pendiente en admin: COMP-22 / FLOW-18
```

### FLOW-15 · Admin: CRUD ediciones + upload ⭐⭐ *(actualizado 2026-08-22 — $ST-05)*
```
COMP-23 (PAGE-17 create / PAGE-18 edit)
  → kind radio magazine|free (synckind: toggle campos; free exige pdf y omite portada/featured/número)
  → submit (btn "Creando..." disabled)
    → 1) upload directo a Supabase Storage (bypassa límite 4.5MB de Vercel):
       POST /api/admin/uploads/sign {kind,filename,contentType,size,editionNumber?,slug?,language?}
         → requireAdmin · kind(400) · filename(400) · mime FILE_RULES(400) · size>max(400) · cover sin número(400)
         → createSignedUploadUrl(path,{upsert:true}) → {signedUrl, publicUrl, path}  (path canónico)
       → PUT directo al signedUrl (solo Content-Type) ── fail → throw → msg error
       → fd.set(cover_url/pdf_url, publicUrl) + uploadedPaths.push(path)
    → 2) POST /api/admin/editions | PATCH /api/admin/editions/:id  (FormData SIN files)
       POST: kind · cover_url obligatorio si magazine(400) · validateEditionInput(400)
              · número duplicado → 409 · featured→ unset featured previa
       PATCH: fallback a current · nº duplicado ≠self → 409 · featured new → unset
       └─ !ok (400/409/500) o catch → POST /api/admin/uploads/cleanup {paths: uploadedPaths} → remove(paths) (solo covers/pdfs) — fire-and-forget
    → ok → toast + redirect /admin/ediciones (no limpia)
  → DELETE (solo edit): confirm → DELETE → redirect
★ resuelto 2026-08-22: PUT→POST fallido ya no deja huérfano del submit actual (cleanup fire-and-forget vía src/lib/storage.ts:removeStoragePaths + /api/admin/uploads/cleanup.ts). Huérfanos históricos siguen pendientes de script de barrido.
```

### FLOW-16 · Admin: Notificar edición  *(actualizado 2026-08-22)*
```
PAGE-18 botón → confirm → POST /api/admin/editions/:id/notify  (body opcional {emails:[]})
  → requireAdmin · edition(404) · kind!=magazine o sin cover → {notified:0, failures:[]}
  → profiles role=subscriber → sendNewEditionEmail (Sender /message/send) uno a uno
     · sin body → todas · con {emails} → solo esas (retry filtrado)
  → {notified, total, failed, noEmail, failures:[{email,error}]}
  → UI:
     · msg "Notificadas: X de Y (N fallaron)" · toast
     · si failures.length>0 → lista scroll + botones [Reintentar fallidas → POST con {emails}] [Copiar emails]
     · reintento muestra "Reintento: X de Y ok — todas ok / N aún fallaron"
★ resuelto 2026-08-22: ya no es sin retry; failures accionable + retry filtrado no duplica a exitosas
```

### FLOW-17 · Admin: suscriptoras (la página más densa)
```
PAGE-12 → GET /api/admin/subscribers?page&status&search&pageSize(=20 default)
  → mezcla profiles(con sub) + subscriber_migrations sin cuenta (pend. registro) con estados Stripe en vivo
  → stats: todas globales desde el server (2026-08-22: totalActive/totalCanceled/totalNone + pend/refund) — respeta search, ignora status/page ★ antes por página, engañoso
  acciones:
   · filtros tabs → reload; búsqueda debounce 300ms; paginación prev/next
   · export → window.open /api/admin/subscribers/export?status... (CSV; estado actual filtrado)
   · migrar → confirm → POST migrate {email} → insert migration (23505 = ya, idempotente)
        → user existe? role ya subscriber → ok sin cambios
        → crea sub migrated 7d + profile role=subscriber
        → mensaje nota diferencial (acceso "cuando se registre" vs "acceso 7 días")
   · cancelar (sub activa, incl. migradas con stripe o sin) → confirm → POST /:id/cancel
        → RPC cancel_subscription (profile) · o cancela Stripe + vacía stripe_subscription_id (migration)
   · reembolsar (sub active stripe/mp) → confirm → POST /:id/refund
        Stripe: invoices→invoicePayments→refunds.create + sub.cancel
        MP: authorized_payments/search → refunds + PreApproval.update(status=cancelled)
          (si cancel falla → warnings, no error)
        → RPC cancel_subscription + log subscriber.refunded · migration: marca refunded_at
  todos con btn disabled + toast success/error + reload
★ errores gateway se agregan como warnings; RPC puede fallar después del gateway (estado inconsistente)
```

### FLOW-18 · Admin: revisar creators
```
PAGE-13 filtros por ?status= (links SSR) · botones Aprobar/Rechazar en pending
  → confirm → PATCH /api/admin/creators {id,status[:=approved|rejected]}
  → requireAdmin · id(400) · status valid(400)
  → update + log creator.approved/rejected → toast → reload (800ms)
  → si falla → toast error + rehabilita
```

---

## 3. ESTADOS GLOBALES NO CONTEMPLADOS / DÉBILES

| ID | Estado | Dónde debería existir | Situación actual |
|---|---|---|---|
| $ST-01 | `past_due` / `incomplete` / `trialing` | AccountMenuItems, mi-cuenta gate, admin | Se muestran "Aún no estás suscripta" — confunde a una pagadora con cobro fallido; no hay aviso de "falló tu pago" |
| $ST-02 | Migrated caducada | Flujo automático | Nada obliga a revocar el acceso tras los 7 días si no paga (no hay job/cron; solo lo resuelve un nuevo pago o acción admin) |
| $ST-03 | Email null en profiles | notificar edición | se filtran (no cuentan como `failed`) y se reporta `noEmail` | **hecho** |
| $ST-04 | Newsletter sync silenciosa | FLOW-01 | éxito visible pero `sender_synced=false` (429 de Sender) y la welcome nunca llega; la usuaria cree que está suscripta al pago | **mitigado 2026-08-22** (retry 429/5xx en `sender.ts` + dashboard `newsletter_pending_sync` + banner resync) |
| $ST-05 | Upload huérfano | FLOW-15 | archivo subido a storage sin edición que lo referencie; no hay limpieza | **hecho 2026-08-23** (cleanup del submit actual vía `removeStoragePaths`/`/api/admin/uploads/cleanup` + barrido histórico `scripts/cleanup-orphan-storage.mjs --real`; primer barrido 23-Ago borró 2 covers pre-i18n huérfanos) |
| $ST-06 | PDF expiró 30min | COMP-12 | "Reintentar" remonta el `<Document>` con la MISMA URL firmada expirada → loop de error sin mensaje real | **hecho 2026-08-22** (`PDFViewer.tsx` bifurca `expired` → `Recargar página` + `lang`) |
| $ST-07 | PDF 401 como JSON | FLOW-12 | Descargar sin sesión/rol → JSON crudo, no redirige a login | **hecho** |

---

## 4. PROBLEMAS POTENCIALES DETECTADOS

**Complejidad**
- **P1 (FLOW-09 webhook MP)**: 3 cadenas de resolución de usuario (external_reference → payer_email → authorized_payments → listUsers paginado), cada una con no-op silencioso. Es el flujo más frágil del sistema; por algo existe el reconcile script.
- **P2 (COMP-18 Suscriptoras)**: dos modelos (profile+subscription y migration sin cuenta) en una sola tabla con stats parciales por página → difícil de leer y de mantener. La lógica de render se construye con strings en el front. *(resuelto 2026-08-22: stats movidas al server `totalActive/totalCanceled/totalNone` globales, `updateStats(rows)` eliminado)*
- **P3 (FLOW-15 EditionForm)**: secuencia sign → PUT → POST con 3 estados intermedios y sin rollback. *(mitigado 2026-08-22: rollback del submit actual con cleanup; sin transacción global)*
- **P4 (FLOW-10 polling)**: timeout sin feedback de red; el único mensaje llega ~60s. *(resuelto 2026-08-22: 3 fallos consecutivos → onNetworkError)*

**Acoplamientos fuertes**
- **P5**: el cierre de sesión/cancelar/gestionar del sitio público dependen del **Navbar (COMP-01)** presente (delegación global de eventos). Si se aísla la página del navbar, se rompen. (El toast ya es compartido: `src/lib/ui.ts` — P6 resuelto 2026-08-14.)
- **P7**: el gate de acceso (isActiveSubscription) se recalcula en 5 lugares distintos (Navbar, revista, mi-cuenta, /api/pdf, AccountMenuItems) con queries repetidas por request → centralizable en middleware/locals. *(resuelto 2026-08-23: `src/middleware.ts:53` centraliza `profile+subscription+hasActiveSub` en `App.Locals`; `src/env.d.ts:4` + consumers `Navbar.astro:23`/`MyAccountPage.astro:27`/`MagazinePage.astro:22`/`api/pdf/[editionId].ts:84` prefieren locals con fallback; `isActiveSubscription` corrige `current_period_end` para migrated)*
- **P8**: handshake de checkout con localStorage (`checkout-intent`) + 2 consumidores (login y suscribirme) + cleanup en mi-cuenta. Funciona, pero es estado global frágil con TTL implícito (24h). *(resuelto 2026-08-23: `getCheckoutIntent` valida `provider/currency` contra whitelist; flush limpia solo tras matchear el botón; dismiss del banner en login borra el intent. Cleanup real vive en `SubscribePage`, no en mi-cuenta — doc corregido)*
- **P9**: dos formularios de newsletter con la misma lógica pero markup duplicado (COMP-02 y COMP-07).

**Loops / sin salida**
- **P10**: reintentar PDF expirado (ver $ST-06) → estado sin salida real salvo reload. *(resuelto 2026-08-22: $ST-06 ahora distingue `expired` → `location.reload()`)*
- **P11**: si `cancel_subscription` RPC falla tras cancelar en el gateway → el user queda "activo" en BD pero cancelado en el proveedor; solo el webhook `subscription.updated` (si viene) re-sincroniza. No hay auto-corrección.

**Bugs latentes / riesgo**
- **P12**: `signUp` con confirm OFF: `check-email-card` es rama muerta (mantener o remover con intención). *(documentado 2026-08-22: `src/components/AuthPage.astro:101` comentado como fallback con confirm OFF)*
- **P13**: `STRIPE_PRICE_ARS` se define pero la UI siempre manda ARS a MP (código de proveedor tolerante, no es bug). *(documentado 2026-08-22: `src/lib/stripe.ts:11` comentado)*
- **P14**: `.astro` con contentType de MIME por archivo en `sign` acepta MIME falso (solo valida header, no magic bytes) — menor. *(documentado 2026-08-22: `src/pages/api/admin/uploads/sign.ts:32` comentado — header-only, upload directo bypasa server)*
- **P15**: `uploadEditionFile` en `storage.ts` es código legacy (documentado en AGENTS.md) — candidato a borrar. *(borrado 2026-08-22: `src/lib/storage.ts:62` eliminado)*

---

## 5. RESUMEN FINAL

**1. Cantidad de páginas:** 18 (10 públicas + 8 admin) · +20 endpoints API.

**2. Componentes interactivos aprox.:** 24 componentes curados (COMP-01→24), que despliegan ~33 elementos interactivos (botones/inputs/carruseles).

**3. Flujos principales:** 18 (FLOW-01→18); los críticos de conversión marcados ★: 01, 06, 07, 08, 09, 10, 12.

**4. Mayores complejidad:** FLOW-09 (webhook MP self-healing) > FLOW-15 (upload edición) > FLOW-17 (operaciones suscriptoras) > COMP-18 (tabla mixta admin).

**5. Más dependencias:** COMP-01 Navbar (auth + dropdown + logout + portal + cancel, afecta a todas las públicas) · COMP-12 PDFViewer (2 páginas + gate `/api/pdf`) · gateway providers (Stripe/MP cargan en create-checkout, portal, cancel, refund, webhooks).

**6. Estados débiles/faltantes:** —. (Resueltos: $ST-01, $ST-02, $ST-03, $ST-07 · FLOW-16 failures accionable · P2 stats globales · P4 polling · $ST-06/P10 expirado · $ST-05 huérfano del submit actual / P3 mitigado · $ST-04 mitigado con retry+dashboard.)

**7. Optimizar primero:** (a) consolidar gate de acceso y rol en middleware (elimina P7 y base para $ST-01/$ST-02); (b) exponer estado de pago del proveedor en mi-cuenta (past_due → CTA "actualizá tu pago"); (c) resolver $ST-04 (reintento Sender con backoff o alerta al admin); (d) cleanup de archivos huérfanos en FLOW-15; (e) aislar la lógica de cuenta (logout/portal/cancel) del Navbar.

**8. Orden de optimización por zonas (sin solaparse):**
```
FASE 1 (cimientos, toca pocas piezas):
   Zona AUTH/CORE  → middleware + locals.subscription + gate único (P7 — hecho 2026-08-23 · $ST-01/$ST-02 ya resueltos antes)
   Zona PAGOS      → expone estado gateway al perfil (past_due/incomplete) + mensajes en mi-cuenta y dropdown (P11 · $ST-01)
FASE 2 (fiabilidad):
   Zona NEWSLETTER → retry Sender con cola/backoff + visibilidad en admin (P9→información compartida, $ST-04 — mitigado 2026-08-22, Fase 1)
   Zona PDF        → mensaje de expiración + link de descarga regenerada (P10 · $ST-06 — hecho 2026-08-22, Fase 1)
FASE 3 (admin):
    Zona EDICIONES → limpieza de uploads huérfanos + estados de submit por paso (P3 · $ST-05 — completo 2026-08-23: cleanup en caliente + barrido histórico)
    Zona SUSCRIPTORAS → refactor de la tabla mixta (P2 — stats al server hecho 2026-08-22) · FLOW-16 failures hecho 2026-08-22
FASE 4 (arquitectura):
   Zona CUENTA  → desacoplar logout/portal/cancel del Navbar (P5 · P6)
   Zona LEGACY  → limpiar ramas muertas (P12, P15, P14 — hecho 2026-08-22) y documentar $ST-03
```

---

## 6. MEJORAS EN BASE A LO ESTUDIADO

Lista priorizada por urgencia (referencias al mapa). Los primeros ítems cuestan plata o acceso real; los últimos son deuda técnica.

> **Resueltas en 2026-08-13** (borradas de la lista): `$ST-02` (expiración migrated valida `current_period_end` en los 6 callers incl. AccountMenuItems) · `$ST-01` (labels por estado + CTA "Actualizar medio de pago" → `/api/portal`) · `P11` (mitigado: guard provider `migrated`/sin id + `providerWarnings` surfaceados en dropdown y panel).
>
> **Resueltas en 2026-08-14** (borradas de la lista): `$ST-07` (PDF sin acceso → 302 a `/iniciar-sesion?redirect=` o `/suscribirme`, sin JSON) · `P5/P6` (toast compartido `src/lib/ui.ts`, auto-crea contenedor; cancelar desde el dropdown del público ya muestra toast de éxito) · `$ST-03` (notify filtra emails null y reporta `noEmail`).
>
> **Resueltas en 2026-08-22** (Fase 1 — nulo/bajo riesgo): `P2` (stats suscriptoras `totalActive/totalCanceled/totalNone` movidos al server `src/lib/admin/subscribers.ts:19`/`src/pages/admin/suscriptoras.astro:137`; ya no se calculan por página — fix `updateStats(rows)` → `data.total*`) · `FLOW-16` (notify devuelve `failures[]` `src/pages/api/admin/editions/[id]/notify.ts:83` + UI accionable `src/pages/admin/ediciones/[id].astro:43` con lista, `Reintentar fallidas` filtrado por `emails` y `Copiar emails`) · `P4` (`src/scripts/checkout-poll.ts:17` + `src/components/MyAccountPage.astro:323` + `src/i18n/ui.ts:miCuenta.processingNetworkError` — tras 3 fallos consecutivos ~9s muestra "Conexión inestable, seguimos intentando..." sin esperar 60s) · `$ST-06/P10` (`src/components/PDFViewer.tsx:37` `lang` + `errType` + `isExpiredError` con `mountTimeRef`/`Recargar página` `location.reload()`; callers `MyAccountPage.astro`/`EditionDetail.astro`/`MagazinePage.astro` pasan `lang`; `src/i18n/ui.ts:miCuenta.pdf*`) · `$ST-05/P3` (`src/lib/storage.ts:removeStoragePaths` + `src/pages/api/admin/uploads/cleanup.ts` + `src/components/admin/EditionForm.astro:323` tracking `uploadedPaths` + `cleanupUploaded()` fire-and-forget en `!res.ok` y `catch`) · `$ST-04` (`src/lib/sender.ts:request` retry 429/5xx con backoff + `src/lib/admin/index.ts:newsletter_pending_sync` + `src/pages/admin/index.astro` banner/card) · `Nivel5` (`P12` `src/components/AuthPage.astro:101` documentado, `P13` `src/lib/stripe.ts:11` documentado, `P15` `src/lib/storage.ts:62` borrado, `P14` `src/pages/api/admin/uploads/sign.ts:32` documentado).
>
> **Resueltas en 2026-08-23** (Fase 1 cimientos): `P7` (`src/middleware.ts:47` gate centralizado `profile+subscription+hasActiveSub` con `isActiveSubscription` incluyendo `current_period_end`; `src/env.d.ts:5` `App.Locals.subscription/hasActiveSub`; consumers `src/components/Navbar.astro:23`/`src/components/MyAccountPage.astro:27`/`src/components/MagazinePage.astro:22`/`src/pages/api/pdf/[editionId].ts:84` prefieren `Astro.locals`/`locals` con fallback; `src/lib/subscription-status.ts:50` `active` coherente) · `P8` (`src/lib/checkout-intent.ts:24` whitelist provider/currency con drop; `src/components/SubscribePage.astro:187` clear solo tras matchear botón — sin pérdida de checkout; `src/components/AuthPage.astro:159` dismiss = opt-out explícito que borra el intent).

### 🟠 Nivel 2 — Muy importante: retención y conversión

**1. `$ST-04` — Falla silenciosa del sync de newsletter** · `FLOW-01`, `api/newsletter.ts`, `sender.ts`
El alta devuelve "¡Gracias por suscribirte!" aunque Sender haya rechazado (429/red) → la welcome nunca llega y la usuaria cree que está suscripta. Es exactamente el síntoma de las 4 emails faltantes de AGENTS "Próximo". (El resync idempotente del handler `existing` ya existe; falta backoff/cola para el alta inicial que falla.)
*Cambio:* reintento con backoff, o aviso explícito, o cola de resync + visibilidad admin.
*Esfuerzo:* medio. · Estado: **mitigado 2026-08-22** (`src/lib/sender.ts:request` retry 429/5xx máx 2 con `retry-after`; dashboard `src/lib/admin/index.ts:newsletter_pending_sync` visible en `src/pages/admin/index.astro`; reintento definitivo sigue vía `POST /api/newsletter` con mismo email (23505 resynced) o `scripts/resync-newsletters.mjs`).

### 🟡 Nivel 3 — Correctitud de datos / admin

**2. `P2` — Stats de suscriptoras calculadas solo de la página actual** · `COMP-18`, `suscriptoras.astro`
Activas/canceladas/sin-sub se cuentan sobre las 20 filas de la página, no el total real → números engañosos en el dashboard-contact.
*Cambio:* mover esos counts al server (como ya se hace con `totalPending`/`totalRefunded`).
*Esfuerzo:* bajo. · Estado: **hecho 2026-08-22**.

**3. `$ST-05` — Uploads huérfanos** · `FLOW-15`, `EditionForm.astro`
Si el PUT sube a Storage y luego el POST/PATCH falla, el archivo queda huérfano para siempre.
*Cambio:* limpiar por path si la edición no se creó / no referencia el path.
*Esfuerzo:* medio. · Estado: **hecho 2026-08-23** (cleanup en caliente `removeStoragePaths` + `/api/admin/uploads/cleanup`; barrido histórico `scripts/cleanup-orphan-storage.mjs [--real]`).

**4. `FLOW-16` — Notificación sin lista de fallidas accionable** · `notify.ts`
Se reporta "N fallaron" pero no hay retry ni lista.
*Cambio:* devolver las fallidas (email+error) y permitir reintento.
*Esfuerzo:* bajo-medio. · Estado: **hecho 2026-08-22**.

### 🟢 Nivel 4 — Robustez de UX

**5. `$ST-06` — "Reintentar" no resuelve PDF expirado** · `PDFViewer.tsx`
La URL firmada (30 min) expira y el botón remonta el `<Document>` con la misma URL → loop de error sin mensaje real.
*Cambio:* mensaje de expiración + regenerar URL (o instruir recarga).
*Esfuerzo:* medio. · Estado: **hecho 2026-08-22** (`src/components/PDFViewer.tsx:37` `isExpiredError` + `errType` `expired` → `Recargar página`; timeout separado).

**6. `P4` — Polling sin feedback de red** · `checkout-poll.ts`
Si el fetch falla en silencio se reintenta sin avisar; el único mensaje llega a los ~60s de timeout.
*Cambio:* mensaje/simple tras N intentos fallidos consecutivos.
*Esfuerzo:* bajo. · Estado: **hecho 2026-08-22** (`src/scripts/checkout-poll.ts:12` threshold 3 + `onNetworkError`, `src/i18n/ui.ts:miCuenta.processingNetworkError`).

**7. `P7` — Gate de acceso repetido en 5 lugares** · Navbar, revista, mi-cuenta, `/api/pdf`, AccountMenuItems
Queries idénticas por request y la regla `active|migrated` vive dispersa (riesgo de divergencia futura). El helper `isActiveSubscription` ya es la fuente única de la regla; falta consolidar las queries en middleware/locals.
*Cambio:* consolidar en middleware/locals como fuente única.
*Esfuerzo:* medio (toca varias páginas). · Estado: **hecho 2026-08-23** (`src/middleware.ts:47` + `src/env.d.ts:5` `subscription/hasActiveSub`; consumers con preferencia locals).

**8. `P8` — Handshake de checkout con `localStorage`** · `checkout-intent.ts`
Estado global frágil con 2 consumidores y TTL implícito. No es urgente, pero es candidato a simplificarse al tocar pagos.
*Esfuerzo:* medio. · Estado: **hecho 2026-08-23** (`src/lib/checkout-intent.ts:24` whitelist provider/currency + `src/components/SubscribePage.astro:187` clear-post-match + `src/components/AuthPage.astro:159` dismiss borra intent).

### ⚪ Nivel 5 — Deuda técnica / limpieza (sin urgencia)

**9. `P12`** — `check-email-card` rama muerta (confirm OFF) — decidir remover o documentar. · **hecho 2026-08-22** (documentado `src/components/AuthPage.astro:101` como fallback).
**10. `P13`** — `STRIPE_PRICE_ARS` definido pero no usado en UI. · **hecho 2026-08-22** (documentado `src/lib/stripe.ts:11` tolerante).
**11. `P15`** — `uploadEditionFile` legacy en `storage.ts` — borrar. · **hecho 2026-08-22** (borrado `src/lib/storage.ts:62`).
**12. `P14`** — `sign` solo valida MIME por header, no magic bytes — menor. · **hecho 2026-08-22** (documentado `src/pages/api/admin/uploads/sign.ts:32` header-only).

### Cómo trabajar estos ítems

Se abordan **uno a la vez**. Cada mejora arranca actualizando su línea `· Estado:` a `en progreso`, y al cerrarla se cambia a `hecho` (con fecha si se quiere), pasando el ítem a la nota "Resueltas" del encabezado. Estado: `pending` / `en progreso` / `hecho`.