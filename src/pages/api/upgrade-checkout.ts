import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error, json } from "../../lib/response";
import { enforceRateLimit } from "../../lib/rate-limit";
import { logger } from "../../lib/logger";
import { getSiteOrigin } from "../../lib/site-url";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { getActiveSubscriptionForUser } from "../../lib/subscription-guard";
import { validateMailClubAddress, saveMailClubAddress } from "../../lib/mail-club-address";
import { getPlanType, MAIL_CLUB_PAUSED, MAIL_CLUB_UPGRADE_DIFF_CENTS, isUpgradeZoneCompatible, isMailClubCountryEnabled, resolveMailClubZone } from "../../lib/mail-club";
import {
  buildUpgradePaymentIntentParams,
  getSubscriptionSavedCard,
  isAuthenticationRequiredError,
  isCardError,
  upgradeIdempotencyKey,
} from "../../lib/upgrade-payment";
import { applyUpgrade } from "../../lib/upgrade-apply";
import { expireStalePendingUpgrades } from "../../lib/upgrade-recovery";
import { SUPPORT_EMAIL } from "../../lib/contact";
import { getPreferredLocale } from "../../lib/locale-pref";
import { localizePath } from "../../i18n/locale";

// Upgrade voluntario digital -> Mail Club: cobra UNA vez la diferencia del
// mes en curso. La tarifa recurrente cambia solo cuando ese pago se confirma
// (webhooks). Nunca cancela ni recrea la suscripción existente.
export const POST: APIRoute = async ({ request }) => {
  const limited = await enforceRateLimit(request, "upgrade-checkout", {
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  if (MAIL_CLUB_PAUSED) {
    return error("El Mail Club está pausado por el momento. Anotate en la lista de espera.", 409);
  }

  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const user = auth.user;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return error("Invalid body", 400);
  }

  const current = await getActiveSubscriptionForUser(user.id);
  if (!current) {
    return error("Necesitás una suscripción digital activa para pasarte al Mail Club.", 409);
  }
  if (getPlanType(current as any) === "mail_club") {
    return error("Ya estás en el Mail Club.", 409);
  }
  if (current.provider !== "stripe" && current.provider !== "mercadopago") {
    return error(`Tu suscripción actual no admite upgrade directo. Escribinos a ${SUPPORT_EMAIL} y lo resolvemos.`, 409);
  }

  const validated = validateMailClubAddress(body);
  if (!validated.ok) return error(validated.error, 400);

  const currency = current.plan_currency as "EUR" | "USD" | "ARS";
  const provider = current.provider as "stripe" | "mercadopago";

  // El upgrade conserva moneda y proveedor: la dirección debe pertenecer
  // a la misma zona de envío. Sin esto, una usuaria EUR podría cargar
  // una dirección AR (ARS/Mercado Pago) y quedar con precio/zona incoherentes.
  // Mismatch = paso obligado: se devuelve código + zona esperada para que
  // el frontend ofrezca corregir dirección o cambiar de zona (baja + alta).
  if (!isMailClubCountryEnabled(validated.address.country_iso)) {
    return error("Por ahora el Mail Club envía solo a Argentina.", 400);
  }
  if (!isUpgradeZoneCompatible(currency, provider, validated.address.country_iso)) {
    const expected = resolveMailClubZone(validated.address.country_iso);
    logger.warn(
      { userId: user.id, currency, provider, countryIso: validated.address.country_iso },
      "upgrade zone mismatch",
    );
    return json(
      {
        error: `La dirección ingresada corresponde a envíos en ${expected.currency}, pero tu suscripción actual es en ${currency}. El upgrade mantiene tu moneda y proveedor actual.`,
        code: "ZONE_MISMATCH",
        current: { currency, provider },
        expected: {
          currency: expected.currency,
          provider: expected.provider,
          zone: expected.zone,
          countryIso: expected.countryIso,
        },
      },
      400,
    );
  }

  const diffCents = MAIL_CLUB_UPGRADE_DIFF_CENTS[currency];

  const saved = await saveMailClubAddress(supabaseAdmin, user.id, validated.address);
  if (!saved.ok) {
    logger.error({ userId: user.id, step: saved.error }, "upgrade address/consent save error");
    return error("No pudimos guardar tu dirección. Intentá de nuevo.", 500);
  }

  // Liberar el slot si quedó un intento abandonado (TTL): el índice parcial
  // único solo bloquea mientras el estado sea 'pending'.
  await expireStalePendingUpgrades(user.id);

  const insertUpgrade = () =>
    supabaseAdmin
      .from("mail_club_upgrades")
      .insert({
        user_id: user.id,
        from_plan: "digital",
        to_plan: "mail_club",
        plan_currency: currency,
        amount_cents: diffCents,
        provider,
        status: "pending",
      })
      .select("id")
      .single();

  let { data: upgrade, error: rowError } = await insertUpgrade();
  if (rowError && (rowError as any)?.code === "23505") {
    // Carrera: otro intento quedó pending entre la expiración y el insert.
    // Se fuerza la expiración inmediata y se reintenta una sola vez.
    await expireStalePendingUpgrades(user.id, 0);
    ({ data: upgrade, error: rowError } = await insertUpgrade());
  }
  if (rowError || !upgrade) {
    // 23505 del índice parcial: ya hay un upgrade pendiente en curso.
    if ((rowError as any)?.code === "23505") {
      return error("Ya tenés un upgrade en curso. Esperá unos minutos y volvé a intentar.", 409);
    }
    logger.error({ err: rowError, userId: user.id }, "upgrade row insert error");
    return error("No pudimos iniciar el upgrade. Intentá de nuevo.", 500);
  }
  const upgradeId = (upgrade as any).id as string;
  const failUpgrade = async (message: string) => {
    await supabaseAdmin
      .from("mail_club_upgrades")
      .update({ status: "failed", error: message.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", upgradeId);
  };

  try {
    const origin = getSiteOrigin();
    const account = `${origin}${localizePath("/mi-cuenta", await getPreferredLocale(user.id))}`;
    if (provider === "stripe") {
      const { stripe } = await import("../../lib/stripe");
      if (!stripe) throw new Error("Stripe not configured");

      const createCheckoutFallback = async () => {
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: currency.toLowerCase(),
                unit_amount: diffCents,
                product_data: { name: "Diferencia Mail Club Triba" },
              },
              quantity: 1,
            },
          ],
          customer_email: user.email || "",
          client_reference_id: user.id,
          success_url: `${account}?checkout=success&flow=mail_club_upgrade`,
          cancel_url: `${account}?checkout=canceled`,
          metadata: { user_id: user.id, upgrade_id: upgradeId, plan: "mail_club_upgrade" },
        });
        await supabaseAdmin
          .from("mail_club_upgrades")
          .update({ provider_payment_ref: session.id, updated_at: new Date().toISOString() })
          .eq("id", upgradeId);
        return ok({ url: session.url! });
      };

      // 1) Tarjeta guardada: cobro único off-session de la diferencia exacta.
      // Sin tarjeta reutilizable o con SCA requerido → Checkout (paso 2).
      // Rechazo duro → 402 para que la usuaria decida reintentar.
      if (body?.force_checkout !== true && (currency === "EUR" || currency === "USD")) {
        try {
          const { data: full } = await supabaseAdmin
            .from("subscriptions")
            .select("provider_subscription_id")
            .eq("id", current.id)
            .maybeSingle();
          const providerSubId = (full as any)?.provider_subscription_id as string | undefined;
          const saved = providerSubId
            ? await getSubscriptionSavedCard(stripe, providerSubId)
            : null;
          if (saved) {
            const pi = await stripe.paymentIntents.create(
              buildUpgradePaymentIntentParams({
                diffCents,
                currency,
                customerId: saved.customerId,
                paymentMethodId: saved.paymentMethodId,
                upgradeId,
                userId: user.id,
              }),
              { idempotencyKey: upgradeIdempotencyKey(upgradeId) },
            );
            if (pi.status === "succeeded") {
              // El cobro YA salió. Desde acá no se responde error ni se marca 'failed':
              // un mensaje de error hace que la usuaria reintente y pague dos veces.
              const { error: confirmError } = await supabaseAdmin
                .from("mail_club_upgrades")
                .update({
                  provider_payment_ref: pi.id,
                  status: "payment_confirmed",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", upgradeId);
              if (confirmError) {
                logger.error({ err: confirmError, upgradeId }, "upgrade payment_confirmed update failed");
              }
              try {
                await applyUpgrade(upgradeId);
                return ok({ applied: true });
              } catch (applyErr) {
                // La activación se completa sola (webhook payment_intent.succeeded) o con el
                // reintento admin. La usuaria ve "estamos confirmando" y no vuelve a pagar.
                logger.error({ err: applyErr, upgradeId, userId: user.id }, "upgrade charged but apply failed");
                return ok({ applied: false, pending: true });
              }
            }
            logger.warn({ upgradeId, piStatus: pi.status }, "upgrade PI not succeeded — checkout fallback");
          }
        } catch (err: any) {
          if (isCardError(err) && !isAuthenticationRequiredError(err)) {
            const message = err?.message || "Tarjeta rechazada";
            logger.warn({ err, upgradeId, userId: user.id }, "upgrade saved-card declined");
            await failUpgrade(message);
            return json(
              {
                error: "Tu tarjeta fue rechazada. Podés intentar con otra tarjeta.",
                code: "PAYMENT_FAILED",
              },
              402,
            );
          }
          if (!isAuthenticationRequiredError(err)) throw err;
          logger.info({ upgradeId, userId: user.id }, "upgrade SCA required — checkout fallback");
        }
      }

      // 2) Checkout: sin tarjeta guardada, con SCA, o reintento explícito.
      return await createCheckoutFallback();
    }

    const { mpClient } = await import("../../lib/mercadopago");
    if (!mpClient) throw new Error("Mercado Pago not configured");
    const { Preference } = await import("mercadopago");
    const preference = new Preference(mpClient);
    const result = await preference.create({
      body: {
        items: [
          {
            id: "mail-club-upgrade",
            title: "Diferencia Mail Club Triba",
            quantity: 1,
            unit_price: diffCents,
            currency_id: "ARS",
          },
        ],
        payer: { email: user.email || "" },
        back_urls: {
          success: `${origin}/api/checkout-return/mail-club-upgrade`,
          failure: `${account}?checkout=canceled`,
          pending: `${account}?checkout=pending`,
        },
        auto_return: "approved",
        external_reference: `mailclub-upgrade:${upgradeId}`,
        notification_url: `${origin}/api/webhook/mercadopago`,
      },
    });
    await supabaseAdmin
      .from("mail_club_upgrades")
      .update({ provider_payment_ref: result.id, updated_at: new Date().toISOString() })
      .eq("id", upgradeId);
    return ok({ url: result.init_point! });
  } catch (err: any) {
    logger.error({ err, userId: user.id, upgradeId }, "upgrade-checkout error");
    await failUpgrade(err.message || "provider error");
    // El detalle técnico queda en el log y en la fila del upgrade (visible para admin), no en pantalla.
    return error(
      `No pudimos completar el cambio de plan. Antes de volver a intentar, revisá tu cuenta: si ves un cobro y el plan no cambió, escribinos a ${SUPPORT_EMAIL}.`,
      500,
    );
  }
};
