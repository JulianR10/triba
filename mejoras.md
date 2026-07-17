# Mejoras — Triba

Lista priorizada de tareas para dejar el código listo para producción.

---

## 🚨 Críticas (producción)

- [ ] **Corregir dominio:** `astro.config.mjs` usa `comunidadtriba.com`, pero todos los tags canónicos, JSON-LD, sitemap y `robots.txt` usan `triba.com`. Unificar.
- [ ] **Sentry no funcional:** `SENTRY_DSN` no está en `.env`, source maps sin auth token. Errores silenciados en producción.
- [ ] **Sin tests:** Playwright instalado pero cero tests. Sin test suite no hay seguridad en deploys.

## 🔴 Alta

- [x] **Borrar `src/scripts/reveal.js`** — código muerto, el mismo IntersectionObserver está inline en `Layout.astro`.
- [x] **Borrar `public/scripts/parallax-gallery.js`** — código muerto, la clase `.parallax-gallery` no existe.
- [x] **Borrar `src/scripts/scroll-cards.js`** — copia obsoleta, la que carga `index.astro` es `public/scripts/scroll-cards.js`.
- [ ] **MP webhook: `console.error` → `logger.error`** — 8 líneas en `mercadopago.ts` bypassan Pino/Sentry.
- [ ] **Crear `404.astro`** — usuarios ven página default de Vercel sin branding.
- [ ] **Agregar `<label>` al input newsletter en `suscribirme.astro`** — WCAG failure.
- [ ] **Dots del slider sin keyboard support** — `MagazineSlider.astro` e `index.astro`. Agregar `role="button"`, `tabindex`, key listeners.

## 🟡 Media

- [x] **Limpiar `tailwind.config.mjs`** — remover 6 font-sizes sin uso (`hero`, `hero-mobile`, `section`, `section-mobile`, `body`, `body-mobile`) y el color `darkblue`.
- [x] **Agregar `description` meta** a `privacidad.astro` y `terminos.astro` (usan default).
- [x] **Eliminar entrada duplicada de `PageFlipViewer.tsx`** en tabla de componentes de `AGENTS.md`.
- [ ] **Extraer `escapeHtml()` a utilidad compartida** — duplicado en `admin/suscriptoras.astro` y `admin/ediciones/[id].astro`.
- [ ] **Newsletter form duplicado:** `suscribirme.astro` tiene su propio form inline en vez de reusar `NewsletterForm.astro`.
- [ ] **Admin pages usan HTML crudo en vez de `<Button>`** — `AdminLayout`, admin pages repiten clases manualmente.
- [ ] **Refactor `admin/creators.astro`:** 4 queries Supabase separadas → una sola con filtrado en memoria.
- [ ] **Sincronizar tipos `Subscription`** — `database.types.ts` y `types.ts` divergieron (falta `updated_at`, `canceled_at`, `"paypal"`).

## 🟢 Baja / Limpieza

- [ ] **Reemplazar `any` por tipos reales** — `PageFlipViewer.tsx`, `mi-cuenta.astro`, `admin/suscriptoras.astro`, `Input.astro`.
- [ ] **Agregar generic de Database a queries Supabase** — `supabase.from<Database["public"]["Tables"]...>("profiles")`.
- [ ] **CSP headers: cachear strings de domains** — en `middleware.ts` se reconstruyen en cada request HTML.
- [ ] **Preload fuente local Bootzy TM** — hay preconnect para Google Fonts pero no para la fuente de títulos.
- [ ] **Verificar `fetchpriority="high"` en hero images** — las imágenes LCP no tienen prioridad.
- [ ] **Botón "Gestionar suscripción" para MP** — actualmente solo muestra texto informativo, no redirige a MP.

---

## Progreso

| Fecha | Cambio |
|---|---|
| 2026-07-17 | Creado el archivo con hallazgos del architecture audit |
