import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../../../../lib/supabase-admin";
import { logAdminAction } from "../../../../../../lib/admin";

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user || locals.profile?.role !== "admin") {
    return json({ error: "Forbidden" }, 403);
  }

  const editionId = Number(params.id);
  if (!Number.isInteger(editionId)) {
    return json({ error: "ID de edición inválido" }, 400);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const order: number[] = body.order;
  if (!Array.isArray(order) || order.length === 0) {
    return json({ error: "Se requiere un array 'order' con los IDs de páginas en el nuevo orden" }, 400);
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
    return json({ error: `Error reordenando: ${errors[0].error!.message}` }, 500);
  }

  logAdminAction(
    locals.user!.id,
    locals.profile!.email,
    "edition.pages_reordered",
    "edition",
    String(editionId),
    { page_count: order.length }
  );

  return json({ ok: true });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
