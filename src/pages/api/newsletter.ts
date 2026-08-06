import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { ok, error } from "../../lib/response";
import { logger } from "../../lib/logger";
import { checkRateLimit, rateLimitKey } from "../../lib/rate-limit";
import { syncFreeSubscriber } from "../../lib/sender";

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
      const { data: existing } = await supabaseAdmin
        .from("newsletters")
        .select("sender_synced")
        .eq("email", email)
        .maybeSingle();

      // El subscriptor ya existía. Si el welcome nunca llegó (sync a Sender falló en
      // silencio), reintentamos el alta en Sender para que la automatización de bienvenida
      // se dispare. Idempotente: para los ya sync'eados no re-dispara nada.
      if (existing && !existing.sender_synced) {
        const resynced = await syncSenderForEmail(email);
        return ok({ existing: true, resynced });
      }
      return ok({ existing: true, resynced: false });
    }
    logger.error({ err: dbError, email }, "Newsletter subscribe error");
    return new Response(
      JSON.stringify({
        error: "Error al suscribir",
        debug: { code: dbError.code, message: dbError.message, email },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  await syncSenderForEmail(email);

  return ok();
};

async function syncSenderForEmail(email: string): Promise<boolean> {
  try {
    await syncFreeSubscriber(email);
    await supabaseAdmin
      .from("newsletters")
      .update({ sender_synced: true, sender_synced_at: new Date().toISOString(), sender_sync_error: null })
      .eq("email", email);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, email }, "Sender sync error");
    await supabaseAdmin
      .from("newsletters")
      .update({ sender_synced: false, sender_sync_error: message.slice(0, 500) })
      .eq("email", email);
    return false;
  }
}
