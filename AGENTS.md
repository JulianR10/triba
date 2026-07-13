# TRIBA — Contexto de proyecto

Revista digital mensual escrita por y para mujeres, sobre cultura, arte, identidad. Modelo de suscripción con newsletter gratuito + suscripción paga (acceso a revista completa, archivo, descarga PDF).

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | **Astro 5** (server output con `@astrojs/node` standalone) |
| Estilos | **Tailwind CSS 3** — mobile-first, colores/fuentes del branding |
| BBDD / Auth / Storage | **Supabase** (PostgreSQL, auth, storage para PDFs/portadas) |
| Pagos | **Stripe** + **Mercado Pago** + **PayPal** (webhooks + Supabase) |
| Visor revista | **react-pageflip** (React island) |
| JS | Mínimo. Solo islands interactivos y scripts puntuales. |

---

## Sistema visual

### Colores

| Token | Hex | Uso |
|---|---|---|
| `triba-red` | `#E91A39` | Logo, CTAs, acentos |
| `triba-pink` | `#FFCCE4` | Fondos de sección, highlights |
| `triba-cream` | `#FFF8EE` | Fondo principal secciones |
| `triba-light-cream` | `#FDEDD5` | Variante fondo |
| `triba-green` | `#BCE85E` | Highlight "Hecho por y para mujeres" |
| `triba-blue` | `#3BACFF` | Acentos secundarios |
| `triba-darkblue` | `#1800AD` | Azul eléctrico |
| `triba-white` | `#FFFFFF` | Fondos cards, botones |
| `triba-black` | `#000000` | Texto principal |
| `triba-brown` | `#35220A` | Texto sobre fondo claro |
| `triba-bone` | `#f2f1eb` | Fondo general del sitio |

### Tipografía

| Uso | Fuente |
|---|---|
| Logo | Lettering manual ilustrado → SVG/imagen |
| Títulos | **Bootzy TM** → Helvetica / Arial |
| Cuerpo | **Montserrat** → Helvetica / Arial |
| Cursiva destacada | **Times New Roman** itálica |

### Fondos decorativos

`fondo-cielo.webp`, `fondo-1.png`, `fondo-3.png`

---

## Navegación

| Rol | Items |
|---|---|
| Público | INICIO · REVISTA · SUSCRIBIRME · TRIBA CREATORS · [INICIAR SESION] |
| Suscriptora | Logo · MI CUENTA · REVISTA · ARCHIVO PERIODISTICO |

---

## Páginas

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/` | `index.astro` | Hero, galería parallax, cards, newsletter, CTA creators |
| `/suscribirme` | `suscribirme.astro` | Pricing EUR/USD/ARS, 3 botones de pago (Stripe/MP/PayPal), FAQ |
| `/iniciar-sesion` | `iniciar-sesion.astro` | Login con Supabase Auth |
| `/revista` | `revista.astro` | Edición destacada, carrusel, visor page-flip |
| `/mi-cuenta` | `mi-cuenta.astro` | Dashboard suscriptora, edición actual, carrusel, archivo, visor, feedback |
| `/triba-creators` | `triba-creators.astro` | Info + formulario para creators |
| `/revista/[slug]` | ⏳ Pendiente | Vista de artículo/edición con page-flip |

---

## Componentes

| Componente | Props clave |
|---|---|
| `Button.astro` | `variant` (primary/default/ghost), `size` (sm/md), `href`, `fullWidth` |
| `CheckoutButton.astro` | `provider` (stripe/mercadopago/paypal), `currency` (EUR/USD/ARS) |
| `DecorativeStar.astro` | `color`, `size`, `style`, `mobile` |
| `MagazineCard.astro` | `number`, `title`, `description`, `image`, `coverId` |
| `MagazineCarousel.astro` | `editions`, `selectedId` |
| `Navbar.astro` | Falta variante logueada |
| `NewsletterForm.astro` | — |
| `Input.astro` | `label`, `name`, `type`, `required`, `placeholder`, `isTextarea` |
| `TitleBadge.astro` | `text`, `color` (pink/blue), `centered` |
| `PageFlipViewer.tsx` | `pages`, `width`, `height` |

---

## API (server routes)

| Ruta | Método | Propósito |
|---|---|---|
| `/api/create-checkout` | POST | Crea sesión Stripe o MP, devuelve URL |
| `/api/create-paypal-order` | POST | Crea orden PayPal, devuelve approval URL |
| `/api/capture-paypal-order` | POST | Confirma captura PayPal post-aprobación |
| `/api/portal` | POST | Redirige a Stripe Customer Portal |
| `/api/webhook/stripe` | POST | Eventos de suscripción Stripe |
| `/api/webhook/mercadopago` | POST | Notificaciones de pago MP |
| `/api/webhook/paypal` | POST | Eventos de suscripción PayPal |

---

## Pendientes

- [ ] Navbar: variante logueada (Mi Cuenta, Archivo)
- [ ] Vista `/revista/[slug]` con page-flip
- [ ] Conectar Supabase (crear proyecto, correr migraciones, configurar auth)
- [ ] Configurar Stripe/MP/PayPal: prices, plans, webhooks, `.env`
- [ ] Responsive tablet/desktop
- [ ] Cargar logo real + assets finales de la diseñadora

---

## Estructura del proyecto

```
triba/
├── public/                     # Estáticos (portadas, fondos, logo)
├── supabase/migrations/        # SQL: profiles + subscriptions
├── src/
│   ├── components/             # Componentes Astro/React
│   │   ├── Button.astro
│   │   ├── CheckoutButton.astro
│   │   ├── DecorativeStar.astro
│   │   ├── Input.astro
│   │   ├── MagazineCard.astro
│   │   ├── MagazineCarousel.astro
│   │   ├── Navbar.astro
│   │   ├── NewsletterForm.astro
│   │   ├── PageFlipViewer.tsx
│   │   └── TitleBadge.astro
│   ├── layouts/
│   │   ├── Layout.astro
│   │   └── global.css
│   ├── lib/                    # Clients y config de servicios
│   │   ├── supabase.ts
│   │   ├── supabase-admin.ts
│   │   ├── stripe.ts
│   │   ├── mercadopago.ts
│   │   ├── paypal.ts
│   │   ├── pricing.ts
│   │   └── types.ts
│   ├── pages/
│   │   ├── api/                # Endpoints de pago y webhooks
│   │   │   ├── create-checkout.ts
│   │   │   ├── create-paypal-order.ts
│   │   │   ├── capture-paypal-order.ts
│   │   │   ├── portal.ts
│   │   │   └── webhook/
│   │   ├── index.astro
│   │   ├── suscribirme.astro
│   │   ├── iniciar-sesion.astro
│   │   ├── mi-cuenta.astro
│   │   ├── revista.astro
│   │   └── triba-creators.astro
│   └── scripts/
│       ├── parallax-gallery.js
│       └── scroll-cards.js
├── astro.config.mjs
├── tailwind.config.mjs
├── tsconfig.json
├── .env.example
├── package.json
└── AGENTS.md
```
pwrd supabase: azultriba2027