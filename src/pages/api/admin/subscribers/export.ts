import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { exportSubscribersCSV, type AdminSubscriberStatus } from "../../../../lib/admin/subscribers";

export const prerender = false;

const VALID_STATUSES: AdminSubscriberStatus[] = ["all", "active", "canceled", "none", "pending", "refunded"];

export const GET: APIRoute = async ({ request, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const rawStatus = url.searchParams.get("status") || "all";
  const status: AdminSubscriberStatus = VALID_STATUSES.includes(rawStatus as AdminSubscriberStatus)
    ? (rawStatus as AdminSubscriberStatus)
    : "all";

  const csv = await exportSubscribersCSV(search, status);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suscriptoras-triba-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
};
