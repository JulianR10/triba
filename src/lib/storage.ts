import { supabaseAdmin } from "./supabase-admin";

const BUCKET = "editions";

function getPublicUrl(path: string): string {
  const supabaseUrl =
    import.meta.env.PUBLIC_SUPABASE_URL ||
    import.meta.env.SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL ||
    "";
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
}

export type EditionFileKind = "cover" | "pdf" | "page";

function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export const FILE_RULES: Record<EditionFileKind, { maxBytes: number; mime: RegExp }> = {
  cover: {
    maxBytes: 5 * 1024 * 1024,
    mime: /^image\/(jpeg|png|webp|avif)$/,
  },
  pdf: {
    maxBytes: 80 * 1024 * 1024,
    mime: /^application\/pdf$/,
  },
  page: {
    maxBytes: 5 * 1024 * 1024,
    mime: /^image\/(jpeg|png|webp|avif)$/,
  },
};

export interface UploadResult {
  url: string;
  path: string;
}

export async function uploadEditionFile(
  file: File,
  kind: EditionFileKind,
  editionNumber: number
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
  const path = `${kind}s/edicion-${editionNumber}-${Date.now()}.${ext}`;

  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(`Error subiendo archivo: ${error.message}`);

  return { url: getPublicUrl(path), path };
}

export function isStorageConfigured(): boolean {
  return !!(
    import.meta.env.PUBLIC_SUPABASE_URL ||
    import.meta.env.SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL
  ) && !!import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
}
