import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { getPaymentProvider } from "../../lib/payment-provider";
import { logger } from "../../lib/logger";
import { getSiteOrigin } from "../../lib/site-url";
import { enforceRateLimit } from "../../lib/rate-limit";
import { SUPPORT_EMAIL } from "../../lib/contact";
import { getPreferredLocale } from "../../lib/locale-pref";

// Estados que pueden llegar al portal: además de active, una suscriptora en
// dunning (past_due) o con un primer cobro pendiente (incomplete) necesita
// poder actualizar su medio de pago.
const PORTAL_STATUSES = ["active", "trialing", "past_due", "incomplete"] as const;

export const POST: APIRoute = async ({ request }) => {
  const limited = await enforceRateLimit(request, "portal", {
    maxRequests: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const user = auth.user;

  // Cliente de servidor: el anónimo no puede leer `subscriptions` (migración 030) y
  // devolvía siempre "no encontramos una suscripción", incluso con el cobro fallido.
  const { data: sub, error: subError } = await supabaseAdmin
    .from("subscriptions")
    .select("provider, provider_subscription_id, status")
    .eq("user_id", user.id)
    .in("status", PORTAL_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError) {
    logger.error({ err: subError, userId: user.id }, "portal subscription lookup error");
    return error("No pudimos abrir el portal de gestión. Intentá de nuevo.", 500);
  }
  if (!sub) {
    return error("No encontramos una suscripción para gestionar.", 404);
  }

  // Las migradas no tienen pasarela: se resuelve antes de exigir referencia de pago.
  if (sub.provider !== "stripe" && sub.provider !== "mercadopago") {
    return ok({
      note: `Tu suscripción migrada se gestiona desde soporte. Escribinos a ${SUPPORT_EMAIL} y te ayudamos.`,
      provider: sub.provider,
    });
  }

  if (!sub.provider_subscription_id) {
    return error("Tu suscripción no tiene una referencia de pago asociada.", 409);
  }

  try {
    const provider = getPaymentProvider(sub.provider as "stripe" | "mercadopago");
    const origin = getSiteOrigin();
    const result = await provider.getPortalUrl(sub.provider_subscription_id, origin, await getPreferredLocale(user.id));
    return ok(result);
  } catch (err: any) {
    logger.error({ err, userId: user.id }, "portal error");
    return error("No pudimos abrir el portal de gestión. Intentá de nuevo.", 500);
  }
};
