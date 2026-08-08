import { supabaseAdmin } from "./supabase-admin";

const BUCKET = "editions";
const STORAGE_URL_PREFIX = `/storage/v1/object/public/${BUCKET}/`;

export function extractStoragePath(publicUrl: string): string | null {
  const idx = publicUrl.indexOf(STORAGE_URL_PREFIX);
  if (idx < 0) return null;
  return publicUrl.slice(idx + STORAGE_URL_PREFIX.length);
}

export function getPublicUrl(path: string): string {
  const supabaseUrl =
    import.meta.env.PUBLIC_SUPABASE_URL ||
    import.meta.env.SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL ||
    "";
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
}

export type EditionFileKind = "cover" | "pdf";

export function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export const FILE_RULES: Record<EditionFileKind, { maxBytes: number; mime: RegExp }> = {
  cover: {
    maxBytes: 5 * 1024 * 1024,
    mime: /^image\/(jpeg|png|webp|avif)$/,
  },
  pdf: {
    maxBytes: 50 * 1024 * 1024,
    mime: /^application\/pdf$/,
  },
};

export interface UploadResult {
  url: string;
  path: string;
}

export function buildStoragePath(
  kind: EditionFileKind,
  editionNumber: number | undefined,
  ext: string,
  opts?: { slug?: string }
): string {
  if (kind === "pdf") {
    return `pdfs/${opts?.slug ?? `revista-${editionNumber}`}.${ext}`;
  }
  return `covers/edicion-${editionNumber}-${Date.now()}.${ext}`;
}

export async function uploadEditionFile(
  file: File,
  kind: EditionFileKind,
  editionNumber: number,
  opts?: { slug?: string }
): Promise<UploadResult> {
  const rule = FILE_RULES[kind];
  if (file.size > rule.maxBytes) {
    const mb = (rule.maxBytes / 1024 / 1024).toFixed(0);
    throw new Error(`Archivo demasiado grande. Máximo ${mb} MB.`);
  }
  if (!rule.mime.test(file.type)) {
    throw new Error(`Tipo de archivo no permitido: ${file.type || "desconocido"}`);
  }

  const ext = fileExt(file.name) || (kind === "pdf" ? "pdf" : "jpg");
  const path = buildStoragePath(kind, editionNumber, ext, opts);

  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(`Error subiendo archivo: ${error.message}`);

  return { url: getPublicUrl(path), path };
}

export async function getSignedPdfUrl(
  pdfUrl: string,
  options?: { download?: boolean; ttl?: number }
): Promise<string | null> {
  const path = extractStoragePath(pdfUrl);
  if (!path) return pdfUrl;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, options?.ttl ?? 60 * 30, {
      download: options?.download ?? false,
    });

  if (error || !data) return null;
  return data.signedUrl;
}

export function isStorageConfigured(): boolean {
  return !!(
    import.meta.env.PUBLIC_SUPABASE_URL ||
    import.meta.env.SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL
  ) && !!import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
}
