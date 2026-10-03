import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { getPaymentProvider } from "../../lib/payment-provider";
import { checkRateLimit, rateLimitKey } from "../../lib/rate-limit";
import { logger } from "../../lib/logger";
import { getSiteOrigin } from "../../lib/site-url";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { resolveMailClubZone } from "../../lib/mail-club";
import { getActiveSubscriptionForUser } from "../../lib/subscription-guard";
import { validateMailClubAddress, saveMailClubAddress } from "../../lib/mail-club-address";

const validProviders = ["stripe", "mercadopago"] as const;
type Provider = (typeof validProviders)[number];
const validCurrencies = ["EUR", "USD", "ARS"] as const;
type Currency = (typeof validCurrencies)[number];
const validPlans = ["digital", "mail_club"] as const;
type Plan = (typeof validPlans)[number];

export const POST: APIRoute = async ({ request }) => {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";
  const rl = await checkRateLimit(rateLimitKey(ip, "create-checkout"), {
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return error("Demasiados intentos. Esperá un momento.", 429);
  }

  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const user = auth.user;

  let body: { provider?: unknown; currency?: unknown; plan?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("Invalid body", 400);
  }

  const plan: Plan = body.plan === "mail_club" ? "mail_club" : "digital";

  if (plan === "digital") {
    const provider = body.provider as Provider;
    const currency = body.currency as Currency;
    if (!validProviders.includes(provider)) {
      return error("Invalid provider", 400);
    }
    if (!validCurrencies.includes(currency)) {
      return error("Invalid currency", 400);
    }
    // Pares válidos: Stripe opera EUR/USD; Mercado Pago solo ARS. Evita que
    // el navegador fuerce una combinación que el proveedor no procesa.
    const allowedCurrencies = provider === "stripe" ? ["EUR", "USD"] : ["ARS"];
    if (!allowedCurrencies.includes(currency)) {
      return error("La moneda no corresponde al proveedor de pago.", 400);
    }

    try {
      const paymentProvider = getPaymentProvider(provider);
      const origin = getSiteOrigin();
      const result = await paymentProvider.createCheckout({
        userId: user.id,
        userEmail: user.email || "",
        currency,
        origin,
        plan: "digital",
      });
      return ok(result);
    } catch (err: any) {
      logger.error({ err, userId: user.id, provider, currency }, "create-checkout error");
      return error(err.message || "Internal server error", 500);
    }
  }

  // ---- Mail Club: el servidor deriva zona/moneda/proveedor del país postal ----
  const validated = validateMailClubAddress(body);
  if (!validated.ok) return error(validated.error, 400);
  const { address } = validated;
  const countryIso = address.country_iso;

  const resolved = resolveMailClubZone(countryIso);
  const requestedProvider = body.provider as Provider | undefined;
  // Si el frontend manda proveedor, debe coincidir con la zona; si no lo
  // manda, se usa el derivado. Nunca se acepta moneda/proveedor arbitrarios.
  const provider: Provider = requestedProvider ?? resolved.provider;
  if (!validProviders.includes(provider)) {
    return error("Invalid provider", 400);
  }
  if (provider !== resolved.provider) {
    return error("El proveedor no corresponde al país de envío.", 400);
  }
  const currency: Currency = resolved.currency;

  // Sin dobles suscripciones: quien ya tiene una vigente debe usar el
  // upgrade voluntario desde Mi Cuenta, no un checkout nuevo.
  const current = await getActiveSubscriptionForUser(user.id);
  if (current) {
    return new Response(
      JSON.stringify({
        error:
          "Ya tenés una suscripción activa. Podés pasarte al Mail Club desde Mi Cuenta.",
        code: "already_subscribed",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const saved = await saveMailClubAddress(supabaseAdmin, user.id, address);
    if (!saved.ok) {
      logger.error({ userId: user.id, step: saved.error }, "mail club address/consent save error");
      return error("No pudimos guardar tu dirección. Intentá de nuevo.", 500);
    }

    const paymentProvider = getPaymentProvider(provider);
    const origin = getSiteOrigin();
    const result = await paymentProvider.createCheckout({
      userId: user.id,
      userEmail: user.email || "",
      currency,
      origin,
      plan: "mail_club",
      countryIso,
    });
    return ok({ ...result, currency, provider, zone: resolved.zone });
  } catch (err: any) {
    logger.error({ err, userId: user.id, provider, currency }, "create-checkout mail club error");
    return error(err.message || "Internal server error", 500);
  }
};
