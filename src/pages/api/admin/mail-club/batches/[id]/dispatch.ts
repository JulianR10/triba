import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../../lib/auth";
import { ok, error } from "../../../../../../lib/response";
import { logger } from "../../../../../../lib/logger";
import { dispatchMailClubBatch } from "../../../../../../lib/admin/mail-club";
import { enforceRateLimit } from "../../../../../../lib/rate-limit";

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  const limited = await enforceRateLimit(request, "admin-dispatch", {
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const id = params.id || "";
  if (!id) return error("Missing id", 400);

  let body: { emails?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const emails = Array.isArray(body.emails)
    ? (body.emails as unknown[]).filter((e): e is string => typeof e === "string")
    : undefined;

  try {
    const result = await dispatchMailClubBatch(id, emails);
    return ok(result);
  } catch (err: any) {
    logger.error({ err, id }, "mail club batch dispatch error");
    return error(err.message || "Internal server error", 500);
  }
};
