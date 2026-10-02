import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../../lib/auth";
import { error } from "../../../../../../lib/response";
import { logger } from "../../../../../../lib/logger";
import { exportMailClubBatchCSV } from "../../../../../../lib/admin/mail-club";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  const id = params.id || "";
  if (!id) return error("Missing id", 400);

  try {
    const csv = await exportMailClubBatchCSV(id);
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
