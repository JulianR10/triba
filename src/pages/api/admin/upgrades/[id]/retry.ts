import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../lib/auth";
import { ok, error } from "../../../../../lib/response";
import { logger } from "../../../../../lib/logger";
import { applyUpgrade } from "../../../../../lib/upgrade-apply";
import { enforceRateLimit } from "../../../../../lib/rate-limit";

export const prerender = false;

// Reintenta un upgrade con pago confirmado cuyo cambio de tarifa falló.
// Nunca vuelve a cobrar: el pago único ya está hecho.
export const POST: APIRoute = async ({ params, locals, request }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  const limited = await enforceRateLimit(request, "admin-upgrades", {
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const id = params.id || "";
  if (!id) return error("Missing id", 400);

  try {
    const result = await applyUpgrade(id);
    return ok(result);
  } catch (err: any) {
    logger.error({ err, id }, "admin upgrade retry error");
    return error(err.message || "Internal server error", 500);
  }
};
