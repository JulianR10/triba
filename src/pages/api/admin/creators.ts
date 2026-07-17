import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/auth";
import { ok, error } from "../../../lib/response";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { listCreatorApplicationsForAdmin } from "../../../lib/admin/creators";
import { logAdminAction } from "../../../lib/admin/audit";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") as "all" | "pending" | "approved" | "rejected" | null;
  const filter = statusParam ?? "all";

  if (!["all", "pending", "approved", "rejected"].includes(filter)) {
    return error("status debe ser 'all', 'pending', 'approved' o 'rejected'", 400);
  }

  const applications = await listCreatorApplicationsForAdmin(filter);
  return ok(applications);
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return error("JSON inválido", 400);
  }

  const id = body?.id;
  if (!id || typeof id !== "string") {
    return error("id es requerido", 400);
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
