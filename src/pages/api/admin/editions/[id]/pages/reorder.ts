import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../../lib/auth";
import { ok, error } from "../../../../../../lib/response";
import { supabaseAdmin } from "../../../../../../lib/supabase-admin";
import { logAdminAction } from "../../../../../../lib/admin/audit";

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  const editionId = Number(params.id);
  if (!Number.isInteger(editionId)) {
    return error("ID de edición inválido", 400);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return error("JSON inválido", 400);
  }

  const order: number[] = body.order;
  if (!Array.isArray(order) || order.length === 0) {
    return error("Se requiere un array 'order' con los IDs de páginas en el nuevo orden", 400);
  }

  const updates = order.map((pageId, index) =>
    supabaseAdmin
      .from("edition_pages")
      .update({ page_number: index + 1 })
      .eq("id", pageId)
      .eq("edition_id", editionId)
  );

  const results = await Promise.all(updates);
  const errors = results.filter((r) => r.error);
  if (errors.length > 0) {
    return error(`Error reordenando: ${errors[0].error!.message}`, 500);
  }

  logAdminAction(
    admin.user.id,
    admin.profile.email,
    "edition.pages_reordered",
    "edition",
    String(editionId),
    { page_count: order.length }
  );

  return ok();
};
