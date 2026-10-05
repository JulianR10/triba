import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok, error } from "../../../../lib/response";
import { logger } from "../../../../lib/logger";
import { listMailClubWithoutAddress } from "../../../../lib/admin/mail-club";

export const prerender = false;

// Focos de atención Mail Club: activas sin dirección (quedarían fuera del
// lote en silencio). Liviano: 3 queries, sin N+1.
export const GET: APIRoute = async ({ locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  try {
    return ok({ withoutAddress: await listMailClubWithoutAddress() });
  } catch (err: any) {
    logger.error({ err }, "mail club attention error");
    return error("Internal server error", 500);
  }
};
