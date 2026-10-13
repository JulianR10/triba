# Instrucciones de desarrollo — TRIBA

Contexto operativo: [`mailClub.md`](./mailClub.md). Mapa funcional temporal: [`docs/flujo-funcional.md`](./docs/flujo-funcional.md).

## Stack y estilo

- Astro 5 SSR en Vercel; Tailwind 3; Supabase; Stripe y Mercado Pago; Sender; visor PDF con React.
- Naming: archivos kebab-case, componentes PascalCase, variables camelCase. UI en español rioplatense; código y logs en inglés.
- Colores: `triba-red #E91A39`, `triba-pink #FFCCE4`, `triba-cream #FFF8EE`, `triba-green #BCE85E`, `triba-brown #35220A`.

## Convenciones obligatorias

- Scripts de página Astro se inicializan mediante `onPageCycle(fn)` para funcionar con y sin View Transitions.
- Endpoints: `APIRoute`; usar `requireUser`/`requireAdmin` y el contrato de `src/lib/response.ts` (éxito por HTTP `res.ok`, error `{error}` + status).
- Migraciones secuenciales e idempotentes en `supabase/migrations/`; mantener `src/lib/database.types.ts` sincronizado.
- `SITE_URL` se define desde `astro.config.mjs` y `src/lib/site-url.ts`; no derivarlo de `request.url` en Vercel.
- No interpolar `{expr}` en scripts HTML de Astro: usar `set:html`, JSON embebido o `data-*`.
- Si se modifica un flujo de pago, cubrir reintentos/idempotencia y validar `npm run check`, `npm test` y `npm run build`.

## Invariantes que no deben romperse

- Gate de suscripción: siempre `isActiveSubscription(status, current_period_end)`; `past_due` no degrada el perfil a `free`.
- Cancelación y portal: proveedor primero; un error real del proveedor no debe marcar la baja local. `cancel_subscription` devuelve filas afectadas y el caller verifica el resultado.
- Upgrade pendiente: TTL 60 minutos; un solo `pending` por usuaria. Bienvenida Mail Club: claim condicional `welcome_sent_at`, at-most-once con rollback si Sender falla.
- Mail Club: elegibilidad y dirección se congelan al corte; el despacho no revalida el estado vivo. Número de fundadora consecutivo, inmutable y sin tope.
- Badges: `edition_languages.badge` solo en la edición destacada; mantener `syncFeaturedBadges()` al crear, editar o borrar.
- Ediciones: los archivos grandes se suben directo a Storage con URL firmada; tras el PUT, el servidor verifica tamaño, MIME y firma antes de guardar. Limpiar si falla; no pasarlos por Vercel.
- `security.checkOrigin: false` es intencional con Astro/Vercel y las rutas multipart; no cambiarlo sin probar los formularios admin.
- Webhook MP: validar con `WebhookSignatureValidator` del SDK, sin tolerancia propia. Stripe: estados mapeados por `mapStripeSubscriptionStatus` (desconocidos se omiten sin reintento; `deleted` solo libera el perfil sin otra sub con acceso); no sustituir períodos reales por `+30 días` sin revisar la fuente.
- Rate limiting (`src/lib/rate-limit.ts`, tabla `rate_limits`): fail-closed con 503, claves IPv6-safe vía `enforceRateLimit`. Cubierto en formularios/checkouts, PDF, cuenta y mutaciones admin; webhooks excluidos a propósito y el login vive en Supabase Auth.
- PDFViewer: `client:only="react"`; import estático de `react-pdf` y worker `pdfjs-dist/...mjs?url`; ampliar mediante overlay portal, nunca Fullscreen API.
- Cron y webhooks requieren secreto/firma. Consultar `mailClub.md` para estado y pasos antes de tocar producción.

## UI, navegación e i18n

- Navbar mide `--nav-height` con `ResizeObserver`; conservar espaciado superior y la excepción móvil de Mi Cuenta.
- Rutas EN físicas en `src/pages/en/`; usar `localizePath`/`switchPath`. Admin queda en español.
- Al agregar una ruta bilingüe, revisar canonical, `hreflang`, sitemap y textos ES/EN.
