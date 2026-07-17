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

### 3. ✅ Error tracking con Sentry
SDK integrado (`@sentry/astro`), server + browser.

**Pendiente en producción:**
- `SENTRY_DSN` en `.env` con el DSN real de sentry.io
- `SENTRY_AUTH_TOKEN` en `.env` para upload de source maps (opcional)

---

## 🟡 Importante

### 13. Imágenes optimizadas con `<Image>` de Astro
Todas las portadas se sirven como `<img>` crudo. Migrar a `<Image>` de Astro: AVIF/WebP responsive, `loading="lazy"`, `width`/`height` fijos.

---

### 14. Analytics de producto (Plausible o Umami)
No hay analytics. No se sabe de dónde vienen los signups, dónde abandonan checkout, qué portada miran más. Plausible o Umami son self-hosted/privacy-friendly.

---

### 16. ✅ CI/CD
Archivos en `.github/workflows/` listos:
- `ci.yml` — build en cada PR
- `deploy.yml` — build en push a main

**Hostinger Git Deploy** pendiente de configurar desde hPanel.

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

---

## Checklist producción

Cosas que requieren acción manual antes o después del deploy.

### Sentry

| Variable | Dónde conseguirla |
|---|---|
| `SENTRY_DSN` | [sentry.io](https://sentry.io) → Projects → Triba → Client Keys (DSN) |
| `SENTRY_AUTH_TOKEN` | [sentry.io](https://sentry.io) → Settings → Auth Tokens → Create new token con scope `project:releases` y `org:read` |

**Pasos:**
1. Crear proyecto en Sentry (elegí "Astro" como framework)
2. Copiar el DSN al `.env` del servidor
3. (Opcional) Generar auth token y agregarlo para que suba source maps en el build
4. Hacer un deploy → provocar un error a propósito → confirmar que aparece en Sentry
