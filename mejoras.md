# Mejoras pendientes

> **Roles de docs:**
> - `README.md` — onboarding, setup, deploy, scripts.
> - `AGENTS.md` — arquitectura, componentes, convenciones, quirks, glosario.
> - `mejoras.md` (este archivo) — trabajo pendiente con contexto, decisiones, tier. Ephemeral.

---

## 🔴 Crítico

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

## 🟡 Importante

### 13. Imágenes optimizadas con `<Image>` de Astro
Todas las portadas se sirven como `<img>` crudo. Migrar a `<Image>` de Astro: AVIF/WebP responsive, `loading="lazy"`, `width`/`height` fijos.

---

### 14. Analytics de producto (Plausible o Umami)
No hay analytics. No se sabe de dónde vienen los signups, dónde abandonan checkout, qué portada miran más. Plausible o Umami son self-hosted/privacy-friendly.

---

### 16. CI/CD con GitHub Actions
Workflow: en cada PR correr `npm ci` → `npm run build` → tests → lint. En merge a main: deploy.

---

## 🟢 Media / Polish

### 19. Subscriber panel: sección "Mi perfil"
Agregar email, fecha de registro, preferencias de newsletter, opción para darse de baja del newsletter gratuito.

### 20. Subscriber panel: skeleton de carga
Mientras SSR resuelve profile + subscription + editions, mostrar un skeleton minimal en lugar de blank page.

### 21. Subscriber panel: "processing" polling suave
Reemplazar el auto-reload brusco por fetch periódico a la sesión para detectar cuándo la sub se activa.

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

---

## Menor (no bloqueante)

- **Logo real y assets finales de la diseñadora** — reemplazar logo actual y SVGs placeholder por los definitivos.
