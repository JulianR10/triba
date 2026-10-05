import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok, error } from "../../../../lib/response";
import { logger } from "../../../../lib/logger";
import { logAdminAction } from "../../../../lib/admin/audit";
import { purgeMailClubRetention } from "../../../../lib/admin/mail-club";

export const prerender = false;

// Retención postal: GET = dry-run (qué se purgaría), POST = aplicar.
// Doble confirmación en UI: el botón Aplicar pide confirm + muestra el conteo.
export const GET: APIRoute = async ({ request, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  try {
    const days = Number(new URL(request.url).searchParams.get("days") || 60);
    return ok(await purgeMailClubRetention(days, false));
  } catch (err: any) {
    logger.error({ err }, "mail club retention dry-run error");
    return error("Internal server error", 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  let body: { days?: unknown };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    return error("Invalid body", 400);
  }
  const days = Number((body as any)?.days || 60);
  try {
    const report = await purgeMailClubRetention(days, true);
    logAdminAction(admin.user.id, admin.profile.email, "mailclub.retention_purged", "mail_club", undefined, {
      days: report.days,
      snapshots: report.snapshotsPurged,
      addresses: report.addressesDeleted,
    });
    return ok(report);
  } catch (err: any) {
    logger.error({ err }, "mail club retention apply error");
    return error("Internal server error", 500);
  }
};
