# Instrucciones para la clienta — Stripe & Mercado Pago

## 🔴 Stripe (4 pasos)

### 1. Asegurate de estar en modo PRODUCCIÓN

- Entrá a [https://dashboard.stripe.com](https://dashboard.stripe.com)
- Arriba a la derecha, fijate que el toggle **"View test data"** esté **APAGADO** (gris, no azul)
- Si está azul, hacé click para desactivarlo

### 2. Obtené los 3 Price IDs

- En el menú izquierdo, hacé click en **"Products"**
- Si ves un producto llamado "Suscripción Triba", entrá ahí
- Dentro del producto, vas a ver 3 precios (uno por moneda). De cada uno copiá el **ID** que dice debajo del precio (empieza con `price_...`)
- Si **NO existe el producto**, crealo:
  - Click en **"Add product"**
  - Nombre: `Suscripción Triba`
  - Descripción: `Acceso completo a la revista del mes, archivo y descarga PDF`
  - En **"Pricing model"** seleccioná **"Standard pricing"**
  - Agregá 3 precios:
    - EUR → €9.50 — recurring — monthly
    - USD → $10.50 — recurring — monthly
    - ARS → $12.500 — recurring — monthly
  - Guardar
- Copiá los 3 IDs y pasámelos.

**Necesito que me digas cuál es cuál**, por ejemplo:
```
EUR → price_xxxxxxxxxxxxx
USD → price_xxxxxxxxxxxxx
ARS → price_xxxxxxxxxxxxx
```

### 3. Crear el webhook (para que Stripe nos avise cuando alguien pague)

- En el menú izquierdo, hacé click en **"Developers"** (desarrolladores)
- Dentro de Developers, hacé click en **"Webhooks"**
- Click en el botón **"+ Add endpoint"**
- En **"Endpoint URL"** pegá exactamente esta dirección:

```
https://comunidadtriba.com/api/webhook/stripe
```

- En **"Events to send"** hacé click en **"Select events"** y buscá estos 3 eventos (marcalos):

| Evento |
|---|
| `checkout.session.completed` |
| `customer.subscription.updated` |
| `customer.subscription.deleted` |

- Click en **"Add endpoint"** (botón verde abajo del todo)
- En la pantalla que sigue, buscá **"Signing secret"** (empieza con `whsec_...`)
- Click en el botón **"Reveal"** (mostrar)
- **Copiá ese texto completo** y pasámelo

### 4. Dame la Secret Key (si no lo hiciste ya)

En **Developers → API Keys**, la **"Secret key"** que empieza con `sk_live_...`. Si ya me la pasaste antes, no hace falta repetirla.

---

## 🔵 Mercado Pago (2 pasos)

### 1. Crear el webhook

- Entrá a [https://www.mercadopago.com.ar/developers](https://www.mercadopago.com.ar/developers)
- En el menú izquierdo, andá a **"Webhooks & Notificaciones"**
- Click en **"Crear webhook"**
- En **"URL"** pegá exactamente esta dirección:

```
https://comunidadtriba.com/api/webhook/mercadopago
```

- En **"Eventos"** seleccioná:
  - `subscription_preapproval`
  - `subscription_authorized_payment`
- Click en **"Guardar"**
- Si la página te muestra un **"Secret"** o código secreto de verificación, **copialo y pasámelo**. Si no aparece nada, no hay problema.

### 2. Verificar que las suscripciones estén habilitadas

En el dashboard de Mercado Pago, andá a **"Configuración"** → **"Cobros por suscripción"** y asegurate de que esté activado. Si no lo ves, no te preocupes, suele estar activo por defecto en cuentas productivas.

---

## 📋 Checklist — Lo que me tenés que enviar

| Item | Estado |
|---|---|
| Price ID EUR (`price_...`) | ⬜ |
| Price ID USD (`price_...`) | ⬜ |
| Price ID ARS (`price_...`) | ⬜ |
| Stripe Signing secret (`whsec_...`) | ⬜ |
| Stripe Secret Key (`sk_live_...`) | ✅ (ya la tengo) |
| MP Access Token (`APP_USR-...`) | ✅ (ya lo tengo) |
| MP Webhook secret (si existe) | ⬜ |

---

Ante cualquier duda, preguntame.
