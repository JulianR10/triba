import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { getPaymentProvider } from "../../lib/payment-provider";
import { getActiveSubscriptionForUser } from "../../lib/subscription-guard";
import { getPlanType } from "../../lib/mail-club";
import { logger } from "../../lib/logger";
import { enforceRateLimit } from "../../lib/rate-limit";
import { SUPPORT_EMAIL } from "../../lib/contact";

// Vuelta al plan digital al final del período pagado. Conserva la cuenta,
// la fecha de renovación y el acceso Mail Club hasta esa fecha.
export const POST: APIRoute = async ({ request }) => {
  const limited = await enforceRateLimit(request, "downgrade", {
    maxRequests: 5,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const user = auth.user;

  try {
    const current = await getActiveSubscriptionForUser(user.id);
    if (!current || getPlanType(current as any) !== "mail_club") {
      return error("Necesitás una suscripción Mail Club activa para volver al plan digital.", 409);
    }
    if (current.provider !== "stripe" && current.provider !== "mercadopago") {
      return error(`Tu suscripción actual no admite cambio directo. Escribinos a ${SUPPORT_EMAIL} y lo resolvemos.`, 409);
    }
    if ((current as any).scheduled_plan_type === "digital") {
      return ok({ message: "Ya tenés programada la vuelta al plan digital." });
    }

    const { data: full } = await supabaseAdmin
      .from("subscriptions")
      .select("id, provider_subscription_id, current_period_end")
      .eq("id", current.id)
      .maybeSingle();
    if (!full) return error("No encontramos tu suscripción para gestionar.", 404);

    const provider = getPaymentProvider(current.provider as "stripe" | "mercadopago");
    let effectiveAt: string | undefined;
    try {
      const res = await provider.downgradeToDigital(
        (full as any).provider_subscription_id,
        current.plan_currency as "EUR" | "USD" | "ARS",
        (full as any).current_period_end,
      );
      effectiveAt = res.effectiveAt;
    } catch (err: any) {
      logger.error({ err, userId: user.id }, "downgrade provider error");
      // Solo se muestra el aviso que redactamos nosotras; el detalle del proveedor queda en el log.
      const knownMessage = typeof err?.message === "string" && err.message.startsWith("La suscripción ya tiene otro cambio");
      return error(
        knownMessage ? err.message : "No pudimos programar el cambio. No se modificó nada: intentá de nuevo en unos minutos.",
        500,
      );
    }

    const { error: dbError } = await supabaseAdmin
      .from("subscriptions")
      .update({
        scheduled_plan_type: "digital",
        scheduled_plan_at: effectiveAt ?? (full as any).current_period_end,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id);
    if (dbError) {
      logger.error({ err: dbError, userId: user.id }, "downgrade flag error");
      return error(`El cambio quedó programado en tu medio de pago pero no pudimos registrarlo en tu cuenta. No lo repitas: escribinos a ${SUPPORT_EMAIL} y lo completamos.`, 500);
    }

    return ok({
      message: "Listo: volvés al plan digital al final del período ya pagado.",
      effectiveAt,
    });
  } catch (err: any) {
    logger.error({ err, userId: user.id }, "downgrade error");
    return error("Internal server error", 500);
  }
};
