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

export interface StoragePathOptions {
  slug?: string;
  language?: "es" | "en";
}

export function buildStoragePath(
  kind: EditionFileKind,
  editionNumber: number | undefined,
  ext: string,
  opts?: StoragePathOptions
): string {
  const lang = opts?.language ?? "es";
  if (kind === "pdf") {
    return `pdfs/${opts?.slug ?? `revista-${editionNumber}`}-${lang}.${ext}`;
  }
  return `covers/edicion-${editionNumber}-${lang}-${Date.now()}.${ext}`;
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

export async function removeStoragePaths(paths: string[]): Promise<{ removed: number }> {
  const clean = [...new Set(paths.filter((p): p is string => typeof p === "string" && !!p))];
  if (clean.length === 0) return { removed: 0 };
  // Guard: only allow known prefixes to avoid accidental deletes
  const allowed = clean.filter((p) => p.startsWith("covers/") || p.startsWith("pdfs/"));
  if (allowed.length === 0) return { removed: 0 };
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove(allowed);
  if (error) throw new Error(`Error limpiando storage: ${error.message}`);
  return { removed: allowed.length };
}
