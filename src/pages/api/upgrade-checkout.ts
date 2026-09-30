import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { checkRateLimit, rateLimitKey } from "../../lib/rate-limit";
import { logger } from "../../lib/logger";
import { getSiteOrigin } from "../../lib/site-url";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { getActiveSubscriptionForUser } from "../../lib/subscription-guard";
import { validateMailClubAddress, saveMailClubAddress } from "../../lib/mail-club-address";
import { getPlanType, MAIL_CLUB_UPGRADE_DIFF_CENTS } from "../../lib/mail-club";

// Upgrade voluntario digital -> Mail Club: cobra UNA vez la diferencia del
// mes en curso. La tarifa recurrente cambia solo cuando ese pago se confirma
// (webhooks). Nunca cancela ni recrea la suscripción existente.
export const POST: APIRoute = async ({ request }) => {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";
  const rl = await checkRateLimit(rateLimitKey(ip, "upgrade-checkout"), {
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return error("Demasiados intentos. Esperá un momento.", 429);
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
    return error("Tu suscripción actual no admite upgrade directo. Escribinos.", 409);
  }

  const validated = validateMailClubAddress(body);
  if (!validated.ok) return error(validated.error, 400);

  const currency = current.plan_currency as "EUR" | "USD" | "ARS";
  const provider = current.provider as "stripe" | "mercadopago";
  const diffCents = MAIL_CLUB_UPGRADE_DIFF_CENTS[currency];

  const saved = await saveMailClubAddress(supabaseAdmin, user.id, validated.address);
  if (!saved.ok) {
    logger.error({ userId: user.id, step: saved.error }, "upgrade address/consent save error");
    return error("No pudimos guardar tu dirección. Intentá de nuevo.", 500);
  }

  const { data: upgrade, error: rowError } = await supabaseAdmin
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
  if (rowError || !upgrade) {
    // 23505 del índice parcial: ya hay un upgrade pendiente en curso.
    if ((rowError as any)?.code === "23505") {
      return error("Ya tenés un upgrade en curso. Revisá tu email o esperá unos minutos.", 409);
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
    if (provider === "stripe") {
      const { stripe } = await import("../../lib/stripe");
      if (!stripe) throw new Error("Stripe not configured");
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
        success_url: `${origin}/mi-cuenta?checkout=success`,
        cancel_url: `${origin}/mi-cuenta?checkout=canceled`,
        metadata: { user_id: user.id, upgrade_id: upgradeId, plan: "mail_club_upgrade" },
      });
      await supabaseAdmin
        .from("mail_club_upgrades")
        .update({ provider_payment_ref: session.id, updated_at: new Date().toISOString() })
        .eq("id", upgradeId);
      return ok({ url: session.url! });
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
          success: `${origin}/mi-cuenta?checkout=success`,
          failure: `${origin}/mi-cuenta?checkout=canceled`,
          pending: `${origin}/mi-cuenta?checkout=pending`,
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
    return error(err.message || "Internal server error", 500);
  }
};
