# TRIBA — Estado actual (14 jul 2026)

> Puntaje original: **5.8/10** → puntaje estimado actual: **8.5/10**
> Capas 0 a 7 completadas. Queda solo lo siguiente:

---

## Pendiente — Email notifications

### Mail transaccional
- [ ] Configurar Nodemailer + Gmail (app password de comunidadtriba@gmail.com)
- [ ] Notificar a comunidadtriba@gmail.com cuando:
  - Alguien se suscribe al newsletter
  - Alguien envía postulación como Triba Creator
  - Alguien deja feedback
- [ ] Opcional: email de bienvenida al registrarse / suscribirse

Recursos: Nodemailer + contraseña de aplicación de Google.
Bloqueante: requiere acceso con la propietaria del sitio para generar la app password.

---

## Completado (14 jul 2026)

### Capa 0 — Assets
✅ PNG→WebP (95–98% reducción), referencias actualizadas
✅ Fuente BootzyTM en `public/fonts/bootzyTM/`
✅ Favicon desde `logo-triba.svg`
✅ `src/images/` eliminado (duplicados de `public/`)

### Capa 1 — SEO
✅ Google Fonts via `<link preconnect>` (eliminado `@import`)
✅ `<title>` + `<meta name=description>` por página
✅ `robots.txt` + `sitemap.xml`
✅ Open Graph + Twitter Cards
✅ Schema.org JSON-LD (WebSite + Organization)
✅ Jerarquía h1 corregida (index, suscribirme, revista, creators)
✅ Canonical tags por página
✅ CSP headers via middleware

### Capa 2 — Supabase
✅ Proyecto creado (Free, Europa)
✅ `.env` con credenciales reales
✅ Migración `001_init.sql`: tablas `profiles` + `subscriptions`
✅ RLS + grants + API exposure

### Capa 3 — Performance y UI
✅ `loading="lazy"` en parallax, MagazineCard, compumundo
✅ `:focus-visible` y `:active` en Navbar + buttons
✅ TitleBadge: `border-radius: 50%` → `border-radius: 9999px`
✅ Breakpoints `xl:px-32 2xl:px-48` en todas las secciones

### Capa 4 — Formularios conectados
✅ Migración `002_forms.sql`: `newsletters`, `creator_applications`, `feedback`
✅ Login con Supabase Auth (errores inline)
✅ Newsletter funcional + endpoint `/api/newsletter`
✅ "Olvidé mi contraseña" con recovery email
✅ Formulario creators persiste en Supabase
✅ Feedback persiste en Supabase
✅ CheckoutButton: `alert()` reemplazado por UI inline

### Capa 5 — Auth y navegación
✅ Navbar server-side con `@supabase/ssr` (variante logueada/anónima)
✅ Cerrar sesión funcional
✅ Plan elegido se preserva al redirect de login (`?currency=`)
✅ Cliente Supabase centralizado en `src/lib/supabase.ts`

### Capa 6 — Datos reales
✅ Migración `003_editions.sql`: tablas `editions` + `edition_pages`
✅ Seed data insertada (3 ediciones + páginas)
✅ `index.astro`, `revista.astro`, `mi-cuenta.astro` fetch desde Supabase
✅ Ruta dinámica `/revista/[slug]` con page-flip viewer

### Capa 7 — Seguridad
✅ `err.message` sanitizado en todas las API routes
✅ CSRF mitigado (Bearer tokens + JSON Content-Type + webhooks firmados)
✅ Validación inline en Input.astro (pattern, minlength, mensajes en blur/input)
