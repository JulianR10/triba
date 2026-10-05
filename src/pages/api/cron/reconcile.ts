import type { APIRoute } from "astro";
import { ok, error } from "../../../lib/response";
import { logger } from "../../../lib/logger";
import { logAdminAction } from "../../../lib/admin/audit";
import { applyReconcileCandidates } from "../../../lib/reconcile";

export const prerender = false;

// Reconciliación automática (Vercel Cron, diario): activa pagos aprobados que
// el webhook no procesó (evento no recibido, caída en el instante, etc.).
// Auth: header `Authorization: Bearer <CRON_SECRET>` (Vercel lo envía solo).
// Idempotente: sin candidatos no escribe nada.
export const GET: APIRoute = async ({ request }) => {
  const secret = process.env.CRON_SECRET || import.meta.env.CRON_SECRET || "";
  if (!secret) {
    logger.error("[cron/reconcile] CRON_SECRET not configured");
    return error("Cron misconfigured", 500);
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return error("Unauthorized", 401);
  }

  try {
    const { activated, failed, skipped } = await applyReconcileCandidates(null);
    if (activated.length > 0) {
      logAdminAction("cron", "cron", "subscriber.reconciled", "subscriber", undefined, {
        via: "cron",
        count: activated.length,
        emails: activated,
      });
    }
    return ok({ activated, failedCount: failed.length, skippedCount: skipped.length });
  } catch (err: any) {
    logger.error({ err }, "[cron/reconcile] error");
    return error("Internal server error", 500);
  }
};
