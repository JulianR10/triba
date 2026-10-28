import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { scheduleProviderCancels } from "../../lib/cancel-providers";
import { logger } from "../../lib/logger";
import { enforceRateLimit } from "../../lib/rate-limit";
import { SUPPORT_EMAIL } from "../../lib/contact";

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

export const POST: APIRoute = async ({ request }) => {
  const limited = await enforceRateLimit(request, "cancel-subscription", {
    maxRequests: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const auth = await requireUser(request, { useAdmin: true });
  if (auth instanceof Response) return auth;
  const user = auth.user;

  try {
    const { data: subs, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("id, provider, provider_subscription_id, status, cancel_at_period_end")
      .eq("user_id", user.id)
      .in("status", CANCELABLE_STATUSES)
      .order("created_at", { ascending: false });

    const subscription = subs?.[0];
    if (subError || !subscription) {
      return error("No encontramos una suscripción cancelable.", 404);
    }

    if (subs.every((s) => s.cancel_at_period_end)) {
      return ok({ message: ALREADY_MESSAGE, alreadyScheduled: true });
    }

    // Todas las filas vigentes: una usuaria puede tener varias y la RPC las
    // marca todas, así que el proveedor debe frenarlas todas también.
    const providerResult = await scheduleProviderCancels(user.id, subs);
    if (providerResult.failed) {
      return error(
        `No pudimos cancelar la recurrencia con el proveedor de pago. No se cambió nada: intentá de nuevo en unos minutos o escribinos a ${SUPPORT_EMAIL}.`,
        502,
      );
    }
    const providerWarnings = providerResult.warnings;

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
      `Tu suscripción cambió de estado y ya no se puede cancelar desde acá. Escribinos a ${SUPPORT_EMAIL} y la gestionamos.`,
      409,
    );
  } catch (err: any) {
    logger.error({ err, userId: user.id }, "cancel-subscription error");
    return error("Internal server error", 500);
  }
};
