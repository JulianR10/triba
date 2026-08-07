import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok, error } from "../../../../lib/response";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { uploadEditionFile } from "../../../../lib/storage";
import { validateEditionInput } from "../../../../lib/admin/editions";
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

  const kind = fd.get("kind") === "free" ? "free" : "magazine";

  const input: Record<string, any> = {
    kind,
    edition_number: kind === "free" ? undefined : fd.get("edition_number") ? Number(fd.get("edition_number")) : undefined,
    title: fd.get("title"),
    description: fd.get("description"),
    cover_url: fd.get("cover_url") || undefined,
    pdf_url: fd.get("pdf_url") || null,
    featured: false,
    badge: null,
  };

  const coverFile = fd.get("cover_file");
  const pdfFile = fd.get("pdf_file");
  if (coverFile instanceof File && coverFile.size > 0 && kind === "magazine") {
    try {
      const result = await uploadEditionFile(coverFile, "cover", input.edition_number);
      input.cover_url = result.url;
    } catch (err: any) {
      return error(err.message || "Error subiendo portada", 400);
    }
  }
  if (pdfFile instanceof File && pdfFile.size > 0) {
    try {
      const slug = kind === "free" ? `articulo-gratis-${Date.now()}` : undefined;
      const result = await uploadEditionFile(pdfFile, "pdf", input.edition_number, { slug });
      input.pdf_url = result.url;
    } catch (err: any) {
      return error(err.message || "Error subiendo PDF", 400);
    }
  }

  if (kind === "magazine" && !input.cover_url) {
    return error("cover_url es obligatorio (subí una portada o pegá una URL)", 400);
  }

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
      await supabaseAdmin.from("editions").update({ featured: false }).eq("featured", true);
    }
  }

  const { data, error: insertError } = await supabaseAdmin
    .from("editions")
    .insert(validated.data)
    .select("id")
    .single();

  if (insertError) {
    return error(insertError.message, 500);
  }

  logAdminAction(
    admin.user.id,
    admin.profile.email,
    "edition.created",
    "edition",
    String(data.id),
    { edition_number: validated.data.edition_number, title: validated.data.title }
  );

  return ok({ id: data.id });
};
