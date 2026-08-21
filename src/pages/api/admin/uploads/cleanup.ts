import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok, error } from "../../../../lib/response";
import { removeStoragePaths, extractStoragePath } from "../../../../lib/storage";

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

  let paths: string[] = [];
  if (Array.isArray(body.paths)) paths = body.paths;
  else if (Array.isArray(body.urls)) paths = body.urls.map((u: string) => extractStoragePath(u) || "").filter(Boolean);
  else if (typeof body.path === "string") paths = [body.path];
  else if (typeof body.url === "string") {
    const p = extractStoragePath(body.url);
    if (p) paths = [p];
  }

  if (paths.length === 0) return ok({ removed: 0 });

  // Guard same as helper — only covers/pdfs
  const allowed = paths.filter((p) => p.startsWith("covers/") || p.startsWith("pdfs/"));
  if (allowed.length === 0) return ok({ removed: 0 });

  try {
    const { removed } = await removeStoragePaths(allowed);
    return ok({ removed });
  } catch (e: any) {
    return error(e?.message || "Error limpiando storage", 500);
  }
};
