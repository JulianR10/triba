import type { APIRoute } from "astro";
import { exportSubscribersCSV } from "../../../../lib/admin";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.profile?.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const status = (url.searchParams.get("status") || "all") as "all" | "active" | "canceled" | "none";
  const validStatuses = ["all", "active", "canceled", "none"] as const;
  const statusFilter = validStatuses.includes(status as any) ? status : "all";

  const csv = await exportSubscribersCSV(search, statusFilter);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suscriptoras-triba-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
};
