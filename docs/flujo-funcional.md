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
  POST /api/admin/editions · GET/PATCH/DELETE /api/admin/editions/:id · POST .../notify
  GET  /api/admin/subscribers · export · migrate · :id/cancel · :id/refund
  GET/PATCH /api/admin/creators
```

---

## 2. FLUJOS FUNCIONALES CON RAMIFICACIONES

### FLOW-01 · Newsletter gratis  ★core-conversión
```
[Usuaria] ingresá email → submit COMP-02/07
  → handler: btn.disabled=true (in-flight) + aria-live
  → fetch POST /api/newsletter {email}
     → rate-limit IP 5/min ── excedido → 429 "Demasiados intentos" → msg error → reintenta
     → validación email (regex) ── inválido → 400
     → insert newsletters
        ── OK → syncSenderForEmail(email)
             ├─ Sender OK → sender_synced=true → {ok:true} → "¡Gracias por suscribirte!" + limpia input
             └─ Sender FALLA (429 cuota/red) → sender_synced=false + guarda sender_sync_error → {ok:true} ← ★
                  SILENCIOSO: user ve éxito pero la welcome NUNCA llega (sintoma: las 4 faltantes de AGENTS "Próximo")
        ── 23505 (ya existe) → lee sender_synced
             ├─ false → re-alta Sender → {existing:true, resynced:true} → "te reenviamos la bienvenida"
             └─ true  → {existing:true, resynced:false} → "Ya estás suscripta"
        ── otro error → 500 → msg "Error al suscribirte"
  → finally: btn re-habilitado
ESTADOS: idle / sending(disabled) / success / existing / resynced / connection-error / server-error
DEPENDENCIA: Sender grupo newsletter-gratuito (automatización welcome) · tabla newsletters · rate_limits
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

### FLOW-10 · Polling post-pago  ⭐
```
Gatillo: PAGE-06 SSR con outcome success|pending + panel "Procesando..." (sin sub aún)
  → startCheckoutPoll cada 3s, máx 20 intentos (~60s)
     → GET /api/subscription-status (Bearer token) → subscription.status
       ├─ active|migrated → reload (SSR re-renderiza panel con acceso)
       └─ no → reintenta
     ├─ timeout → msg "Todavía estamos confirmando tu pago. Si se demora más de un minuto, actualizá la página."
     └─ fetch error → silencioso, reintenta (sin feedback de red)
```
> Lag real: MP devuelve a back_url antes de que el webhook active → el poll cubre ese hueco.

### FLOW-11 · Cancelar suscripción (usuario)  ⭐
```
Dropdown → "Cancelar suscripción" → showConfirm ("perderás el acceso al final del período")
 → POST /api/cancel-subscription
   → requireUser · busca sub status=active del user (404 si no)
   → provider.cancelSubscription (Stripe sub.cancel / MP preapproval status=cancelled)
       └─ error del gateway → providerWarnings (no falla el flujo)
   → RPC cancel_subscription (BD local; si falla → 500 y NO revierte el cancel del gateway ★)
 → {ok} → toast "Suscripción cancelada" + si warnings → alert() con detalle + reload
DEPENDENCIA: NAVBAR/AccountMenuItems debe estar presente; usa window.adminToast (lo expone AdminLayout, no el Layout público ★)
```
> Detección: `adminToast` se define en AdminLayout, pero el cancel-sub en dropdown del sitio público lo invoca `(window as any).adminToast` — en el sitio público ese global NO existe → toast silencioso. El flujo igual recarga, no rompe; feedback de éxito solo por reload.

### FLOW-12 · Acceso/descarga PDF  ⭐
```
GET /api/pdf/:id
  → editionId int · edition existe (404) · pdf_url existe (404)
  → storagePath extraíble → 302 directo a URL pública
  → user? → profile admin → allow · subscriber+sub active|migrated → allow
  → NO user o sin acceso → SI featured o kind=free → allow (de todos modos público)
  └─ else → 401 JSON (★ navegación directa a un JSON, sin página amable)
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

### FLOW-15 · Admin: CRUD ediciones + upload ⭐⭐
```
COMP-23 (PAGE-17 create / PAGE-18 edit)
  → kind radio magazine|free (synckind: toggle campos; free exige pdf y omite portada/featured/número)
  → submit (btn "Creando..." disabled)
    → 1) upload directo a Supabase Storage (bypassa límite 4.5MB de Vercel):
       POST /api/admin/uploads/sign {kind,filename,contentType,size,editionNumber?,slug?}
         → requireAdmin · kind(400) · filename(400) · mime FILE_RULES(400) · size>max(400) · cover sin número(400)
         → createSignedUploadUrl(path,{upsert:true}) → {signedUrl, publicUrl}
       → PUT directo al signedUrl (solo Content-Type) ── fail → throw → msg error
       → fd.set(cover_url/pdf_url, publicUrl)
    → 2) POST /api/admin/editions | PATCH /api/admin/editions/:id  (FormData SIN files)
       POST: kind · cover_url obligatorio si magazine(400) · validateEditionInput(400)
              · número duplicado → 409 · featured→ unset featured previa
       PATCH: fallback a current · nº duplicado ≠self → 409 · featured new → unset
    → ok → toast + redirect /admin/ediciones
  → DELETE (solo edit): confirm → DELETE → redirect
