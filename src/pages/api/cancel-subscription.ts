import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { getPaymentProvider } from "../../lib/payment-provider";
import { logger } from "../../lib/logger";

// Cancelación diferida: frena la recurrencia en el proveedor y marca el fin
// del período en la base. Si el proveedor falla con un error real, NO se
// marca localmente (responder ok dejaría a la usuaria creyendo que no se
// le cobra más). Si el proveedor informa que la baja YA está hecha allí
// (cancelada directo en Stripe/MP), se marca local con advertencia para no
// dejar a la usuaria trabada en un estado incancelable.
const CANCELABLE_STATUSES = ["active", "trialing", "past_due", "incomplete"] as const;

const SUCCESS_MESSAGE =
  "Listo: tu suscripción se cancela al final del período ya pagado. Conservás el acceso hasta esa fecha.";
const ALREADY_MESSAGE = "Tu suscripción ya se cancela al final del período.";

// El proveedor ya frenó la recurrencia por otro canal: no bloquear la baja
// local por eso. Se matchea por mensaje porque Stripe/MP no usan códigos
// estables para este caso (404 No such subscription, sub canceled, etc.).
function isAlreadyCanceledProviderError(message: string): boolean {
  return /no such (subscription|preapproval)|already\s*cancel+ed|has been cancel+ed|resource\s+(not\s+found|missing)|not found/i.test(
    message,
  );
}

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireUser(request, { useAdmin: true });
  if (auth instanceof Response) return auth;
  const user = auth.user;

  try {
    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("id, provider, provider_subscription_id, status, cancel_at_period_end")
      .eq("user_id", user.id)
      .in("status", CANCELABLE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError || !subscription) {
      return error("No encontramos una suscripción cancelable.", 404);
    }

    if (subscription.cancel_at_period_end) {
      return ok({ message: ALREADY_MESSAGE, alreadyScheduled: true });
    }

    const providerWarnings: string[] = [];
    const provider = getPaymentProvider(subscription.provider as "stripe" | "mercadopago");

    // Cortesías 'migrated' no tienen gateway: se marcan directo.
    if (provider && subscription.provider_subscription_id && subscription.provider !== "migrated") {
      try {
        await provider.scheduleCancel(subscription.provider_subscription_id);
      } catch (err: any) {
        const providerMessage = err?.message || String(err);
        if (isAlreadyCanceledProviderError(providerMessage)) {
          // La recurrencia ya está frenada en el proveedor: seguir para
          // reflejarlo local en vez de trabar a la usuaria con un 502.
          logger.warn({ userId: user.id, providerMessage }, "cancel-subscription already canceled at provider");
          providerWarnings.push(
            "La renovación ya figuraba frenada en el proveedor de pago; registramos la baja en Triba.",
          );
        } else {
          logger.error({ err, userId: user.id }, "cancel-subscription provider error");
          return error(
            "No pudimos cancelar la recurrencia con el proveedor de pago. No se cambió nada; intentá de nuevo o escribinos.",
            502,
          );
        }
      }
    }

    const { data: marked, error: dbError } = await supabaseAdmin.rpc("cancel_subscription", {
      p_user_id: user.id,
    });

    if (dbError) {
      logger.error({ err: dbError, userId: user.id }, "cancel-subscription rpc error");
      // El proveedor ya frenó la recurrencia: a lo sumo queda cancel_at_period_end
      // sin marcar, pero nunca un cobro futuro. Se informa para reintentar.
      return error("Frenamos la recurrencia, pero no pudimos registrar el estado. Refrescá la página.", 500);
    }

    if (typeof marked === "number" && marked > 0) {
      return ok({
        message: SUCCESS_MESSAGE,
        providerWarnings: providerWarnings.length > 0 ? providerWarnings : undefined,
      });
    }

    // La RPC es no-op cuando no hay filas pendientes: releer para distinguir
    // idempotencia real (ya programada por otro intento) de estado cambiado.
    const { data: current } = await supabaseAdmin
      .from("subscriptions")
      .select("cancel_at_period_end, status")
      .eq("id", subscription.id)
      .maybeSingle();

    if (current?.cancel_at_period_end) {
      return ok({
        message: ALREADY_MESSAGE,
        alreadyScheduled: true,
        providerWarnings: providerWarnings.length > 0 ? providerWarnings : undefined,
      });
    }

    logger.warn({ userId: user.id, status: current?.status }, "cancel-subscription rpc no-op");
    return error(
      "Tu suscripción cambió de estado y ya no se puede cancelar desde acá. Escribinos y la gestionamos.",
      409,
    );
  } catch (err: any) {
    logger.error({ err, userId: user.id }, "cancel-subscription error");
    return error("Internal server error", 500);
  }
};
