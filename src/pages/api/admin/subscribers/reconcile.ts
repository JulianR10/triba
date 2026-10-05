import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok } from "../../../../lib/response";
import { logAdminAction } from "../../../../lib/admin/audit";
import {
  applyReconcileCandidates,
  findReconcileCandidates,
} from "../../../../lib/reconcile";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  const { candidates, skipped } = await findReconcileCandidates();
  return ok({ candidates, skipped });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  const body = await request.json().catch(() => ({}));
  const onlyIds = Array.isArray(body.subscriptionIds) ? body.subscriptionIds as string[] : null;

  const { activated, failed, skipped } = await applyReconcileCandidates(onlyIds);
  for (const email of activated) {
    logAdminAction(admin.user.id, admin.profile.email, "subscriber.reconciled", "subscriber", undefined, {
      reconciled_email: email,
      via: "admin",
    });
  }

  return ok({ activated, failed, skipped });
};
