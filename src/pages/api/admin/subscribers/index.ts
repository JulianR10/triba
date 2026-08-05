import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok } from "../../../../lib/response";
import {
  searchSubscribersForAdmin,
  type AdminSubscriberStatus,
} from "../../../../lib/admin/subscribers";

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
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, parseInt(url.searchParams.get("pageSize") || "20", 10) || 20));

  const result = await searchSubscribersForAdmin(search, status, page, pageSize);
  return ok(result);
};
