import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../../../../../lib/supabase-admin";
import { logAdminAction } from "../../../../../../../lib/admin";

export const prerender = false;

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user || locals.profile?.role !== "admin") {
    return json({ error: "Forbidden" }, 403);
  }

  const editionId = Number(params.id);
  const pageId = Number(params.pageId);

  if (!Number.isInteger(editionId) || !Number.isInteger(pageId)) {
    return json({ error: "ID inválido" }, 400);
  }

  const { data: page, error: findErr } = await supabaseAdmin
    .from("edition_pages")
    .select("id, image_url, page_number")
    .eq("id", pageId)
    .eq("edition_id", editionId)
    .single();

  if (findErr || !page) {
    return json({ error: "Página no encontrada" }, 404);
  }

  const { error: delErr } = await supabaseAdmin
    .from("edition_pages")
    .delete()
    .eq("id", pageId);

  if (delErr) {
    return json({ error: delErr.message }, 500);
  }

  logAdminAction(
    locals.user!.id,
    locals.profile!.email,
    "edition.page_deleted",
    "edition",
    String(editionId),
    { page_number: page.page_number }
  );

  return json({ ok: true });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
