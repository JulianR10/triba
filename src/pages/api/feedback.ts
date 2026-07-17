import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { logger } from "../../lib/logger";

const RATE_LIMIT_MS = 60_000;
const MAX_MESSAGE_LENGTH = 2000;

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const user = auth.user;

  let body: { mensaje?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("Invalid body", 400);
  }

  const mensaje = typeof body.mensaje === "string" ? body.mensaje.trim() : "";
  if (!mensaje) {
    return error("El mensaje no puede estar vacío", 400);
  }
  if (mensaje.length > MAX_MESSAGE_LENGTH) {
    return error("El mensaje es demasiado largo", 400);
  }

  try {
    const { data: lastFeedback } = await supabaseAdmin
      .from("feedback")
      .select("created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastFeedback?.created_at) {
      const last = new Date(lastFeedback.created_at).getTime();
      if (Number.isFinite(last) && Date.now() - last < RATE_LIMIT_MS) {
        return error("Esperá un momento antes de enviar otro feedback", 429);
      }
    }

    const { error: insertError } = await supabaseAdmin.from("feedback").insert({
      user_id: user.id,
      mensaje,
    });

    if (insertError) {
      logger.error({ err: insertError, userId: user.id }, "feedback insert error");
      return error("No se pudo guardar el feedback", 500);
    }

    return ok();
  } catch (err) {
    logger.error({ err, userId: user.id }, "feedback error");
    return error("Internal server error", 500);
  }
};
