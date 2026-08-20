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

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

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

      if (validated.data.featured) {
        const { error: featError } = await supabaseAdmin
          .from("editions")
          .update({ featured: false })
          .eq("featured", true);
        if (featError) {
          console.error("[editions.create] unset-featured error:", featError);
        }
      }
    }

    const { data: issue, error: insertError } = await supabaseAdmin
      .from("editions")
      .insert({
        kind: validated.data.kind,
        edition_number: validated.data.edition_number,
        featured: validated.data.featured,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[editions.create] insert error:", insertError);
      return error(insertError.message, 500);
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
      console.error("[editions.create] languages insert error:", langError);
      return error(langError.message, 500);
    }

    logAdminAction(
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
    console.error("[editions.create] unexpected error:", e);
    return error(e instanceof Error ? e.message : "Error inesperado al crear la edición", 500);
  }
};