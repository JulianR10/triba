import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { getPaymentProvider } from "../../lib/payment-provider";
import { getActiveSubscriptionForUser } from "../../lib/subscription-guard";
import { getPlanType } from "../../lib/mail-club";
import { logger } from "../../lib/logger";

// Vuelta al plan digital al final del período pagado. Conserva la cuenta,
// la fecha de renovación y el acceso Mail Club hasta esa fecha.
export const POST: APIRoute = async ({ request }) => {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const user = auth.user;

  try {
    const current = await getActiveSubscriptionForUser(user.id);
    if (!current || getPlanType(current as any) !== "mail_club") {
      return error("Necesitás una suscripción Mail Club activa para volver al plan digital.", 409);
    }
    if (current.provider !== "stripe" && current.provider !== "mercadopago") {
      return error("Tu suscripción actual no admite cambio directo. Escribinos.", 409);
    }
    if ((current as any).scheduled_plan_type === "digital") {
      return ok({ message: "Ya tenés programada la vuelta al plan digital." });
    }

    const { data: full } = await supabaseAdmin
      .from("subscriptions")
      .select("id, provider_subscription_id, current_period_end")
      .eq("id", current.id)
      .maybeSingle();
    if (!full) return error("No active subscription found", 404);

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
      return error(err.message || "No pudimos programar el cambio. Intentá de nuevo.", 500);
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
      return error("El cambio quedó programado en el proveedor pero no pudimos registrarlo. Escribinos.", 500);
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
