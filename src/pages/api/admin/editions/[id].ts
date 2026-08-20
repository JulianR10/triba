import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok, error } from "../../../../lib/response";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import {
  editionFormToInput,
  validateEditionInput,
  isEmptyVersion,
} from "../../../../lib/admin/editions";
import { logAdminAction } from "../../../../lib/admin/audit";

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

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

    if (validated.data.kind === "magazine" && validated.data.featured && !current.featured) {
      const { error: featError } = await supabaseAdmin
        .from("editions")
        .update({ featured: false })
        .eq("featured", true);
      if (featError) {
        console.error(`[editions.update:${editionId}] unset-featured error:`, featError);
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
      console.error(`[editions.update:${editionId}] update error:`, updateError);
      return error(updateError.message, 500);
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
        console.error(`[editions.update:${editionId}] languages upsert error:`, langError);
        return error(langError.message, 500);
      }
    }

    if (!versions.en) {
      const { error: delError } = await supabaseAdmin
        .from("edition_languages")
        .delete()
        .eq("edition_id", editionId)
        .eq("language", "en");
      if (delError) {
        console.error(`[editions.update:${editionId}] languages delete error:`, delError);
        return error(delError.message, 500);
      }
    }

    logAdminAction(
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
    console.error(`[editions.update:${editionId}] unexpected error:`, e);
    return error(e instanceof Error ? e.message : "Error inesperado al actualizar la edición", 500);
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

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

    const { data: deleted, error: deleteError } = await supabaseAdmin
      .from("editions")
      .delete()
      .eq("id", editionId)
      .select("id")
      .single();

    if (deleteError) {
      console.error(`[editions.delete:${editionId}] delete error:`, deleteError);
      return error(deleteError.message, 500);
    }

    logAdminAction(
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
    console.error(`[editions.delete:${editionId}] unexpected error:`, e);
    return error(e instanceof Error ? e.message : "Error inesperado al eliminar la edición", 500);
  }
};