import { supabaseAdmin } from "./supabase-admin";

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const [ip, endpoint] = key.split(":");
  const since = new Date(Date.now() - config.windowMs).toISOString();

  const { count, error: countError } = await supabaseAdmin
    .from("rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("endpoint", endpoint)
    .gte("created_at", since);

  if (countError) {
    return { allowed: true, retryAfterMs: 0 };
  }

  if (count != null && count >= config.maxRequests) {
    const oldestAllowed = new Date(Date.now() - config.windowMs).getTime();
    const { data: oldest } = await supabaseAdmin
      .from("rate_limits")
      .select("created_at")
      .eq("ip", ip)
      .eq("endpoint", endpoint)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const retryAfterMs = oldest?.created_at
      ? new Date(oldest.created_at).getTime() + config.windowMs - Date.now()
      : config.windowMs;

    return { allowed: false, retryAfterMs: Math.max(1, retryAfterMs) };
  }

  await supabaseAdmin.from("rate_limits").insert({
    ip,
    endpoint,
  });

  return { allowed: true, retryAfterMs: 0 };
}

export function rateLimitKey(ip: string, endpoint: string): string {
  return `${ip}:${endpoint}`;
}
