import type { APIRoute } from "astro";
import { ok, error } from "../../../lib/response";
import { logger } from "../../../lib/logger";
import { logAdminAction } from "../../../lib/admin/audit";
import { applyReconcileCandidates } from "../../../lib/reconcile";
import { sendMailClubOperationsReminder } from "../../../lib/admin/mail-club-reminders";

export const prerender = false;

// Cron diario: reconcilia pagos aprobados que el webhook no procesó y envía
// recordatorios internos Mail Club el 14 y el 19 (Europe/Madrid).
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

  let reconciliation: Awaited<ReturnType<typeof applyReconcileCandidates>> | null = null;
  let reconcileFailed = false;
  try {
    reconciliation = await applyReconcileCandidates(null);
  } catch (err) {
    reconcileFailed = true;
    logger.error({ err }, "[cron/reconcile] reconciliation error");
  }

  let mailClubReminder: Awaited<ReturnType<typeof sendMailClubOperationsReminder>> | null = null;
  let reminderFailed = false;
  try {
    mailClubReminder = await sendMailClubOperationsReminder();
  } catch (err) {
    reminderFailed = true;
    logger.error({ err }, "[cron/reconcile] Mail Club reminder error");
  }

  const activated = reconciliation?.activated ?? [];
  if (activated.length > 0) {
    logAdminAction("cron", "cron", "subscriber.reconciled", "subscriber", undefined, {
      via: "cron",
      count: activated.length,
      emails: activated,
    });
  }
  if (mailClubReminder?.failed) {
    reminderFailed = true;
    logger.error({ reminder: mailClubReminder }, "[cron/reconcile] Mail Club reminder delivery incomplete");
  }

  if (reconcileFailed || reminderFailed) {
    return error("Daily cron partially failed", 502);
  }
  return ok({
    activated,
    failedCount: reconciliation?.failed.length ?? 0,
    skippedCount: reconciliation?.skipped.length ?? 0,
    mailClubReminder,
  });
};
