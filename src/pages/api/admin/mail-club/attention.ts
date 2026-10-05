import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok, error } from "../../../../lib/response";
import { logger } from "../../../../lib/logger";
import { listMailClubPendingNotices, listMailClubWithoutAddress } from "../../../../lib/admin/mail-club";

export const prerender = false;

// Focos de atención Mail Club: activas sin dirección (quedarían fuera del
// lote en silencio) + avisos de despacho pendientes de reintentar.
// Liviano: counts y listas acotadas, sin N+1 pesado.
export const GET: APIRoute = async ({ locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  try {
    const [withoutAddress, pendingNotices] = await Promise.all([
      listMailClubWithoutAddress(),
      listMailClubPendingNotices(),
    ]);
    return ok({ withoutAddress, pendingNotices });
  } catch (err: any) {
    logger.error({ err }, "mail club attention error");
    return error("Internal server error", 500);
  }
};