★ HUECHOS: si el PUT sube el archivo y luego el POST/PATCH/validation falla, queda archivo huérfano
  en storage sin registro → nunca se limpia.
```

### FLOW-16 · Admin: Notificar edición
```
PAGE-18 botón → confirm → POST /api/admin/editions/:id/notify
  → requireAdmin · edition(404) · kind!=magazine o sin cover → {notified:0}
  → profiles role=subscriber → sendNewEditionEmail (Sender /message/send) uno a uno
  → {notified, total, failed}
  → msg "Notificadas: X de Y (N fallaron)" · toast
★ sin retry por email, sin lista de destinatarias fallidas accionable
```

### FLOW-17 · Admin: suscriptoras (la página más densa)
```
PAGE-12 → GET /api/admin/subscribers?page&status&search&pageSize(=20 default)
  → mezcla profiles(con sub) + subscriber_migrations sin cuenta (pend. registro) con estados Stripe en vivo
  → stats: activas/canceladas/sin-sub calculadas SOLO de la página actual ★ · pend/refund del server (total global)
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
| $ST-03 | Email null en profiles | notificar edición | select email → emails null intentan enviarse y cuentan como `failed` sin explicación; quien no tiene email no se notifica y nadie lo sabe |
| $ST-04 | Newsletter sync silenciosa | FLOW-01 | éxito visible pero `sender_synced=false` (429 de Sender) y la welcome nunca llega; la usuaria cree que está suscripta al pago |
| $ST-05 | Upload huérfano | FLOW-15 | archivo subido a storage sin edición que lo referencie; no hay limpieza |
| $ST-06 | PDF expiró 30min | COMP-12 | "Reintentar" remonta el `<Document>` con la MISMA URL firmada expirada → loop de error sin mensaje real |
| $ST-07 | PDF 401 como JSON | FLOW-12 | Descargar sin sesión/rol → JSON crudo, no redirige a login | **hecho** |

---

## 4. PROBLEMAS POTENCIALES DETECTADOS

**Complejidad**
- **P1 (FLOW-09 webhook MP)**: 3 cadenas de resolución de usuario (external_reference → payer_email → authorized_payments → listUsers paginado), cada una con no-op silencioso. Es el flujo más frágil del sistema; por algo existe el reconcile script.
- **P2 (COMP-18 Suscriptoras)**: dos modelos (profile+subscription y migration sin cuenta) en una sola tabla con stats parciales por página → difícil de leer y de mantener. La lógica de render se construye con strings en el front.
- **P3 (FLOW-15 EditionForm)**: secuencia sign → PUT → POST con 3 estados intermedios y sin rollback.
- **P4 (FLOW-10 polling)**: timeout sin feedback de red; el único mensaje llega ~60s.

**Acoplamientos fuertes**
- **P5**: el cierre de sesión/cancelar/gestionar del sitio público dependen del **Navbar (COMP-01)** presente (delegación global de eventos). Si se aísla la página del navbar, se rompen. Además `(window).adminToast` no existe fuera del admin (P6).
- **P7**: el gate de acceso (isActiveSubscription) se recalcula en 5 lugares distintos (Navbar, revista, mi-cuenta, /api/pdf, AccountMenuItems) con queries repetidas por request → centralizable en middleware/locals.
- **P8**: handshake de checkout con localStorage (`checkout-intent`) + 2 consumidores (login y suscribirme) + cleanup en mi-cuenta. Funciona, pero es estado global frágil con TTL implícito (24h).
- **P9**: dos formularios de newsletter con la misma lógica pero markup duplicado (COMP-02 y COMP-07).

**Loops / sin salida**
- **P10**: reintentar PDF expirado (ver $ST-06) → estado sin salida real salvo reload.
- **P11**: si `cancel_subscription` RPC falla tras cancelar en el gateway → el user queda "activo" en BD pero cancelado en el proveedor; solo el webhook `subscription.updated` (si viene) re-sincroniza. No hay auto-corrección.

