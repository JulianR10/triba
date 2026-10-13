import { supabaseAdmin } from "./supabase-admin";
import { logger } from "./logger";
import { error } from "./response";

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitKey {
  ip: string;
  endpoint: string;
}

export type RateLimitResult =
  | { allowed: true; retryAfterMs: 0; unavailable?: false }
  | { allowed: false; retryAfterMs: number; unavailable?: false }
  | { allowed: false; retryAfterMs: 0; unavailable: true };

export async function checkRateLimit(
  key: RateLimitKey,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { ip, endpoint } = key;
  const since = new Date(Date.now() - config.windowMs).toISOString();

  try {
    const { count, error: countError } = await supabaseAdmin
      .from("rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("endpoint", endpoint)
      .gte("created_at", since);

    if (countError || count === null) {
      logger.error({ endpoint, code: countError?.code }, "rate limit counter unavailable");
      return { allowed: false, retryAfterMs: 0, unavailable: true };
    }

    if (count >= config.maxRequests) {
      const { data: oldest, error: oldestError } = await supabaseAdmin
        .from("rate_limits")
        .select("created_at")
        .eq("ip", ip)
        .eq("endpoint", endpoint)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (oldestError) {
        logger.warn({ endpoint, code: oldestError.code }, "rate limit retry window lookup failed");
      }
      const retryAfterMs = oldest?.created_at
        ? new Date(oldest.created_at).getTime() + config.windowMs - Date.now()
        : config.windowMs;

      return { allowed: false, retryAfterMs: Math.max(1, retryAfterMs) };
    }

    const { error: insertError } = await supabaseAdmin.from("rate_limits").insert({ ip, endpoint });
    if (insertError) {
      logger.error({ endpoint, code: insertError.code }, "rate limit counter insert failed");
      return { allowed: false, retryAfterMs: 0, unavailable: true };
    }

    return { allowed: true, retryAfterMs: 0 };
  } catch (err) {
    // The limit store is a security control: backend errors must not open the route.
    logger.error({ endpoint, errorType: err instanceof Error ? err.name : typeof err }, "rate limit store request failed");
    return { allowed: false, retryAfterMs: 0, unavailable: true };
  }
}

export function rateLimitKey(ip: string, endpoint: string): RateLimitKey {
  // Keep the full address as its own database column; splitting a composite
  // `ip:endpoint` string truncates IPv6 addresses at their first colon.
  return { ip: ip.trim().toLowerCase() || "unknown", endpoint };
}

export function clientIpFromRequest(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

// Aplica el límite y devuelve la respuesta 429/503 cuando corresponde, o
// null para continuar. Los webhooks de Stripe/MP quedan excluidos a
// propósito: sus reintentos son legítimos y ya están firmados. El login no
// tiene endpoint propio (Supabase Auth desde el cliente), así que se cubren
// las rutas de cuenta y administración que sí pasan por el servidor.
export async function enforceRateLimit(
  request: Request,
  endpoint: string,
  config: RateLimitConfig,
): Promise<Response | null> {
  const rl = await checkRateLimit(rateLimitKey(clientIpFromRequest(request), endpoint), config);
  if (rl.unavailable) {
    return error("El servicio está temporalmente no disponible. Intentá de nuevo.", 503);
  }
  if (!rl.allowed) {
    return error("Demasiados intentos. Esperá un momento.", 429);
  }
  return null;
}
