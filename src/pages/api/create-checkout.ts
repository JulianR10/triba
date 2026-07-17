import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { getPaymentProvider } from "../../lib/payment-provider";
import { checkRateLimit, rateLimitKey } from "../../lib/rate-limit";
import { logger } from "../../lib/logger";

const validProviders = ["stripe", "mercadopago"] as const;
const validCurrencies = ["EUR", "USD", "ARS"] as const;

export const POST: APIRoute = async ({ request }) => {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";
  const rl = checkRateLimit(rateLimitKey(ip, "create-checkout"), {
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return error("Demasiados intentos. Esperá un momento.", 429);
  }

  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const user = auth.user;

  let body: { provider: string; currency: string };
  try {
    body = await request.json();
  } catch {
    return error("Invalid body", 400);
  }

  if (!validProviders.includes(body.provider as any)) {
    return error("Invalid provider", 400);
  }
  if (!validCurrencies.includes(body.currency as any)) {
    return error("Invalid currency", 400);
  }

  const { provider, currency } = body;

  try {
    const paymentProvider = getPaymentProvider(provider);
    const origin = new URL(request.url).origin;
    const result = await paymentProvider.createCheckout({
      userId: user.id,
      userEmail: user.email,
      currency: currency,
      origin,
    });
    return ok(result);
  } catch (err: any) {
    logger.error({ err, userId: user.id, provider, currency }, "create-checkout error");
    return error(err.message || "Internal server error", 500);
  }
};
