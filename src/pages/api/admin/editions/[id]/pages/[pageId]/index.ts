import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../../../lib/auth";
import { ok, error } from "../../../../../../../lib/response";
import { supabaseAdmin } from "../../../../../../../lib/supabase-admin";
import { logAdminAction } from "../../../../../../../lib/admin/audit";

export const prerender = false;

export const DELETE: APIRoute = async ({ params, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  const editionId = Number(params.id);
  const pageId = Number(params.pageId);

  if (!Number.isInteger(editionId) || !Number.isInteger(pageId)) {
    return error("ID inválido", 400);
  }

  const { data: page, error: findErr } = await supabaseAdmin
    .from("edition_pages")
    .select("id, image_url, page_number")
    .eq("id", pageId)
    .eq("edition_id", editionId)
    .single();

  if (findErr || !page) {
    return error("Página no encontrada", 404);
  }

  const { error: delErr } = await supabaseAdmin
    .from("edition_pages")
    .delete()
    .eq("id", pageId);

  if (delErr) {
    return error(delErr.message, 500);
  }

  logAdminAction(
    admin.user.id,
    admin.profile.email,
    "edition.page_deleted",
    "edition",
    String(editionId),
    { page_number: page.page_number }
  );

  return ok();
};
