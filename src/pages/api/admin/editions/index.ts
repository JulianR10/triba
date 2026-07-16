import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { uploadEditionFile } from "../../../../lib/storage";
import { validateEditionInput, logAdminAction } from "../../../../lib/admin";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.profile?.role !== "admin") {
    return json({ error: "Forbidden" }, 403);
  }

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return json({ error: "Body inválido: se esperaba multipart/form-data" }, 400);
  }

  const input: Record<string, any> = {
    edition_number: fd.get("edition_number") ? Number(fd.get("edition_number")) : undefined,
    title: fd.get("title"),
    description: fd.get("description"),
    cover_url: fd.get("cover_url") || undefined,
    pdf_url: fd.get("pdf_url") || null,
    featured: fd.get("featured") === "true" || fd.get("featured") === "on",
    badge: fd.get("badge") || null,
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

  if (!input.cover_url) {
    return json({ error: "cover_url es obligatorio (subí una portada o pegá una URL)" }, 400);
  }

  const validated = validateEditionInput(input);
  if (!validated.ok) {
    return json({ error: validated.error }, 400);
  }

  const { data: existing } = await supabaseAdmin
    .from("editions")
    .select("id")
    .eq("edition_number", validated.data.edition_number)
    .maybeSingle();
  if (existing) {
    return json({ error: `Ya existe una edición con número ${validated.data.edition_number}` }, 409);
  }

  if (validated.data.featured) {
    await supabaseAdmin.from("editions").update({ featured: false }).eq("featured", true);
  }

  const { data, error } = await supabaseAdmin
    .from("editions")
    .insert(validated.data)
    .select("id")
    .single();

  if (error) {
    return json({ error: error.message }, 500);
  }

  logAdminAction(
    locals.user!.id,
    locals.profile!.email,
    "edition.created",
    "edition",
    String(data.id),
    { edition_number: validated.data.edition_number, title: validated.data.title }
  );

  return json({ ok: true, id: data.id });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
