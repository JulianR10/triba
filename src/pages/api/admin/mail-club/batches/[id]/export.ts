import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../../lib/auth";
import { error } from "../../../../../../lib/response";
import { logger } from "../../../../../../lib/logger";
import { exportMailClubBatchCSV } from "../../../../../../lib/admin/mail-club";
import { logAdminAction } from "../../../../../../lib/admin/audit";
import { enforceRateLimit } from "../../../../../../lib/rate-limit";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals, request }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  const limited = await enforceRateLimit(request, "admin-export", { maxRequests: 20, windowMs: 60_000 });
  if (limited) return limited;

  const id = params.id || "";
  if (!id) return error("Missing id", 400);

  try {
    const csv = await exportMailClubBatchCSV(id);
    await logAdminAction(admin.user.id, admin.profile.email, "mailclub.batch_exported", "mail_club", id);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="mail-club-${id.slice(0, 8)}.csv"`,
      },
    });
  } catch (err: any) {
    logger.error({ err, id }, "mail club batch export error");
    return error("Internal server error", 500);
  }
};
