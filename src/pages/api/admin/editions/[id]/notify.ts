import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../lib/auth";
import { ok, error } from "../../../../../lib/response";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { sendNewEditionEmail } from "../../../../../lib/email";
import { logger } from "../../../../../lib/logger";

export const prerender = false;

export const POST: APIRoute = async ({ params, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  const editionId = Number(params.id);
  if (!Number.isInteger(editionId)) {
    return error("ID inválido", 400);
  }

  const { data: edition, error: fetchError } = await supabaseAdmin
    .from("editions")
    .select("id, edition_number, title, description, cover_url, kind")
    .eq("id", editionId)
    .single();

  if (fetchError || !edition) {
    return error("Edición no encontrada", 404);
  }

  if (edition.kind !== "magazine" || !edition.cover_url) {
    return ok({ notified: 0, total: 0 });
  }

  const { data: rows, error: subsError } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("role", "subscriber");

  if (subsError) {
    logger.error({ err: subsError }, "Error fetching subscribers for notification");
    return error("Error obteniendo suscriptoras", 500);
  }

  const all = rows ?? [];
  const subscribers = all.filter((s): s is { email: string } => typeof s.email === "string" && s.email.length > 0);
  const noEmail = all.length - subscribers.length;

  if (subscribers.length === 0) {
    return ok({ notified: 0, total: all.length, noEmail });
  }

  let notified = 0;
  let failed = 0;

  for (const sub of subscribers) {
    try {
      await sendNewEditionEmail(sub.email, edition as { title: string; edition_number: number; cover_url: string; description: string; id: number });
      notified++;
    } catch (err) {
      failed++;
      logger.error({ err, email: sub.email, editionId }, "Failed to notify subscriber");
    }
  }

  return ok({ notified, total: all.length, failed, noEmail });
};
