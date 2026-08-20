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

  const { data: issue, error: issueError } = await supabaseAdmin
    .from("editions")
    .select("id, edition_number, kind")
    .eq("id", editionId)
    .maybeSingle();

  if (issueError || !issue) {
    return error("Edición no encontrada", 404);
  }

  if (issue.kind !== "magazine") {
    return ok({ notified: 0, total: 0 });
  }

  const { data: esVersion, error: versionError } = await supabaseAdmin
    .from("edition_languages")
    .select("title, description, cover_url")
    .eq("edition_id", editionId)
    .eq("language", "es")
    .maybeSingle();

  if (versionError || !esVersion || !esVersion.cover_url) {
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
      await sendNewEditionEmail(sub.email, {
        id: issue.id,
        edition_number: issue.edition_number,
        title: esVersion.title,
        description: esVersion.description,
        cover_url: esVersion.cover_url,
      });
      notified++;
    } catch (err) {
      failed++;
      logger.error({ err, email: sub.email, editionId }, "Failed to notify subscriber");
    }
  }

  return ok({ notified, total: all.length, failed, noEmail });
};