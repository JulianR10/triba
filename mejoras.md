# Mejoras pendientes

> **Roles de docs:**
> - `README.md` — onboarding, setup, deploy, scripts.
> - `AGENTS.md` — arquitectura, componentes, convenciones, quirks, glosario.
> - `mejoras.md` (este archivo) — trabajo pendiente con contexto, decisiones, tier. Ephemeral.

---

## 🔴 Crítico

### 1. View Transitions: scripts sin `astro:page-load`
Páginas como `mi-cuenta.astro` tienen handlers JS (feedback, cancelación, portal) que se enganchan al `<script>` de la página, pero sin listener de `astro:page-load`. Con `<ClientRouter />` activo, si el user navega desde otra página vía View Transition, los handlers no se re-enganchan.

**Acción:** envolver todo setup de handlers en `function setup() { ... }` + llamarla al inicio y en `document.addEventListener("astro:page-load", setup)`. Aplica a: `mi-cuenta.astro`, `iniciar-sesion.astro`, y cualquier página con `<script>` inline.

---

### 2. Tests + CI (Playwright E2E + GitHub Actions)
Cero tests en un sitio de suscripción es un riesgo estructural.

**Acción:**
- **Playwright E2E** del happy path crítico: signup → confirmar email (o auto-login) → `/suscribirme` → click Stripe → mock del checkout → webhook fires → `mi-cuenta` muestra "Suscripción activa". Un test, 80% del valor.
- **Unit tests** de los webhooks (`/api/webhook/stripe`, `/api/webhook/mercadopago`) con inputs reales de sandbox, mockeando Supabase.
- **Unit/integration** de `/api/feedback` cubriendo el rate limit (2 seguidos → 429).
- **GitHub Actions** que corra `npm ci` → `npm run build` → tests → lint en cada PR.

---

### 3. Error tracking con Sentry
Hoy si algo revienta en producción, te enterás cuando un user manda un mail.

**Acción:** Sentry SDK para Node (server) y browser (cliente). 5 min de setup. Incluir source maps.

---

### 4. Rate limiting en endpoints de auth
Login, signup, password reset, checkout, feedback. Sin rate limit un bot puede hacer brute force.

**Acción:** middleware Astro + Map en memoria para volumen bajo. Aplica a: `/api/create-checkout`, sign-in, sign-up, password reset. Ya hay rate limit en `/api/feedback` (60s por user).

---

### 5. Type-safety end-to-end con Supabase (`supabase gen types`)
Hoy `subscription`, `profile`, `edition` se castean con `any` o se tipan ad-hoc.

**Acción:** correr `supabase gen types typescript --linked > src/lib/database.types.ts` y reemplazar todos los `any` por `Database['public']['Tables']['subscriptions']['Row']` etc. 30 min de setup.

---

## 🟡 Importante

### 6. Subscriber panel: PDF link a `"#"` cuando no hay PDF
`mi-cuenta.astro:181` — `featured.pdf` es `"#"` si `pdf_url` es null. El link navega a top of page sin descargar nada.

**Acción:** no renderizar el botón "Descargar PDF" cuando `pdf_url` es null/falsy.

---

### 7. Subscriber panel: "Ver más" sin href
`mi-cuenta.astro:221` — `<Button>` sin `href` renderiza un `<button>` que no hace nada.

**Acción:** linkear a `/revista` o eliminar el componente.

---

### 8. Subscriber panel: modal de cancelación sin a11y
El modal (`mi-cuenta.astro:152-164`) no tiene `role="dialog"`, `aria-modal`, `aria-labelledby`, ni cierra con Escape. Además duplica lógica que ya existe en el admin (`showConfirm()`).

**Acción:** reemplazar el modal custom por el sistema unificado `showConfirm()` de `AdminUI.ts` (que ya soporta Escape, overlay click, y aria). O migrar la función a un lugar compartido (`src/lib/ui.ts`) y usarla desde ambos paneles.

---

### 9. Subscriber panel: auto-reload post-checkout
`mi-cuenta.astro:457-465` — recarga la página automáticamente a los 3.5s si la sub no está activa aún. Experiencia confusa.

**Acción:** reemplazar con polling suave (fetch cada 5s, máx 2 min, al estado de la sub). Si se activa, mostrar banner sin recargar. Si expira el tiempo, mostrar "Todavía estamos procesando tu pago. Te avisaremos por email."

---

### 10. Subscriber panel: fechas visibles en card de suscripción
El card de "Suscripción activa" no muestra `current_period_end` (vencimiento) ni desde cuándo es suscriptora.

**Acción:** agregar al card la fecha de vencimiento y "suscriptora desde" con formato local.

---

### 11. Subscriber panel: feedback sin contador de caracteres
El textarea permite hasta 2000 chars (server-side) pero no hay indicación visible.

**Acción:** agregar contador de caracteres debajo del textarea, deshabilitar botón si está vacío/excede límite.

---

### 12. Headers de seguridad + CSP
Astro middleware ya setea CSP básico, HSTS, etc. Verificar que cubra todos los orígenes (Supabase Storage para imágenes de portadas, Stripe/MP para checkout, Google Fonts). 1-2 horas.

---

### 13. Imágenes optimizadas con `<Image>` de Astro
Todas las portadas se sirven como `<img>` crudo. Migrar a `<Image>` de Astro: AVIF/WebP responsive, `loading="lazy"`, `width`/`height` fijos.

---

### 14. Analytics de producto (Plausible o Umami)
No hay analytics. No se sabe de dónde vienen los signups, dónde abandonan checkout, qué portada miran más. Plausible o Umami son self-hosted/privacy-friendly.

