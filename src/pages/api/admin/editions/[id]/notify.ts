import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../lib/auth";
import { ok, error } from "../../../../../lib/response";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { sendNewEditionEmail } from "../../../../../lib/email";
import { logger } from "../../../../../lib/logger";

export const prerender = false;

export const POST: APIRoute = async ({ params, locals, request }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  // Optional body { emails: string[] } to retry only failed ones — backward compat: no body = all
  let filterEmails: Set<string> | null = null;
  try {
    const raw = await request.clone().text();
    if (raw) {
      const body = JSON.parse(raw);
      if (Array.isArray(body?.emails) && body.emails.length > 0) {
        filterEmails = new Set(
          body.emails
            .filter((e: unknown) => typeof e === "string" && (e as string).includes("@"))
            .map((e: string) => e.toLowerCase().trim()),
        );
      }
    }
  } catch {
    // ignore malformed body — notify all
  }

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

  const { data: enVersion } = await supabaseAdmin
    .from("edition_languages")
    .select("title, description, cover_url")
    .eq("edition_id", editionId)
    .eq("language", "en")
    .maybeSingle();

  const { data: rows, error: subsError } = await supabaseAdmin
    .from("profiles")
    .select("email, preferred_locale")
    .eq("role", "subscriber");

  if (subsError) {
    logger.error({ err: subsError }, "Error fetching subscribers for notification");
    return error("Error obteniendo suscriptoras", 500);
  }

  const all = rows ?? [];
  const allWithEmail = all.filter((s): s is { email: string; preferred_locale: "es" | "en" } =>
    typeof s.email === "string" && s.email.length > 0
  );
  const noEmail = all.length - allWithEmail.length;

  // Apply optional email filter (retry failed only)
  const subscribers = filterEmails
    ? allWithEmail.filter((s) => filterEmails!.has(s.email.toLowerCase().trim()))
    : allWithEmail;

  if (subscribers.length === 0) {
    return ok({ notified: 0, total: filterEmails ? 0 : all.length, noEmail, failures: [], failed: 0 });
  }

  let notified = 0;
  let failed = 0;
  const failures: Array<{ email: string; error: string }> = [];

  for (const sub of subscribers) {
    try {
      const en = sub.preferred_locale === "en" && enVersion && enVersion.cover_url ? enVersion : null;
      const version = en ?? esVersion;
      await sendNewEditionEmail(sub.email, {
        id: issue.id,
        edition_number: issue.edition_number,
        title: version.title,
        description: version.description,
        cover_url: version.cover_url!,
      }, en ? "en" : "es");
      notified++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ email: sub.email, error: msg });
      logger.error({ err, email: sub.email, editionId }, "Failed to notify subscriber");
    }
  }

  // Keep `total` as the attempted count for this call; preserve `noEmail` for backward compat.
  // New field `failures` is actionable, `failed` stays as count.
  return ok({
    notified,
    total: filterEmails ? subscribers.length : all.length,
    failed,
    noEmail,
    failures,
  });
};