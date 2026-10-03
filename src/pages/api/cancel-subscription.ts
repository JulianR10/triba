import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { getPaymentProvider } from "../../lib/payment-provider";
import { logger } from "../../lib/logger";

// Cancelación diferida: frena la recurrencia en el proveedor y marca el fin
// del período en la base. Si el proveedor falla, NO se marca localmente
// (responder ok dejaría a la usuaria creyendo que no se le cobra más).
const CANCELABLE_STATUSES = ["active", "trialing", "past_due", "incomplete"] as const;

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireUser(request, { useAdmin: true });
  if (auth instanceof Response) return auth;
  const user = auth.user;

  try {
    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .in("status", CANCELABLE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError || !subscription) {
      return error("No encontramos una suscripción cancelable.", 404);
    }

    if ((subscription as any).cancel_at_period_end) {
      return ok({ message: "Tu suscripción ya se cancela al final del período." });
    }

    const provider = getPaymentProvider(subscription.provider as "stripe" | "mercadopago");

    // For courtesy 'migrated' subs there is no gateway to cancel: skip cleanly.
    if (provider && subscription.provider_subscription_id && subscription.provider !== "migrated") {
      try {
        await provider.scheduleCancel(subscription.provider_subscription_id);
      } catch (err: any) {
        logger.error({ err, userId: user.id }, "cancel-subscription provider error");
        return error(
          "No pudimos cancelar la recurrencia con el proveedor de pago. No se cambió nada; intentá de nuevo o escribinos.",
          502,
        );
      }
    }

    const { error: dbError } = await supabaseAdmin.rpc("cancel_subscription", {
      p_user_id: user.id,
    });

    if (dbError) {
      logger.error({ err: dbError, userId: user.id }, "cancel-subscription rpc error");
      // El proveedor ya frenó la recurrencia: a lo sumo queda cancel_at_period_end
      // sin marcar, pero nunca un cobro futuro. Se informa para reintentar.
      return error("Frenamos la recurrencia, pero no pudimos registrar el estado. Refrescá la página.", 500);
    }

    return ok({
      message: "Listo: tu suscripción se cancela al final del período ya pagado. Conservás el acceso hasta esa fecha.",
    });
  } catch (err: any) {
    logger.error({ err, userId: user.id }, "cancel-subscription error");
    return error("Internal server error", 500);
  }
};