**Bugs latentes / riesgo**
- **P12**: `signUp` con confirm OFF: `check-email-card` es rama muerta (mantener o remover con intención).
- **P13**: `STRIPE_PRICE_ARS` se define pero la UI siempre manda ARS a MP (código de proveedor tolerante, no es bug).
- **P14**: `.astro` con contentType de MIME por archivo en `sign` acepta MIME falso (solo valida header, no magic bytes) — menor.
- **P15**: `uploadEditionFile` en `storage.ts` es código legacy (documentado en AGENTS.md) — candidato a borrar.

---

## 5. RESUMEN FINAL

**1. Cantidad de páginas:** 18 (10 públicas + 8 admin) · +20 endpoints API.

**2. Componentes interactivos aprox.:** 24 componentes curados (COMP-01→24), que despliegan ~33 elementos interactivos (botones/inputs/carruseles).

**3. Flujos principales:** 18 (FLOW-01→18); los críticos de conversión marcados ★: 01, 06, 07, 08, 09, 10, 12.

**4. Mayores complejidad:** FLOW-09 (webhook MP self-healing) > FLOW-15 (upload edición) > FLOW-17 (operaciones suscriptoras) > COMP-18 (tabla mixta admin).

**5. Más dependencias:** COMP-01 Navbar (auth + dropdown + logout + portal + cancel, afecta a todas las públicas) · COMP-12 PDFViewer (2 páginas + gate `/api/pdf`) · gateway providers (Stripe/MP cargan en create-checkout, portal, cancel, refund, webhooks).

**6. Estados débiles/faltantes:** $ST-01 past_due·incomplete·trialing · $ST-02 caducidad migrated · $ST-03 emails null · $ST-04 newsletter sync silenciosa · $ST-06 PDF expirado · $ST-07 401 sin landing.

**7. Optimizar primero:** (a) consolidar gate de acceso y rol en middleware (elimina P7 y base para $ST-01/$ST-02); (b) exponer estado de pago del proveedor en mi-cuenta (past_due → CTA "actualizá tu pago"); (c) resolver $ST-04 (reintento Sender con backoff o alerta al admin); (d) cleanup de archivos huérfanos en FLOW-15; (e) aislar la lógica de cuenta (logout/portal/cancel) del Navbar.

**8. Orden de optimización por zonas (sin solaparse):**
```
FASE 1 (cimientos, toca pocas piezas):
  Zona AUTH/CORE  → middleware + locals.subscription + gate único (P7 · $ST-01/$ST-02)
  Zona PAGOS      → expone estado gateway al perfil (past_due/incomplete) + mensajes en mi-cuenta y dropdown (P11 · $ST-01)
FASE 2 (fiabilidad):
  Zona NEWSLETTER → retry Sender con cola/backoff + visibilidad en admin (P9→información compartida, $ST-04)
  Zona PDF        → mensaje de expiración + link de descarga regenerada (P10 · $ST-06)
FASE 3 (admin):
  Zona EDICIONES → limpieza de uploads huérfanos + estados de submit por paso (P3 · $ST-05)
  Zona SUSCRIPTORAS → refactor de la tabla mixta (P2) + mover stats al server (no por página)
FASE 4 (arquitectura):
  Zona CUENTA  → desacoplar logout/portal/cancel del Navbar (P5 · P6)
  Zona LEGACY  → limpiar ramas muertas (P12, P15, P14) y documentar $ST-03
```

---

## 6. MEJORAS EN BASE A LO ESTUDIADO

Lista priorizada por urgencia (referencias al mapa). Los primeros ítems cuestan plata o acceso real; los últimos son deuda técnica.

> **Resueltas en 2026-08-13** (borradas de la lista): `$ST-02` (expiración migrated valida `current_period_end` en los 6 callers incl. AccountMenuItems) · `$ST-01` (labels por estado + CTA "Actualizar medio de pago" → `/api/portal`) · `P11` (mitigado: guard provider `migrated`/sin id + `providerWarnings` surfaceados en dropdown y panel).

### 🔴 Nivel 1 — Urgente: pérdida de ingresos o acceso incorrecto

**1. `$ST-07` — PDF 401 devuelve JSON crudo** · `api/pdf/[editionId].ts`
Descargar sin sesión/rol muestra un JSON plano en el navegador, sin redirigir a login ni explicación.
*Cambio:* responder 302 a `/iniciar-sesion?redirect=...` cuando aplica.
*Esfuerzo:* bajo. · Estado: pendiente.

### 🟠 Nivel 2 — Muy importante: retención y conversión

