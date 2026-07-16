import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../../../../lib/supabase-admin";
import { uploadEditionFile } from "../../../../../../lib/storage";
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

  const { data: edition } = await supabaseAdmin
    .from("editions")
    .select("id, edition_number")
    .eq("id", editionId)
    .single();
  if (!edition) {
    return json({ error: "Edición no encontrada" }, 404);
  }

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }

  const files = fd.getAll("pages") as File[];
  const validFiles = files.filter((f) => f instanceof File && f.size > 0 && f.name);

  if (validFiles.length === 0) {
    return json({ error: "No se recibieron archivos. Enviá los archivos con el campo 'pages'." }, 400);
  }

  // Get current max page number
  const { data: existingPages } = await supabaseAdmin
    .from("edition_pages")
    .select("page_number")
    .eq("edition_id", editionId)
    .order("page_number", { ascending: false })
    .limit(1);
  let nextPageNumber = ((existingPages?.[0] as any)?.page_number || 0) + 1;

  const uploaded: { page_number: number; image_url: string; alt_text: string }[] = [];

  for (const file of validFiles) {
    try {
      const result = await uploadEditionFile(file, "page", edition.edition_number);
      uploaded.push({
        page_number: nextPageNumber++,
        image_url: result.url,
        alt_text: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") || `Página ${nextPageNumber - 1}`,
      });
    } catch (err: any) {
      return json({ error: `Error subiendo ${file.name}: ${err.message}` }, 400);
    }
  }

  const { error: insertErr } = await supabaseAdmin
    .from("edition_pages")
    .insert(uploaded.map((p) => ({ ...p, edition_id: editionId })));

  if (insertErr) {
    return json({ error: insertErr.message }, 500);
  }

  logAdminAction(
    locals.user!.id,
    locals.profile!.email,
    "edition.pages_uploaded",
    "edition",
    String(editionId),
    { pages_uploaded: uploaded.length, edition_number: edition.edition_number }
  );

  return json({ ok: true, pages_uploaded: uploaded.length });
};

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user || locals.profile?.role !== "admin") {
    return json({ error: "Forbidden" }, 403);
  }

  const editionId = Number(params.id);
  if (!Number.isInteger(editionId)) {
    return json({ error: "ID de edición inválido" }, 400);
  }

  const { data: pages, error } = await supabaseAdmin
    .from("edition_pages")
    .select("*")
    .eq("edition_id", editionId)
    .order("page_number", { ascending: true });

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json(pages || []);
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
