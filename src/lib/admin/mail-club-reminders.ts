import { logger } from "../logger";
import { sendEmail } from "../sender";
import { mailClubReminderForDate, shipmentMonthLabel } from "../mail-club";
import { SITE_URL } from "../site-url";
import { supabaseAdmin } from "../supabase-admin";

const CLAIM_LEASE_MS = 15 * 60 * 1000;

type ReminderKey = {
  period_year: number;
  period_month: number;
  reminder_type: "create_batch" | "dispatch_batch";
  admin_user_id: string;
};

async function claimReminder(key: ReminderKey): Promise<string | null> {
  const now = new Date();
  const claimedAt = now.toISOString();
  const { error: insertError } = await supabaseAdmin
    .from("mail_club_reminders")
    .insert({ ...key, status: "pending", updated_at: claimedAt });

  if (insertError && insertError.code !== "23505") throw insertError;

  const { data: pending, error: pendingError } = await supabaseAdmin
    .from("mail_club_reminders")
    .update({ status: "sending", claimed_at: claimedAt, updated_at: claimedAt })
    .match(key)
    .eq("status", "pending")
    .select("admin_user_id")
    .maybeSingle();
  if (pendingError) throw pendingError;
  if (pending) return claimedAt;

  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS).toISOString();
  const { data: stale, error: staleError } = await supabaseAdmin
    .from("mail_club_reminders")
    .update({ status: "sending", claimed_at: claimedAt, updated_at: claimedAt })
    .match(key)
    .eq("status", "sending")
    .lt("claimed_at", staleBefore)
    .select("admin_user_id")
    .maybeSingle();
  if (staleError) throw staleError;
  return stale ? claimedAt : null;
}

async function finishReminder(key: ReminderKey, claimedAt: string): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("mail_club_reminders")
    .update({ status: "sent", claimed_at: null, sent_at: now, updated_at: now })
    .match(key)
    .eq("status", "sending")
    .eq("claimed_at", claimedAt)
    .select("admin_user_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Mail Club reminder claim was lost before completion");
}

async function releaseReminder(key: ReminderKey, claimedAt: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("mail_club_reminders")
    .update({ status: "pending", claimed_at: null, updated_at: new Date().toISOString() })
    .match(key)
    .eq("status", "sending")
    .eq("claimed_at", claimedAt);
  if (error) throw error;
}

function reminderEmail(
  type: ReminderKey["reminder_type"],
  label: string,
  batchExists: boolean,
): { subject: string; html: string } {
  const createBatch = type === "create_batch";
  const subject = createBatch
    ? `Mail Club: crear el lote de ${label}`
    : `Mail Club: despacho de ${label}`;
  const title = createBatch
    ? "Mañana cierra el corte del Mail Club"
    : "Mañana es el despacho del Mail Club";
  const message = createBatch
    ? "Mañana, día 15 (Europe/Madrid), cierra el corte. Después del cierre, revisá la elegibilidad y creá el lote mensual."
    : batchExists
      ? "Mañana, día 20, corresponde despachar el lote y registrar el despacho desde el panel para avisar a las suscriptoras."
      : "Mañana, día 20, corresponde el despacho y todavía no hay un lote creado. Creá/revisá el lote y registrá el despacho desde el panel.";
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><body style="margin:0;padding:32px;background:#FFF8EE;font:16px Arial,sans-serif;color:#35220A"><main style="max-width:560px;margin:auto;padding:28px;background:#fff;border:2px solid #35220A;border-radius:16px"><p style="color:#E91A39;font-weight:bold">TRIBA MAIL CLUB · ${label}</p><h1 style="font-size:24px">${title}</h1><p style="line-height:1.6">${message}</p><p><a href="${SITE_URL}/admin/mail-club" style="display:inline-block;padding:12px 20px;background:#E91A39;color:#fff;border:2px solid #35220A;border-radius:24px;text-decoration:none;font-weight:bold">Abrir panel Mail Club</a></p></main></body></html>`;
  return { subject, html };
}

export async function sendMailClubOperationsReminder(
  now = new Date(),
): Promise<{
  due: boolean;
  period?: string;
  type?: ReminderKey["reminder_type"];
  sent: number;
  alreadyHandled: number;
  failed: number;
  skipped?: string;
}> {
  const reminder = mailClubReminderForDate(now);
  if (!reminder) return { due: false, sent: 0, alreadyHandled: 0, failed: 0 };

  const { data: batch, error: batchError } = await supabaseAdmin
    .from("mail_club_batches")
    .select("id, status")
    .eq("period_year", reminder.year)
    .eq("period_month", reminder.month)
    .maybeSingle();
  if (batchError) throw batchError;

  if (reminder.type === "create_batch" && batch && batch.status !== "open") {
    return {
      due: true,
      period: `${reminder.year}-${String(reminder.month).padStart(2, "0")}`,
      type: reminder.type,
      sent: 0,
      alreadyHandled: 0,
      failed: 0,
      skipped: "batch_already_created",
    };
  }
  if (reminder.type === "dispatch_batch" && batch?.status === "dispatched") {
    return {
      due: true,
      period: `${reminder.year}-${String(reminder.month).padStart(2, "0")}`,
      type: reminder.type,
      sent: 0,
      alreadyHandled: 0,
      failed: 0,
      skipped: "batch_already_dispatched",
    };
  }

  const { data: admins, error: adminsError } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("role", "admin");
  if (adminsError) throw adminsError;
  const recipients = new Map<string, { id: string; email: string }>();
  for (const admin of admins ?? []) {
    const email = admin.email?.trim();
    if (email) recipients.set(email.toLowerCase(), { id: admin.id, email });
  }
  if (recipients.size === 0) throw new Error("No admin email is configured for Mail Club reminders");

  const label = shipmentMonthLabel(reminder.year, reminder.month, "es");
  const { subject, html } = reminderEmail(reminder.type, label, !!batch);
  let sent = 0;
  let alreadyHandled = 0;
  let failed = 0;

  for (const recipient of recipients.values()) {
    const key: ReminderKey = {
      period_year: reminder.year,
      period_month: reminder.month,
      reminder_type: reminder.type,
      admin_user_id: recipient.id,
    };
    try {
      const claimedAt = await claimReminder(key);
      if (!claimedAt) {
        alreadyHandled++;
        continue;
      }

      let delivered = false;
      try {
        await sendEmail(recipient.email, subject, html);
        delivered = true;
        await finishReminder(key, claimedAt);
        sent++;
      } catch (err) {
        if (!delivered) {
          try {
            await releaseReminder(key, claimedAt);
          } catch (releaseError) {
            logger.error({ err: releaseError, adminUserId: recipient.id }, "mail club reminder claim release error");
          }
        }
        throw err;
      }
    } catch (err) {
      failed++;
      logger.error(
        { err, adminUserId: recipient.id, year: reminder.year, month: reminder.month, type: reminder.type },
        "mail club operations reminder failed",
      );
    }
  }

  return {
    due: true,
    period: `${reminder.year}-${String(reminder.month).padStart(2, "0")}`,
    type: reminder.type,
    sent,
    alreadyHandled,
    failed,
  };
}
