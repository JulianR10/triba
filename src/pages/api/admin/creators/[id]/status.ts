import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { logAdminAction } from "../../../../../lib/admin";

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user || locals.profile?.role !== "admin") {
    return json({ error: "Forbidden" }, 403);
  }

  const id = params.id;
  if (!id) return json({ error: "ID inválido" }, 400);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const status = body?.status;
  if (status !== "pending" && status !== "approved" && status !== "rejected") {
    return json({ error: "status debe ser 'pending', 'approved' o 'rejected'" }, 400);
  }

  const update: Record<string, any> = { status };
  if (typeof body?.admin_notes === "string") {
    update.admin_notes = body.admin_notes.trim() || null;
  }

  const { error } = await supabaseAdmin
    .from("creator_applications")
    .update(update)
    .eq("id", id);

  if (error) {
    return json({ error: error.message }, 500);
  }

  logAdminAction(
    locals.user!.id,
    locals.profile!.email,
    `creator.${status}`,
    "creator",
    id,
    { status }
  );

  return json({ ok: true });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
