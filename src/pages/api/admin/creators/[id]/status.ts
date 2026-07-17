import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../lib/auth";
import { ok, error } from "../../../../../lib/response";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { logAdminAction } from "../../../../../lib/admin/audit";

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  const id = params.id;
  if (!id) return error("ID inválido", 400);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return error("JSON inválido", 400);
  }

  const status = body?.status;
  if (status !== "pending" && status !== "approved" && status !== "rejected") {
    return error("status debe ser 'pending', 'approved' o 'rejected'", 400);
  }

  const update: Record<string, any> = { status };
  if (typeof body?.admin_notes === "string") {
    update.admin_notes = body.admin_notes.trim() || null;
  }

  const { error: updateError } = await supabaseAdmin
    .from("creator_applications")
    .update(update)
    .eq("id", id);

  if (updateError) {
    return error(updateError.message, 500);
  }

  logAdminAction(
    admin.user.id,
    admin.profile.email,
    `creator.${status}`,
    "creator",
    id,
    { status }
  );

  return ok();
};
