import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../lib/auth";
import { ok, error, json } from "../../../../../lib/response";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { sendNewEditionEmail } from "../../../../../lib/email";
import { logger } from "../../../../../lib/logger";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { isActiveSubscription } from "../../../../../lib/subscription-status";

export const prerender = false;

export const POST: APIRoute = async ({ params, locals, request }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  const limited = await enforceRateLimit(request, "admin-notify", {
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  // Optional body { emails: string[] } to retry only failed ones — backward compat: no body = all
  let filterEmails: Set<string> | null = null;
  // force: reenvío deliberado a todas aunque la edición ya se haya avisado.
  let force = false;
  try {
    const raw = await request.clone().text();
    if (raw) {
      const body = JSON.parse(raw);
      force = body?.force === true;
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

  // PostgREST corta en 1000 filas por request: se pagina para no dejar suscriptoras afuera.
  const PAGE = 1000;
  const rows: Array<{ id: string; email: string | null; preferred_locale: "es" | "en"; subscription_id: string | null }> = [];
  const liveSubIds = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error: subsError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, preferred_locale, subscription_id")
      .eq("role", "subscriber")
      .order("id")
      .range(from, from + PAGE - 1);
    if (subsError) {
      logger.error({ err: subsError }, "Error fetching subscribers for notification");
      return error("Error obteniendo suscriptoras", 500);
    }
    rows.push(...((data as typeof rows) ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }
  for (let from = 0; ; from += PAGE) {
    const { data, error: liveError } = await supabaseAdmin
      .from("subscriptions")
      .select("id, status, current_period_end")
      .in("status", ["active", "migrated"])
      .order("id")
      .range(from, from + PAGE - 1);
    if (liveError) {
      logger.error({ err: liveError }, "Error fetching live subscriptions for notification");
      return error("Error obteniendo suscriptoras", 500);
    }
    for (const s of data ?? []) {
      if (isActiveSubscription(s.status, s.current_period_end)) liveSubIds.add(s.id);
    }
    if ((data?.length ?? 0) < PAGE) break;
  }

  // Mismo criterio que el gate de acceso: solo quien hoy puede abrir la edición.
  const all = rows.filter((r) => r.subscription_id && liveSubIds.has(r.subscription_id));
  const allWithEmail = all.filter((s): s is typeof s & { email: string } =>
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

  // Reclamo atómico ANTES de enviar: un doble clic o dos admins a la vez no avisan dos veces a
  // todas las suscriptoras. El reintento de fallidas (filterEmails) no necesita reclamo.
  let claimed = false;
  if (!filterEmails) {
    let claim = supabaseAdmin
      .from("editions")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", editionId);
    if (!force) claim = claim.is("notified_at", null);
    const { data: claimedRows, error: claimError } = await claim.select("id");
    if (claimError) {
      logger.error({ err: claimError, editionId }, "notify claim failed");
      return error(
        "No se pudo registrar el envío (¿falta aplicar la migración 033?). No se envió ningún mail.",
        500,
      );
    }
    if (!claimedRows || claimedRows.length === 0) {
      const { data: prior } = await supabaseAdmin
        .from("editions")
        .select("notified_at")
        .eq("id", editionId)
        .maybeSingle();
      const when = prior?.notified_at
        ? new Date(prior.notified_at).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })
        : "antes";
      return json(
        {
          error: `Ya se avisó a las suscriptoras de esta edición (${when}). Si de verdad necesitás volver a enviarlo a todas, confirmá el reenvío.`,
          code: "already_notified",
        },
        409,
      );
    }
    claimed = true;
  }

  let notified = 0;
  let failed = 0;
  const failures: Array<{ email: string; error: string }> = [];

  const sendOne = async (sub: (typeof subscribers)[number]) => {
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
      logger.error({ err, subscriberId: sub.id, editionId }, "Failed to notify subscriber");
    }
  };

  // Lotes de 5 en paralelo: mismo resultado que en serie, pero ~5x más rápido dentro del límite del request.
  for (let i = 0; i < subscribers.length; i += 5) {
    await Promise.all(subscribers.slice(i, i + 5).map(sendOne));
  }

  // Si no salió ningún mail (p. ej. Sender caído) se libera el reclamo para poder reintentar el envío completo.
  if (claimed && notified === 0 && failed > 0) {
    await supabaseAdmin.from("editions").update({ notified_at: null }).eq("id", editionId);
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
