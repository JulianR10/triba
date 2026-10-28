import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok, error } from "../../../../lib/response";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import {
  editionFormToInput,
  validateEditionInput,
  isEmptyVersion,
  syncFeaturedBadges,
  removeStoredFiles,
} from "../../../../lib/admin/editions";
import { logAdminAction } from "../../../../lib/admin/audit";
import { logger } from "../../../../lib/logger";
import { enforceRateLimit } from "../../../../lib/rate-limit";

export const prerender = false;

// El detalle técnico queda en el log; la admin ve qué pasó y qué hacer.
const SAVE_FAILED = "No se pudo guardar la edición. Revisá los datos e intentá de nuevo; si se repite, avisá al equipo técnico.";

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  const limited = await enforceRateLimit(request, "admin-editions", {
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const editionId = Number(params.id);
  if (!Number.isInteger(editionId)) {
    return error("ID inválido", 400);
  }

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return error("Body inválido", 400);
  }

  try {
    const { data: current, error: currentErr } = await supabaseAdmin
      .from("editions")
      .select("id, edition_number, featured, kind")
      .eq("id", editionId)
      .maybeSingle();

    if (currentErr || !current) {
      return error("Edición no encontrada", 404);
    }

    const input = editionFormToInput(fd, current);
    const validated = validateEditionInput(input);
    if (!validated.ok) {
      return error(validated.error, 400);
    }

    if (
      validated.data.kind === "magazine" &&
      validated.data.edition_number !== current.edition_number
    ) {
      const { data: conflict } = await supabaseAdmin
        .from("editions")
        .select("id")
        .eq("edition_number", validated.data.edition_number!)
        .neq("id", editionId)
        .maybeSingle();
      if (conflict) {
        return error(`Ya existe una edición con número ${validated.data.edition_number}`, 409);
      }
    }

    // Archivos vigentes antes de editar: los reemplazados se borran DESPUÉS de guardar bien.
    const { data: previousVersions } = await supabaseAdmin
      .from("edition_languages")
      .select("language, cover_url, pdf_url")
      .eq("edition_id", editionId);

    if (validated.data.kind === "magazine" && validated.data.featured && !current.featured) {
      const { error: featError } = await supabaseAdmin
        .from("editions")
        .update({ featured: false })
        .eq("featured", true);
      if (featError) {
        logger.error({ err: featError, editionId }, "[editions.update] unset-featured error");
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("editions")
      .update({
        kind: validated.data.kind,
        edition_number: validated.data.edition_number,
        featured: validated.data.featured,
      })
      .eq("id", editionId);

    if (updateError) {
      logger.error({ err: updateError, editionId }, "[editions.update] update error");
      return error(SAVE_FAILED, 500);
    }

    const versions = validated.data.versions;
    const rows = Object.entries(versions)
      .filter(([, v]) => !isEmptyVersion(v))
      .map(([language, v]) => ({
        edition_id: editionId,
        language: language as "es" | "en",
        title: v!.title,
        description: v!.description,
        cover_url: v!.cover_url,
        pdf_url: v!.pdf_url,
        badge: v!.badge,
      }));

    if (rows.length) {
      const { error: langError } = await supabaseAdmin
        .from("edition_languages")
        .upsert(rows, { onConflict: "edition_id,language" });
      if (langError) {
        logger.error({ err: langError, editionId }, "[editions.update] languages upsert error");
        return error(SAVE_FAILED, 500);
      }
    }

    if (!versions.en) {
      const { error: delError } = await supabaseAdmin
        .from("edition_languages")
        .delete()
        .eq("edition_id", editionId)
        .eq("language", "en");
      if (delError) {
        logger.error({ err: delError, editionId }, "[editions.update] languages delete error");
        return error(SAVE_FAILED, 500);
      }
    }

    // Badge única: se limpia de las demás ediciones y se completa el de la
    // destacada. No bloquea la edición si falla.
    await syncFeaturedBadges();

    // Guardado OK: recién ahora se borran los archivos que quedaron sin uso (PDF/portada
    // reemplazados o versión EN quitada). Antes se pisaban antes de guardar.
    const nextByLang = new Map(rows.map((r) => [r.language, r]));
    const stale: (string | null)[] = [];
    for (const prev of previousVersions ?? []) {
      const next = nextByLang.get(prev.language as "es" | "en");
      if (!next || next.cover_url !== prev.cover_url) stale.push(prev.cover_url);
      if (!next || next.pdf_url !== prev.pdf_url) stale.push(prev.pdf_url);
    }
    await removeStoredFiles(stale);

    await logAdminAction(
      admin.user.id,
      admin.profile.email,
      "edition.updated",
      "edition",
      String(editionId),
      {
        edition_number: validated.data.edition_number,
        title: versions.es?.title,
        languages: Object.keys(versions),
      }
    );

    return ok();
  } catch (e) {
    logger.error({ err: e, editionId }, "[editions.update] unexpected error");
    return error(SAVE_FAILED, 500);
  }
};

export const DELETE: APIRoute = async ({ params, locals, request }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  const limited = await enforceRateLimit(request, "admin-editions", {
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const editionId = Number(params.id);
  if (!Number.isInteger(editionId)) {
    return error("ID inválido", 400);
  }

  try {
    const { data: es } = await supabaseAdmin
      .from("edition_languages")
      .select("title")
      .eq("edition_id", editionId)
      .eq("language", "es")
      .maybeSingle();

    const { data: issue } = await supabaseAdmin
      .from("editions")
      .select("edition_number")
      .eq("id", editionId)
      .maybeSingle();

    // Archivos de la edición, para borrarlos de Storage una vez eliminada la fila.
    const { data: filesToRemove } = await supabaseAdmin
      .from("edition_languages")
      .select("cover_url, pdf_url")
      .eq("edition_id", editionId);

    const { data: deleted, error: deleteError } = await supabaseAdmin
      .from("editions")
      .delete()
      .eq("id", editionId)
      .select("id")
      .single();

    if (deleteError) {
      logger.error({ err: deleteError, editionId }, "[editions.delete] delete error");
      return error("No se pudo eliminar la edición. Intentá de nuevo.", 500);
    }

    // Si se borró la destacada, se limpian badges huérfanos.
    await syncFeaturedBadges();

    // Sin esto los PDF y portadas quedaban huérfanos en Storage para siempre.
    await removeStoredFiles((filesToRemove ?? []).flatMap((f) => [f.cover_url, f.pdf_url]));

    await logAdminAction(
      admin.user.id,
      admin.profile.email,
      "edition.deleted",
      "edition",
      String(editionId),
      deleted
        ? { edition_number: issue?.edition_number ?? null, title: es?.title ?? null }
        : undefined
    );

    return ok();
  } catch (e) {
    logger.error({ err: e, editionId }, "[editions.delete] unexpected error");
    return error("No se pudo eliminar la edición. Intentá de nuevo.", 500);
  }
};
