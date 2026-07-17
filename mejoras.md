# Mejoras — Triba

Lista priorizada de tareas para dejar el código listo para producción.

---

## 🚨 Críticas (producción)

- [x] **Corregir dominio:** Unificado a `comunidadtriba.com`. Borrado sitemap estático (lo genera @astrojs/sitemap).
- [ ] **Sentry no funcional:** `SENTRY_DSN` no está en `.env`, source maps sin auth token. Errores silenciados en producción.
- [ ] **Sin tests:** Playwright instalado pero cero tests.

## 🔴 Alta

- [x] **Borrar `src/scripts/reveal.js`** — código muerto.
- [x] **Borrar `public/scripts/parallax-gallery.js`** — código muerto.
- [x] **Borrar `src/scripts/scroll-cards.js`** — copia obsoleta.
- [x] **MP webhook: `console.error` → `logger.error`** — 8 líneas corregidas.
- [x] **Crear `404.astro`** — página con diseño Triba.
- [x] **Agregar `<label>` al input newsletter en `suscribirme.astro`**.
- [x] **Dots del slider con keyboard support** — `<button>` + `aria-label` + `aria-current`.

## 🟡 Media

- [x] **Limpiar `tailwind.config.mjs`** — font-sizes y `darkblue` eliminados.
- [x] **Agregar `description` meta** a `privacidad.astro` y `terminos.astro`.
- [x] **Eliminar entrada duplicada de `PageFlipViewer.tsx`** en `AGENTS.md`.
- [x] **Extraer `escapeHtml()` a utilidad compartida** — `src/lib/escape.ts`.
- [x] **Newsletter handler compartido** — extraído a `src/scripts/newsletter-handler.ts`.
- [ ] ~~**Admin pages usar `<Button>`** — cancelado: tamaños/estilos admin no compatibles con Button.astro sin complejizar el componente.~~
- [x] **Refactor `admin/creators.astro`:** 4 queries → 1 query + filtrado en memoria.
- [ ] **Sincronizar tipos `Subscription`** — `database.types.ts` y `types.ts` divergieron.

## 🟢 Baja / Limpieza

- [x] **Reemplazar `any` por tipos reales** — `PageFlipViewer.tsx`, `mi-cuenta.astro`, `Input.astro`.
- [ ] **Agregar generic de Database a queries Supabase**.
- [ ] **CSP headers: cachear strings de domains**.
- [ ] **Preload fuente local Bootzy TM**.
- [ ] **Verificar `fetchpriority="high"` en hero images**.
- [ ] **Botón "Gestionar suscripción" para MP**.

---

## Progreso

| Fecha | Cambio |
|---|---|
| 2026-07-17 | Creado el archivo con hallazgos del architecture audit |
