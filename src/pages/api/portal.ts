import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { supabase } from "../../lib/supabase";
import { getPaymentProvider } from "../../lib/payment-provider";
import { logger } from "../../lib/logger";

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const user = auth.user;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("provider, provider_subscription_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!sub) {
    return error("No active subscription", 404);
  }

  try {
    const provider = getPaymentProvider(sub.provider);
    const origin = new URL(request.url).origin;
    const result = await provider.getPortalUrl(sub.provider_subscription_id, origin);
    return ok(result);
  } catch (err: any) {
    logger.error({ err, userId: user.id }, "portal error");
    return error("Internal server error", 500);
  }
};
