import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { getPaymentProvider } from "../../lib/payment-provider";
import { enforceRateLimit } from "../../lib/rate-limit";
import { logger } from "../../lib/logger";
import { getSiteOrigin } from "../../lib/site-url";
import { getPreferredLocale } from "../../lib/locale-pref";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { resolveMailClubZone, isMailClubCountryEnabled, MAIL_CLUB_PAUSED } from "../../lib/mail-club";
import { getLivePaidSubscription } from "../../lib/subscription-guard";
import { validateMailClubAddress, saveMailClubAddress } from "../../lib/mail-club-address";

const validProviders = ["stripe", "mercadopago"] as const;
type Provider = (typeof validProviders)[number];
const validCurrencies = ["EUR", "USD", "ARS"] as const;
type Currency = (typeof validCurrencies)[number];
const validPlans = ["digital", "mail_club"] as const;
type Plan = (typeof validPlans)[number];

// 409 por suscripción vigente. Con la baja ya programada no hay nada que gestionar: se le dice
// desde cuándo puede volver a suscribirse.
function alreadySubscribed(live: { endsAt: string | null }, fallback: string) {
  const when = live.endsAt
    ? new Date(live.endsAt).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })
    : null;
  return new Response(
    JSON.stringify(
      when
        ? {
            error: `Tu suscripción sigue activa hasta el ${when}, porque ya programaste la baja. Desde ese día podés volver a suscribirte.`,
            code: "cancellation_scheduled",
          }
        : { error: fallback, code: "already_subscribed" },
    ),
    { status: 409, headers: { "Content-Type": "application/json" } },
  );
}

export const POST: APIRoute = async ({ request }) => {
  const limited = await enforceRateLimit(request, "create-checkout", {
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

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
  if (plan === "mail_club" && MAIL_CLUB_PAUSED) {
    return error("El Mail Club está pausado por el momento. Anotate en la lista de espera.", 409);
  }

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

    // Sin dobles cobros: quien ya paga no puede abrir otro checkout.
    const live = await getLivePaidSubscription(user.id);
    if (live) return alreadySubscribed(live, "Ya tenés una suscripción activa. Gestionala desde Mi Cuenta.");

    try {
      const paymentProvider = getPaymentProvider(provider);
      const origin = getSiteOrigin();
      const result = await paymentProvider.createCheckout({
        userId: user.id,
        userEmail: user.email || "",
        currency,
        origin,
        locale: await getPreferredLocale(user.id),
        plan: "digital",
      });
      return ok(result);
    } catch (err: any) {
      logger.error({ err, userId: user.id, provider, currency }, "create-checkout error");
      // El detalle (precio faltante, proveedor sin configurar) queda en el log, no en pantalla.
      return error("No pudimos iniciar el pago. Intentá de nuevo en unos minutos.", 500);
    }
  }

  // ---- Mail Club: el servidor deriva zona/moneda/proveedor del país postal ----
  const validated = validateMailClubAddress(body);
  if (!validated.ok) return error(validated.error, 400);
  const { address } = validated;
  const countryIso = address.country_iso;

  if (!isMailClubCountryEnabled(countryIso)) {
    return error("Por ahora el Mail Club envía solo a Argentina.", 400);
  }

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

  // Sin dobles suscripciones: quien ya tiene una paga vigente (en cualquier
  // fila, no solo la del perfil) debe usar el upgrade desde Mi Cuenta. Las
  // 'migrated' (cortesía) no cuentan: deben poder convertir a Mail Club.
  const live = await getLivePaidSubscription(user.id);
  if (live) return alreadySubscribed(live, "Ya tenés una suscripción activa. Podés pasarte al Mail Club desde Mi Cuenta.");

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
      locale: await getPreferredLocale(user.id),
      plan: "mail_club",
      countryIso,
    });
    return ok({ ...result, currency, provider, zone: resolved.zone });
  } catch (err: any) {
    logger.error({ err, userId: user.id, provider, currency }, "create-checkout mail club error");
    return error("No pudimos iniciar el pago. Intentá de nuevo en unos minutos.", 500);
  }
};
