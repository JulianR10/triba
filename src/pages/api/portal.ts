import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { supabase } from "../../lib/supabase";
import { getPaymentProvider } from "../../lib/payment-provider";
import { logger } from "../../lib/logger";
import { getSiteOrigin } from "../../lib/site-url";

// Estados que pueden llegar al portal: además de active, una suscriptora en
// dunning (past_due) o con un primer cobro pendiente (incomplete) necesita
// poder actualizar su medio de pago.
const PORTAL_STATUSES = ["active", "trialing", "past_due", "incomplete"] as const;

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const user = auth.user;

  if (!supabase) {
    return error("Internal server error", 500);
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("provider, provider_subscription_id, status")
    .eq("user_id", user.id)
    .in("status", PORTAL_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) {
    return error("No encontramos una suscripción para gestionar.", 404);
  }

  if (!sub.provider_subscription_id) {
    return error("Tu suscripción no tiene una referencia de pago asociada.", 409);
  }

  if (sub.provider !== "stripe" && sub.provider !== "mercadopago") {
    return ok({
      note: "Tu suscripción migrada se gestiona desde soporte. Escribinos y te ayudamos.",
      provider: sub.provider,
    });
  }

  try {
    const provider = getPaymentProvider(sub.provider as "stripe" | "mercadopago");
    const origin = getSiteOrigin();
    const result = await provider.getPortalUrl(sub.provider_subscription_id, origin);
    return ok(result);
  } catch (err: any) {
    logger.error({ err, userId: user.id }, "portal error");
    return error("No pudimos abrir el portal de gestión. Intentá de nuevo.", 500);
  }
};
