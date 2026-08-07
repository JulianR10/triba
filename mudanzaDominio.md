# Plan: Mudanza de dominio

**✅ COMPLETADA 7-Ago-2026** — el sitio ahora vive en `https://www.universotriba.com` (el apex redirige a www; comunidadtriba.com hace 301 al nuevo). Webhook Stripe: `we_1U1plgLIVKTt84JHLV8gZN41` → `https://www.universotriba.com/api/webhook/stripe`. Este documento queda como registro histórico.

Objetivo: mover el sitio de `www.comunidadtriba.com` a un dominio nuevo minimizando downtime y sin romper webhooks, pagos ni emails.

Dominio actual (hardcodeado): `https://www.comunidadtriba.com`
Dominio nuevo: **`https://www.universotriba.com`**

---

## Parte A — Código (lo hago yo, ~1-2 hs)

Todo es edición de archivos. Las URLs ya están centralizadas en `src/lib/site-url.ts`.

| # | Archivo | Línea | Cambio |
|---|---|---|---|
| 1 | `astro.config.mjs` | 8 | `site: "https://NUEVO_DOMINIO"` (sitemap/canonical) |
| 2 | `src/lib/site-url.ts` | 1 | `FALLBACK_SITE_URL` → nuevo dominio |
| 3 | `.env` | — | Agregar `SITE=https://NUEVO_DOMINIO` (pasa a ser la fuente de verdad) |
| 4 | `.env.example` | 26 | `SENDER_FROM_EMAIL` → `hola@NUEVO_DOMINIO` (si cambia el email) |
| 5 | `.env` | 21 | Idem `SENDER_FROM_EMAIL` local |
| 6 | `src/lib/sender.ts` | 78 | fallback `hola@comunidadtriba.com` → `hola@NUEVO_DOMINIO` |
| 7 | `public/robots.txt` | 7 | `Sitemap: https://NUEVO_DOMINIO/sitemap.xml` |
| 8 | `src/layouts/Layout.astro` | 66, 71 | JSON-LD hoy apunta a `https://triba.com` (inconsistente). Centralizar en `SITE_URL` |
| 9 | `src/pages/terminos.astro`, `privacidad.astro`, `src/lib/email.ts` | — | Emails de contacto hardcodeados (solo si cambia el email además del dominio) |

Verificación: `npx astro check` → 0 errores, `npm run build` OK.

---

## Parte B — Vía API/CLI (lo hago yo, requiere acceso)

### B1. Stripe — recrear webhook
- Stripe **no sigue redirects** → el endpoint DEBE quedar en `https://NUEVO_DOMINIO/api/webhook/stripe`.
- Con `STRIPE_SECRET_KEY` creo un endpoint nuevo vía API y obtengo el `whsec_` nuevo (se devuelve solo una vez al crear).
- Seteo ese secret en `.env` local y en Vercel (si la CLI está logueada).

### B2. Vercel — dominio y env vars
- Con `vercel` CLI (requiere `vercel login`): dar de alta el dominio nuevo y setear env vars:
  - `SITE`
  - `SENDER_FROM_EMAIL`
  - `STRIPE_WEBHOOK_SECRET` (nuevo)
- Si la CLI no está logueada → esto pasa a la Parte C (manual en dashboard).

### B3. Sender (parcial)
- Con `SENDER_API_KEY` puedo chequear grupos/config, pero **verificar el dominio es bloqueante por DNS** (Parte C1). El from-email solo funciona tras verificación + SPF/DKIM.

---

## Parte C — Obligatorio manual (no tengo acceso)

### C1. DNS — EL BLOQUEANTE
Orden sugerido:
1. Apuntar el dominio nuevo a Vercel (registro A/ALIAS/CNAME según indique Vercel).
2. Verificar el dominio en **Sender**: agregar el TXT/SPF/DKIM que te da Sender.
3. (Opcional) MX si va a recibir email en ese dominio.

Hasta que el DNS propague y Sender confirme, el from-email viejo puede seguir activo.

### C2. Supabase Auth — Dashboard
- Site URL → `https://NUEVO_DOMINIO`
- Redirect URLs → agregar la nueva (login + reset password).
- No hay management token en `.env`, no se puede por API.

### C3. Vercel — solo si la CLI no está logueada
- Dashboard → add domain + env vars (o autorizar `vercel login` para hacerlo yo).

### C4. Google Search Console / SEO
- Verificar el dominio nuevo, agregar el sitemap nuevo, pedir re-indexado.
- (Opcional) 301 del dominio viejo si se quiere conservar SEO.

---

## Orden de ejecución recomendado

1. **C1** arrancar DNS temprano (es lo que más tarda: propagación + verificación Sender).
2. **A** código + verificación (`astro check` / `build`).
3. **B1** Stripe webhook nuevo + secret en `.env` y Vercel.
4. **C2** Supabase Auth URLs.
5. **B2/C3** Vercel dominio + env.
6. **C4** Search Console + re-indexado.

## Riesgos / a no olvidar
- Si Stripe queda con el webhook viejo y el DNS ya cambió → **los pagos dejan de activar suscripciones** (pasó el 4-Ago). Hacer el webhook ANTES de cortar el DNS.
- No tocar los secrets de MP (las preaprobaciones viejas usan `back_url` del dominio viejo; solo afecta el redirect post-pago, cosmético).
- No reintroducir: usar SIEMPRE `SITE_URL`/`getSiteOrigin()` para construir URLs, nunca `request.url`.
