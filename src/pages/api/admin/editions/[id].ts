import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok, error } from "../../../../lib/response";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { validateEditionInput } from "../../../../lib/admin/editions";
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

  const { data: current, error: currentErr } = await supabaseAdmin
    .from("editions")
    .select("*")
    .eq("id", editionId)
    .single();

  if (currentErr || !current) {
    return error("Edición no encontrada", 404);
  }

  const kind = fd.get("kind") === "free" ? "free" : fd.get("kind") === "magazine" ? "magazine" : (current as any).kind;

  const input: Record<string, any> = {
    kind,
    edition_number:
      kind === "free"
        ? null
        : fd.get("edition_number") ? Number(fd.get("edition_number")) : current.edition_number,
    title: fd.get("title") ?? current.title,
    description: fd.get("description") ?? current.description,
    cover_url: (fd.get("cover_url") as string) || current.cover_url,
    pdf_url: (fd.get("pdf_url") as string) || current.pdf_url,
    featured: kind === "free" ? false : (fd.has("featured") ? fd.get("featured") === "true" || fd.get("featured") === "on" : current.featured),
    badge: kind === "free" ? null : (fd.has("badge") ? (fd.get("badge") || null) : current.badge),
  };

  const validated = validateEditionInput(input);
  if (!validated.ok) {
    return error(validated.error, 400);
  }

  if (validated.data.kind === "magazine" && validated.data.edition_number !== current.edition_number) {
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
    await supabaseAdmin.from("editions").update({ featured: false }).eq("featured", true);
  }

  const { error: updateError } = await supabaseAdmin
    .from("editions")
    .update(validated.data)
    .eq("id", editionId);

  if (updateError) {
    return error(updateError.message, 500);
  }

  logAdminAction(
    admin.user.id,
    admin.profile.email,
    "edition.updated",
    "edition",
    String(editionId),
    { edition_number: validated.data.edition_number, title: validated.data.title }
  );

  return ok();
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  const editionId = Number(params.id);
  if (!Number.isInteger(editionId)) {
    return error("ID inválido", 400);
  }

  const { data: deleted, error: deleteError } = await supabaseAdmin
    .from("editions")
    .delete()
    .eq("id", editionId)
    .select("edition_number, title")
    .single();

  if (deleteError) {
    return error(deleteError.message, 500);
  }

  logAdminAction(
    admin.user.id,
    admin.profile.email,
    "edition.deleted",
    "edition",
    String(editionId),
    deleted ? { edition_number: (deleted as any).edition_number, title: (deleted as any).title } : undefined
  );

  return ok();
};
