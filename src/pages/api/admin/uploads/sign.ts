import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok, error } from "../../../../lib/response";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { buildStoragePath, fileExt, FILE_RULES, getPublicUrl, buildPdfRef, bucketForKind, type EditionFileKind } from "../../../../lib/storage";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return error("Body inválido: se esperaba JSON", 400);
  }

  const kind: EditionFileKind | null = body.kind === "pdf" ? "pdf" : body.kind === "cover" ? "cover" : null;
  if (!kind) {
    return error("kind inválido: esperado 'cover' | 'pdf'", 400);
  }

  const filename = typeof body.filename === "string" && body.filename ? body.filename : null;
  if (!filename) {
    return error("filename es obligatorio", 400);
  }

  // Esto es un preflight del navegador, no una verificación del contenido real.
  // Después del PUT directo, /uploads/verify comprueba metadata y firma del objeto.
  const rule = FILE_RULES[kind];
  const mime = typeof body.contentType === "string" ? body.contentType : "";
  if (!rule.mime.test(mime)) {
    return error(`Tipo de archivo no permitido: ${mime || "desconocido"}`, 400);
  }
  const size = typeof body.size === "number" ? body.size : 0;
  if (size > rule.maxBytes) {
    const mb = (rule.maxBytes / 1024 / 1024).toFixed(0);
    return error(`Archivo demasiado grande. Máximo ${mb} MB.`, 400);
  }

  const editionNumber =
    kind === "cover"
      ? typeof body.editionNumber === "number" && Number.isInteger(body.editionNumber)
        ? body.editionNumber
        : null
      : typeof body.editionNumber === "number" && Number.isInteger(body.editionNumber)
        ? body.editionNumber
        : undefined;

  if (kind === "cover" && editionNumber === null) {
    return error("Para la portada se necesita el número de edición", 400);
  }

  const slug = kind === "pdf" && typeof body.slug === "string" && body.slug ? body.slug : undefined;
  const language = body.language === "en" ? "en" : "es";
  const ext = fileExt(filename) || (kind === "pdf" ? "pdf" : "jpg");
  const path = buildStoragePath(kind, editionNumber as number | undefined, ext, { slug, language });

  const { data, error: signError } = await supabaseAdmin.storage
    .from(bucketForKind(kind))
    .createSignedUploadUrl(path, { upsert: true });

  if (signError || !data) {
    return error(`Error generando enlace de subida: ${signError?.message || "desconocido"}`, 500);
  }

  // Portadas (bucket público): URL directa. PDFs (bucket privado): referencia
  // interna storage:// que solo el servidor resuelve vía firmada.
  const fileRef = kind === "pdf" ? buildPdfRef(data.path ?? path) : getPublicUrl(data.path ?? path);

  return ok({
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path,
    bucket: bucketForKind(kind),
    fileRef,
    publicUrl: fileRef,
  });
};
