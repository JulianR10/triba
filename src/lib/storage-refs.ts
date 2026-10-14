import type { EditionFileKind } from "./storage-validation";

/** Portadas: bucket público (se sirven por URL directa). */
export const COVERS_BUCKET = "editions";
/** PDFs: bucket privado (solo firmadas vía /api/pdf). */
export const PDF_BUCKET = "editions-pdfs";

const STORAGE_URL_PREFIX = `/storage/v1/object/public/${COVERS_BUCKET}/`;
const FILE_REF_SCHEME = "storage://";

export interface StoredFileRef {
  bucket: string;
  path: string;
}

/**
 * Resuelve cualquier referencia guardada a { bucket, path }:
 * - `storage://bucket/path` (PDFs nuevos en bucket privado).
 * - URL pública legacy `/storage/v1/object/public/editions/<path>`.
 * Devuelve null para URLs externas (ej. `/articulo-gratis.pdf` estático).
 */
export function parseStoredFileRef(ref: string | null | undefined): StoredFileRef | null {
  if (!ref || typeof ref !== "string") return null;
  if (ref.startsWith(FILE_REF_SCHEME)) {
    const rest = ref.slice(FILE_REF_SCHEME.length);
    const slash = rest.indexOf("/");
    if (slash < 0) return null;
    const bucket = rest.slice(0, slash);
    const path = rest.slice(slash + 1);
    if (!bucket || !path) return null;
    return { bucket, path };
  }
  const idx = ref.indexOf(STORAGE_URL_PREFIX);
  if (idx >= 0) return { bucket: COVERS_BUCKET, path: ref.slice(idx + STORAGE_URL_PREFIX.length) };
  return null;
}

/** Referencia interna para PDFs en bucket privado (se guarda en pdf_url). */
export function buildPdfRef(path: string): string {
  return `${FILE_REF_SCHEME}${PDF_BUCKET}/${path}`;
}

export function bucketForKind(kind: EditionFileKind): string {
  return kind === "pdf" ? PDF_BUCKET : COVERS_BUCKET;
}

/** Los paths están fijados por buildStoragePath: pdfs/* vive en el privado. */
export function bucketForPath(path: string): string {
  return path.startsWith("pdfs/") ? PDF_BUCKET : COVERS_BUCKET;
}
