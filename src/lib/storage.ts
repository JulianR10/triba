import { supabaseAdmin } from "./supabase-admin";
import type { EditionFileKind } from "./storage-validation";
import {
  COVERS_BUCKET,
  parseStoredFileRef,
  bucketForKind,
  bucketForPath,
} from "./storage-refs";

export { FILE_RULES, type EditionFileKind } from "./storage-validation";
export {
  COVERS_BUCKET,
  PDF_BUCKET,
  buildPdfRef,
  bucketForKind,
  bucketForPath,
  parseStoredFileRef,
  type StoredFileRef,
} from "./storage-refs";

const STORAGE_URL_PREFIX = `/storage/v1/object/public/${COVERS_BUCKET}/`;

/** Ruta dentro del bucket de portadas (compatibilidad: callers legacy). */
export function extractStoragePath(publicUrl: string): string | null {
  return parseStoredFileRef(publicUrl)?.path ?? null;
}

export function getPublicUrl(path: string): string {
  const supabaseUrl =
    import.meta.env.PUBLIC_SUPABASE_URL ||
    import.meta.env.SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL ||
    "";
  return `${supabaseUrl}/storage/v1/object/public/${COVERS_BUCKET}/${path}`;
}

export function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

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
  const ref = parseStoredFileRef(pdfUrl);
  if (!ref) return pdfUrl;

  const { data, error } = await supabaseAdmin.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, options?.ttl ?? 60 * 30, {
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

export async function removeStoragePaths(
  paths: string[],
  bucket: string = COVERS_BUCKET
): Promise<{ removed: number }> {
  const clean = [...new Set(paths.filter((p): p is string => typeof p === "string" && !!p))];
  if (clean.length === 0) return { removed: 0 };
  // Guard: only allow known prefixes to avoid accidental deletes
  const allowed = clean.filter((p) => p.startsWith("covers/") || p.startsWith("pdfs/"));
  if (allowed.length === 0) return { removed: 0 };
  const { error } = await supabaseAdmin.storage.from(bucket).remove(allowed);
  if (error) throw new Error(`Error limpiando storage: ${error.message}`);
  return { removed: allowed.length };
}

export { STORAGE_URL_PREFIX };
