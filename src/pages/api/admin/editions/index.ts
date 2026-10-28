import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok, error } from "../../../../lib/response";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import {
  editionFormToInput,
  validateEditionInput,
  isEmptyVersion,
  syncFeaturedBadges,
} from "../../../../lib/admin/editions";
import { logAdminAction } from "../../../../lib/admin/audit";
import { logger } from "../../../../lib/logger";
import { enforceRateLimit } from "../../../../lib/rate-limit";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  const limited = await enforceRateLimit(request, "admin-editions", {
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return error("Body inválido: se esperaba multipart/form-data", 400);
  }

  try {
    const input = editionFormToInput(fd);

    const validated = validateEditionInput(input);
    if (!validated.ok) {
      return error(validated.error, 400);
    }

    if (validated.data.kind === "magazine") {
      const { data: existing } = await supabaseAdmin
        .from("editions")
        .select("id")
        .eq("edition_number", validated.data.edition_number!)
        .maybeSingle();
      if (existing) {
        return error(`Ya existe una edición con número ${validated.data.edition_number}`, 409);
      }

    }

    // Se crea siempre SIN destacar: la anterior solo se reemplaza cuando la nueva ya quedó
    // guardada completa. Antes se desmarcaba primero y un fallo dejaba el sitio sin destacada.
    const { data: issue, error: insertError } = await supabaseAdmin
      .from("editions")
      .insert({
        kind: validated.data.kind,
        edition_number: validated.data.edition_number,
        featured: false,
      })
      .select("id")
      .single();

    if (insertError) {
      logger.error({ err: insertError }, "[editions.create] insert error");
      // 23505 = otra admin creó ese número entre la verificación y el alta.
      if ((insertError as { code?: string }).code === "23505") {
        return error(`Ya existe una edición con número ${validated.data.edition_number}`, 409);
      }
      return error("No se pudo crear la edición. Intentá de nuevo.", 500);
    }

    const versions = validated.data.versions;
    const { error: langError } = await supabaseAdmin
      .from("edition_languages")
      .insert(
        Object.entries(versions)
          .filter(([, v]) => !isEmptyVersion(v))
          .map(([language, v]) => ({
            edition_id: issue.id,
            language: language as "es" | "en",
            title: v!.title,
            description: v!.description,
            cover_url: v!.cover_url,
            pdf_url: v!.pdf_url,
            badge: v!.badge,
          }))
      );

    if (langError) {
      logger.error({ err: langError }, "[editions.create] languages insert error");
      // Se deshace el alta: si no, la edición queda vacía y ocupa el número para siempre.
      await supabaseAdmin.from("editions").delete().eq("id", issue.id);
      return error("No se pudo crear la edición. No quedó nada guardado: intentá de nuevo.", 500);
    }

    if (validated.data.kind === "magazine" && validated.data.featured) {
      const { error: unsetError } = await supabaseAdmin
        .from("editions")
        .update({ featured: false })
        .eq("featured", true)
        .neq("id", issue.id);
      const { error: setError } = unsetError
        ? { error: unsetError }
        : await supabaseAdmin.from("editions").update({ featured: true }).eq("id", issue.id);
      if (unsetError || setError) {
        logger.error({ err: unsetError ?? setError }, "[editions.create] feature swap error");
        return error("La edición se creó, pero no se pudo marcar como destacada. Abrila y guardala de nuevo con 'Ejemplar destacado' activado.", 500);
      }
    }

    // Badge única: se limpia de las demás ediciones y se completa el de la
    // destacada. No bloquea la creación si falla.
    await syncFeaturedBadges();

    await logAdminAction(
      admin.user.id,
      admin.profile.email,
      "edition.created",
      "edition",
      String(issue.id),
      {
        edition_number: validated.data.edition_number,
        title: versions.es?.title,
        languages: Object.keys(versions),
      }
    );

    return ok({ id: issue.id });
  } catch (e) {
    logger.error({ err: e }, "[editions.create] unexpected error");
    return error("No se pudo crear la edición. Intentá de nuevo.", 500);
  }
};
