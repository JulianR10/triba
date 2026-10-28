import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { logAdminAction } from "../../../../lib/admin/audit";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { exportSubscribersCSV, type AdminSubscriberStatus } from "../../../../lib/admin/subscribers";

export const prerender = false;

// Mismos filtros que la lista: antes "Digital" y "Mail Club" exportaban TODAS las suscriptoras.
const VALID_STATUSES: AdminSubscriberStatus[] = ["all", "active", "canceled", "none", "pending", "refunded", "digital", "mail_club"];

export const GET: APIRoute = async ({ request, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  const limited = await enforceRateLimit(request, "admin-export", { maxRequests: 20, windowMs: 60_000 });
  if (limited) return limited;

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const rawStatus = url.searchParams.get("status") || "all";
  const status: AdminSubscriberStatus = VALID_STATUSES.includes(rawStatus as AdminSubscriberStatus)
    ? (rawStatus as AdminSubscriberStatus)
    : "all";

  const csv = await exportSubscribersCSV(search, status);
  await logAdminAction(admin.user.id, admin.profile.email, "subscriber.exported", "subscriber", undefined, { status, search: search || null });

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suscriptoras-triba-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
};
