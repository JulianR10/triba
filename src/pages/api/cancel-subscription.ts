import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { getPaymentProvider } from "../../lib/payment-provider";
import { logger } from "../../lib/logger";

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireUser(request, { useAdmin: true });
  if (auth instanceof Response) return auth;
  const user = auth.user;

  try {
    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (subError || !subscription) {
      return error("No active subscription found", 404);
    }

    const provider = getPaymentProvider(subscription.provider);
    const providerWarnings: string[] = [];

    try {
      await provider.cancelSubscription(subscription.provider_subscription_id);
    } catch (err: any) {
      providerWarnings.push(err.message || "Provider cancel failed");
    }

    const { error: dbError } = await supabaseAdmin.rpc("cancel_subscription", {
      p_user_id: user.id,
    });

    if (dbError) {
      return error("Failed to update subscription", 500);
    }

    return ok({
      message: "Suscripción cancelada correctamente",
      providerWarnings: providerWarnings.length > 0 ? providerWarnings : undefined,
    });
  } catch (err: any) {
    logger.error({ err, userId: user.id }, "cancel-subscription error");
    return error("Internal server error", 500);
  }
};