---

### 15. Sitemap + structured data
- `@astrojs/sitemap` (5 min).
- JSON-LD de `Article` por edición.
- Open Graph image dinámica por edición (template con portada + título).

---

### 16. CI/CD con GitHub Actions
Workflow: en cada PR correr `npm ci` → `npm run build` → tests → lint. En merge a main: deploy.

---

### 17. Logging estructurado con Pino
Hoy `console.error("mercadopago webhook error:", err)`. Pino con JSON logs: cada log es un objeto con `user_id`, `payment_id`, `request_id`, `level`, `msg`. Cuando un user reporta un problema, buscás por `user_id` y tenés todo el trail.

---

### 18. Terms of Service (`/terminos`)
Tenés `/privacidad` pero no `/terminos`. Un sitio de suscripción sin ToS es un riesgo legal. Esqueleto + integración con checkbox en checkout.

---

## 🟢 Media / Polish

### 19. Subscriber panel: sección "Mi perfil"
Agregar email, fecha de registro, preferencias de newsletter, opción para darse de baja del newsletter gratuito.

### 20. Subscriber panel: skeleton de carga
Mientras SSR resuelve profile + subscription + editions, mostrar un skeleton minimal en lugar de blank page.

### 21. Subscriber panel: "processing" polling suave
Reemplazar el auto-reload brusco por fetch periódico a la sesión para detectar cuándo la sub se activa.

### 22. Subscriber panel: provider warnings en cancelación
El endpoint `/api/cancel-subscription` devuelve `providerWarnings` pero el frontend no los muestra.

### 23. Subscriber panel: "Leer aquí" solo si hay páginas
Si `featuredPages` está vacío, el visor no se renderiza pero el botón "Leer aquí" sigue apareciendo.

### 24. ESLint + Prettier + pre-commit hooks (Husky)
No hay lint config en el repo. ESLint flat config + Prettier + Husky + lint-staged.

### 25. Idempotencia real en webhooks
El `upsert` con `onConflict` ayuda, pero un evento procesado parcialmente que se reintenta puede dejar inconsistencia. Tabla `webhook_events` para dedup garantizado.

### 26. Background jobs (Inngest / Trigger.dev)
"Bienvenida 5 min después del signup", "recordatorio 3 días antes de renovación", "encuesta de churn". Esperar a emails transaccionales primero.

### 27. Referral program / gift subscriptions
"Invitá a una amiga, ambas reciben 1 mes gratis". Tabla `referrals`. Crecimiento orgánico para revista comunitaria.

### 28. Emails transaccionales con Nodemailer
Newsletter: confirmación, bienvenida post-suscripción, notificación de nueva edición. Postulación de creator → aviso a admin. Feedback nuevo → aviso a admin.

### 29. A11y audit
Pasar home y `/mi-cuenta` por axe DevTools. Focus rings, contraste, labels en iconos, modales con focus trap.

### 30. Diagrama de arquitectura en `AGENTS.md`
Mermaid flowchart: usuario → Astro → Supabase → Stripe/MP → webhook → Supabase. Onboarding en 1 minuto.

---

## Diferido (requieren webhooks de MP)

### Migrar Mercado Pago a PreApproval (suscripción real)
`create-checkout` hoy crea una `Preference` (pago único). El webhook otorga 30 días por cada pago manual. No hay billing recurrente en MP. Además, `cancel-subscription` llama a `PreApproval.update()` con un payment ID, pero la API espera un preapproval ID — falla.

**Acción:** migrar el flujo completo de MP a `PreApproval` (suscripción real con billing recurrente), actualizar el webhook para escuchar eventos `subscription_preapproval.*`, y pasar el preapproval ID correcto al cancelar.

### Webhook MP: configurar secret y validar manifest en sandbox
Implementación lista en `src/pages/api/webhook/mercadopago.ts` con HMAC-SHA256, fail-closed. Falta configurar el secret en MP Dashboard y testear en sandbox.

---

## Ya resueltos (histórico)

- **Admin UI completo** — dashboard, CRUD ediciones con upload a Supabase Storage, suscriptoras, feedback, creators, activity log, paginación, search, export CSV, toasts, confirmaciones modales. Migraciones `005_admin_support.sql` y `006_admin_audit_log.sql`.
- **AdminLayout con HTML completo** — `<html>`, `<head>`, `<body>` para que CSS se cargue correctamente.
- **Signup UI** — toggle Login/Crear cuenta en `/iniciar-sesion`.
- **Verificación HMAC-SHA256 webhook MP** — fail-closed, manifest aislado.
- **Stripe Customer Portal** — botón "Gestionar suscripción" en `/mi-cuenta`.
- **Rate limit en `/api/feedback`** — 60s entre envíos por user.
- **Unificación env vars a `PUBLIC_*`** — Supabase URL y anon key.
- **Stripe `apiVersion` actualizado** a `"2026-06-24.dahlia"`.
- **CSP en middleware** — Content-Security-Policy con dominios de Stripe, Supabase, Google Fonts.
- **Runbook de ediciones** en `AGENTS.md` — cómo crear una edición desde el admin.
- **Audit log de acciones admin** — tabla `admin_audit_log` con logging en todas las API routes admin.
- **Overflow-x-auto + touch targets** en tablas admin para mobile.

---

## Menor (no bloqueante)

- **Logo real y assets finales de la diseñadora** — reemplazar logo actual y SVGs placeholder por los definitivos.
