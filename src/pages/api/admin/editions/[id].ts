import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { uploadEditionFile } from "../../../../lib/storage";
import { validateEditionInput, logAdminAction } from "../../../../lib/admin";

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user || locals.profile?.role !== "admin") {
    return json({ error: "Forbidden" }, 403);
  }

  const editionId = Number(params.id);
  if (!Number.isInteger(editionId)) {
    return json({ error: "ID inválido" }, 400);
  }

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }

  const { data: current, error: currentErr } = await supabaseAdmin
    .from("editions")
    .select("*")
    .eq("id", editionId)
    .single();

  if (currentErr || !current) {
    return json({ error: "Edición no encontrada" }, 404);
  }

  const input: Record<string, any> = {
    edition_number: fd.get("edition_number") ? Number(fd.get("edition_number")) : current.edition_number,
    title: fd.get("title") ?? current.title,
    description: fd.get("description") ?? current.description,
    cover_url: current.cover_url,
    pdf_url: current.pdf_url,
    featured: fd.has("featured") ? fd.get("featured") === "true" || fd.get("featured") === "on" : current.featured,
    badge: fd.has("badge") ? (fd.get("badge") || null) : current.badge,
  };

  const coverFile = fd.get("cover_file");
  const pdfFile = fd.get("pdf_file");
  if (coverFile instanceof File && coverFile.size > 0) {
    try {
      const result = await uploadEditionFile(coverFile, "cover", input.edition_number);
      input.cover_url = result.url;
    } catch (err: any) {
      return json({ error: err.message || "Error subiendo portada" }, 400);
    }
  }
  if (pdfFile instanceof File && pdfFile.size > 0) {
    try {
      const result = await uploadEditionFile(pdfFile, "pdf", input.edition_number);
      input.pdf_url = result.url;
    } catch (err: any) {
      return json({ error: err.message || "Error subiendo PDF" }, 400);
    }
  }

  const validated = validateEditionInput(input);
  if (!validated.ok) {
    return json({ error: validated.error }, 400);
  }

  if (validated.data.edition_number !== current.edition_number) {
    const { data: conflict } = await supabaseAdmin
      .from("editions")
      .select("id")
      .eq("edition_number", validated.data.edition_number)
      .neq("id", editionId)
      .maybeSingle();
    if (conflict) {
      return json({ error: `Ya existe una edición con número ${validated.data.edition_number}` }, 409);
    }
  }

  if (validated.data.featured && !current.featured) {
    await supabaseAdmin.from("editions").update({ featured: false }).eq("featured", true);
  }

  const { error } = await supabaseAdmin
    .from("editions")
    .update(validated.data)
    .eq("id", editionId);

  if (error) {
    return json({ error: error.message }, 500);
  }

  logAdminAction(
    locals.user!.id,
    locals.profile!.email,
    "edition.updated",
    "edition",
    String(editionId),
    { edition_number: validated.data.edition_number, title: validated.data.title }
  );

  return json({ ok: true });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user || locals.profile?.role !== "admin") {
    return json({ error: "Forbidden" }, 403);
  }

  const editionId = Number(params.id);
  if (!Number.isInteger(editionId)) {
    return json({ error: "ID inválido" }, 400);
  }

  const { data: deleted, error } = await supabaseAdmin
    .from("editions")
    .delete()
    .eq("id", editionId)
    .select("edition_number, title")
    .single();

  if (error) {
    return json({ error: error.message }, 500);
  }

  logAdminAction(
    locals.user!.id,
    locals.profile!.email,
    "edition.deleted",
    "edition",
    String(editionId),
    deleted ? { edition_number: (deleted as any).edition_number, title: (deleted as any).title } : undefined
  );

  return json({ ok: true });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
