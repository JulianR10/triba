import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../../lib/auth";
import { ok, error } from "../../../../../../lib/response";
import { logger } from "../../../../../../lib/logger";
import { listMailClubBatchItems } from "../../../../../../lib/admin/mail-club";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  const id = params.id || "";
  if (!id) return error("Missing id", 400);

  try {
    return ok({ items: await listMailClubBatchItems(id) });
  } catch (err: any) {
    logger.error({ err, id }, "mail club batch items error");
    return error("Internal server error", 500);
  }
};
