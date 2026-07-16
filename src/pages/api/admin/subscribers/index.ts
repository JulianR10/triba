import type { APIRoute } from "astro";
import { searchSubscribersForAdmin } from "../../../../lib/admin";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.profile?.role !== "admin") {
    return json({ error: "Forbidden" }, 403);
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const status = (url.searchParams.get("status") || "all") as "all" | "active" | "canceled" | "none";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, parseInt(url.searchParams.get("pageSize") || "20", 10) || 20));

  const validStatuses = ["all", "active", "canceled", "none"] as const;
  const statusFilter = validStatuses.includes(status as any) ? status : "all";

  const result = await searchSubscribersForAdmin(search, statusFilter, page, pageSize);
  return json(result);
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
