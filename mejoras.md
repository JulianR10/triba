# Mejoras — Triba

Pendientes para producción.

---

## ✅ Completado

- [x] **Migración de react-pageflip → react-pdf v10** — Visor PDF con dynamic import para evitar SSR error. Worker en `public/pdf.worker.min.mjs`.
- [x] **Importación de PDFs a Supabase Storage** — Tomos 1–3 importados. Portadas extraídas con `pdf-poppler`.
- [x] **Fullscreen en visor PDF** — Botón expand/compress, zoom solo en fullscreen, cálculo de dimensiones con viewport + aspect ratio.
- [x] **Layout shift en cambio de página** — `minHeight` tracking con `page.getViewport()` + `aspectRatioRef`. Previene rebote del footer.
- [x] **Fullscreen sin scroll vertical** — `maxH = viewportHeight - 110`. El PDF entra completo al 100% de zoom.
- [x] **Contenedor agrandado al salir de fullscreen** — Reset de `scale` a 1 + recalculo de `pageHeight` desde aspect ratio real.
- [x] **Rediseño de `/mi-cuenta`** — Hero gradiente pink→cream, saludo personalizado, collage de portadas rotadas, visor full-width, feedback compacto. Sin carrusel genérico ni "archivo de noticias".
- [x] **Navbar suscriptora** — "Mi cuenta" → "Mi perfil". Agregado "Triba Creators" a los links de sesión iniciada.
- [x] **Collage clickeable** — Cada portada en "Tus tomos" enlaza a `/revista/edicion-{n}`.

---

## 🔴 Pendiente

- [ ] **Sin tests:** Playwright instalado pero cero tests.

### 🔍 Checklist pre-prueba de suscripciones (3 monedas)

- [ ] **1. Variables de entorno en Vercel** — Sincronizar el `.env` actual (Stripe keys, MP token, webhook secrets, Supabase) en el dashboard de Vercel
- [ ] **2. Claves testing vs producción** — Decidir si hacer las pruebas con claves de test (sandbox) o directamente con las actuales (`sk_live_...`, `APP_USR-...`)
- [ ] **3. Migraciones de Supabase** — Verificar que las 7 migraciones (`supabase/migrations/`) estén aplicadas en la base de datos
- [ ] **4. Deploy activo** — Confirmar que `comunidadtriba.com` esté deployado y accesible, y que los webhooks apunten a la URL correcta
