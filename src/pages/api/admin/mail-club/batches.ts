import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok, error } from "../../../../lib/response";
import { logger } from "../../../../lib/logger";
import { listMailClubBatches, createMailClubBatch } from "../../../../lib/admin/mail-club";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  try {
    return ok({ batches: await listMailClubBatches() });
  } catch (err: any) {
    logger.error({ err }, "mail club batches list error");
    return error("Internal server error", 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  let body: { year?: unknown; month?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("Invalid body", 400);
  }
  const year = Number(body.year);
  const month = Number(body.month);

  try {
    const result = await createMailClubBatch(year, month);
    return ok(result);
  } catch (err: any) {
    logger.error({ err, year, month }, "mail club batch create error");
    return error(err.message || "Internal server error", 500);
  }
};