**2. `$ST-04` — Falla silenciosa del sync de newsletter** · `FLOW-01`, `api/newsletter.ts`, `sender.ts`
El alta devuelve "¡Gracias por suscribirte!" aunque Sender haya rechazado (429/red) → la welcome nunca llega y la usuaria cree que está suscripta. Es exactamente el síntoma de las 4 emails faltantes de AGENTS "Próximo".
*Cambio:* reintento con backoff, o aviso explícito, o cola de resync + visibilidad admin.
*Esfuerzo:* medio. · Estado: pendiente.

**3. `P5`/`P6` — Cancelar desde el dropdown no muestra feedback** · `Navbar.astro`
`cancelSub` usa `window.adminToast`, que solo existe en el layout de admin → en el sitio público el toast es nulo; el éxito solo se ve con el reload. El usuario queda sin confirmación inmediata de una acción importante.
*Cambio:* mover toast/confirm a un helper global del Layout público (o feedback inline).
*Esfuerzo:* bajo. · Estado: pendiente.

**4. `$ST-03` — Emails `null` en notificación de edición** · `FLOW-16`, `notify.ts`
Suscriptoras sin email en `profiles` cuentan como `failed` sin explicación; no se sabe a quién avisar ni por qué.
*Cambio:* filtrar nulos, reportar "sin email: N".
*Esfuerzo:* muy bajo. · Estado: pendiente.

### 🟡 Nivel 3 — Correctitud de datos / admin

**5. `P2` — Stats de suscriptoras calculadas solo de la página actual** · `COMP-18`, `suscriptoras.astro`
Activas/canceladas/sin-sub se cuentan sobre las 20 filas de la página, no el total real → números engañosos en el dashboard-contact.
*Cambio:* mover esos counts al server (como ya se hace con `totalPending`/`totalRefunded`).
*Esfuerzo:* bajo. · Estado: pendiente.

**6. `$ST-05` — Uploads huérfanos** · `FLOW-15`, `EditionForm.astro`
Si el PUT sube a Storage y luego el POST/PATCH falla, el archivo queda huérfano para siempre.
*Cambio:* limpiar por path si la edición no se creó / no referencia el path.
*Esfuerzo:* medio. · Estado: pendiente.

**7. `FLOW-16` — Notificación sin lista de fallidas accionable** · `notify.ts`
Se reporta "N fallaron" pero no hay retry ni lista.
*Cambio:* devolver las fallidas (email+error) y permitir reintento.
*Esfuerzo:* bajo-medio. · Estado: pendiente.

### 🟢 Nivel 4 — Robustez de UX

**8. `$ST-06` — "Reintentar" no resuelve PDF expirado** · `PDFViewer.tsx`
La URL firmada (30 min) expira y el botón remonta el `<Document>` con la misma URL → loop de error sin mensaje real.
*Cambio:* mensaje de expiración + regenerar URL (o instruir recarga).
*Esfuerzo:* medio. · Estado: pendiente.

**9. `P4` — Polling sin feedback de red** · `checkout-poll.ts`
Si el fetch falla en silencio se reintenta sin avisar; el único mensaje llega a los ~60s de timeout.
*Cambio:* mensaje/simple tras N intentos fallidos consecutivos.
*Esfuerzo:* bajo. · Estado: pendiente.

**10. `P7` — Gate de acceso repetido en 5 lugares** · Navbar, revista, mi-cuenta, `/api/pdf`, AccountMenuItems
Queries idénticas por request y la regla `active|migrated` vive dispersa (riesgo de divergencia futura).
*Cambio:* consolidar en middleware/locals como fuente única.
*Esfuerzo:* medio (toca varias páginas). · Estado: pendiente.

**11. `P8` — Handshake de checkout con `localStorage`** · `checkout-intent.ts`
Estado global frágil con 2 consumidores y TTL implícito. No es urgente, pero es candidato a simplificarse al tocar pagos.
*Esfuerzo:* medio. · Estado: pendiente.

### ⚪ Nivel 5 — Deuda técnica / limpieza (sin urgencia)

**12. `P12`** — `check-email-card` rama muerta (confirm OFF) — decidir remover o documentar.
**13. `P13`** — `STRIPE_PRICE_ARS` definido pero no usado en UI.
**14. `P15`** — `uploadEditionFile` legacy en `storage.ts` — borrar.
**15. `P14`** — `sign` solo valida MIME por header, no magic bytes — menor.

### Cómo trabajar estos ítems

Se abordan **uno a la vez**. Cada mejora arranca actualizando su línea `· Estado:` a `en progreso`, y al cerrarla se cambia a `hecho` (con fecha si se quiere), pasando el ítem a la nota "Resueltas" del encabezado. Estado: `pending` / `en progreso` / `hecho`.