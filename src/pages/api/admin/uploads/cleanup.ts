import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok, error } from "../../../../lib/response";
import { removeStoragePaths, parseStoredFileRef, bucketForPath } from "../../../../lib/storage";

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

  // Acepta paths crudos ("covers/...", "pdfs/...") o referencias guardadas
  // (URL pública legacy o storage://bucket/path). El bucket se infiere del
  // prefijo: pdfs/* vive en el bucket privado.
  const refs: { bucket: string; path: string }[] = [];
  const pushRef = (bucket: string, path: string) => {
    if (path.startsWith("covers/") || path.startsWith("pdfs/")) {
      refs.push({ bucket: bucket || bucketForPath(path), path });
    }
  };
  if (Array.isArray(body.paths)) {
    for (const p of body.paths) {
      if (typeof p !== "string") continue;
      const parsed = parseStoredFileRef(p);
      if (parsed) pushRef(parsed.bucket, parsed.path);
      else pushRef("", p);
    }
  } else if (Array.isArray(body.urls)) {
    for (const u of body.urls) {
      if (typeof u !== "string") continue;
      const parsed = parseStoredFileRef(u);
      if (parsed) pushRef(parsed.bucket, parsed.path);
    }
  } else if (typeof body.path === "string") {
    pushRef("", body.path);
  } else if (typeof body.url === "string") {
    const parsed = parseStoredFileRef(body.url);
    if (parsed) pushRef(parsed.bucket, parsed.path);
  }

  if (refs.length === 0) return ok({ removed: 0 });

  const byBucket = new Map<string, string[]>();
  for (const r of refs) {
    const arr = byBucket.get(r.bucket) ?? [];
    arr.push(r.path);
    byBucket.set(r.bucket, arr);
  }

  try {
    let removed = 0;
    for (const [bucket, paths] of byBucket) {
      removed += (await removeStoragePaths(paths, bucket)).removed;
    }
    return ok({ removed });
  } catch (e: any) {
    return error(e?.message || "Error limpiando storage", 500);
  }
};
