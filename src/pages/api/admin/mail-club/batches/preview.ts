import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../lib/auth";
import { ok, error } from "../../../../../lib/response";
import { logger } from "../../../../../lib/logger";
import {
  cutoffAtMadrid,
  listMailClubEligible,
} from "../../../../../lib/admin/mail-club";
import { logAdminAction } from "../../../../../lib/admin/audit";
import { enforceRateLimit } from "../../../../../lib/rate-limit";

export const prerender = false;

// Simulación del lote SIN escribir: misma elegibilidad que la creación.
// Responde quiénes entrarían y quiénes quedarían fuera con motivo.
export const POST: APIRoute = async ({ request, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  const limited = await enforceRateLimit(request, "admin-preview", { maxRequests: 20, windowMs: 60_000 });
  if (limited) return limited;

  let body: { year?: unknown; month?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("Invalid body", 400);
  }
  const year = Number(body.year);
  const month = Number(body.month);
  if (!Number.isInteger(year) || year < 2026 || year > 2100) return error("Año inválido", 400);
  if (!Number.isInteger(month) || month < 1 || month > 12) return error("Mes inválido", 400);

  try {
    const cutoff = cutoffAtMadrid(year, month);
    const { eligible, skipped } = await listMailClubEligible(cutoff);
    await logAdminAction(admin.user.id, admin.profile.email, "mailclub.batch_previewed", "mail_club", undefined, { year, month });
    return ok({
      cutoff,
      included: eligible.length,
      eligible: eligible.map((e) => ({
        email: e.email,
        zone: e.zone,
        plan_currency: e.plan_currency,
        founder_number: e.founder_number,
      })),
      skipped,
    });
  } catch (err: any) {
    logger.error({ err, year, month }, "mail club batch preview error");
    return error("Internal server error", 500);
  }
};
