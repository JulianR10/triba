import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { ok, error } from "../../lib/response";
import { logger } from "../../lib/logger";
import { checkRateLimit, rateLimitKey } from "../../lib/rate-limit";

export const POST: APIRoute = async ({ request }) => {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";
  const rl = await checkRateLimit(rateLimitKey(ip, "newsletter"), {
    maxRequests: 5,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return error("Demasiados intentos. Esperá un momento.", 429);
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return error("Invalid body", 400);
  }

  const email = body?.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return error("Email inválido", 400);
  }

  const { error: dbError } = await supabaseAdmin
    .from("newsletters")
    .insert({ email });

  if (dbError) {
    if (dbError.code === "23505") {
      return ok({ existing: true });
    }
    logger.error({ err: dbError, email }, "Newsletter subscribe error");
    return error("Error al suscribir", 500);
  }

  return ok();
};
