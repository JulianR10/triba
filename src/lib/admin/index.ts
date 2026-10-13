export {
  logAdminAction,
} from "./audit";

export {
  listEditionsForAdmin,
  getEditionForAdmin,
  validateEditionInput,
} from "./editions";
export type { EditionInput } from "./editions";

export {
  searchSubscribersForAdmin,
  exportSubscribersCSV,
} from "./subscribers";
export type { AdminSubscriberRow, SearchSubscribersResult, AdminSubscriberStatus } from "./subscribers";

export {
  listCreatorApplicationsForAdmin,
} from "./creators";
export type { AdminCreatorRow } from "./creators";

export {
  listFeedbackForAdmin,
} from "./feedback";
export type { AdminFeedbackRow } from "./feedback";

import { supabaseAdmin } from "../supabase-admin";

export interface AdminDashboardStats {
  active_subscribers: number;
  active_digital: number;
  active_mail_club: number;
  pending_payment: number;
  canceled_subscribers: number;
  migrated_subscribers: number;
  editions_total: number;
  editions_featured: number;
  feedback_count: number;
  creators_pending: number;
  newsletter_count: number;
  newsletter_pending_sync: number;
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  // Vista agregada 029: 12 counts en una sola fila (antes: 12 roundtrips).
  // Sin tipar en database.types a propósito: la vista puede no existir aún
  // en Supabase y el fallback legacy cubre ese caso.
  try {
    const { data, error } = await (supabaseAdmin as any)
      .from("admin_dashboard_stats")
      .select("*")
      .maybeSingle();
    if (!error && data) {
      const row = data as any;
      const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
      return {
        active_subscribers: num(row.active_subscribers),
        active_digital: num(row.active_digital),
        active_mail_club: num(row.active_mail_club),
        pending_payment: num(row.pending_payment),
        canceled_subscribers: num(row.canceled_subscribers),
        migrated_subscribers: num(row.migrated_subscribers),
        editions_total: num(row.editions_total),
        editions_featured: num(row.editions_featured),
        feedback_count: num(row.feedback_count),
        creators_pending: num(row.creators_pending),
        newsletter_count: num(row.newsletter_count),
        newsletter_pending_sync: num(row.newsletter_pending_sync),
      };
    }
  } catch {
    // Vista aún no aplicada en Supabase: usar el cálculo anterior.
  }
  return getAdminDashboardStatsLegacy();
}

async function getAdminDashboardStatsLegacy(): Promise<AdminDashboardStats> {
  const [
    { count: activeSubs },
    { count: activeDigital },
    { count: activeMailClub },
    { count: pendingPayment },
    { count: canceledSubs },
    { count: migratedSubs },
    { count: editionsTotal },
    { count: editionsFeatured },
    { count: feedbackCount },
    { count: creatorsPending },
    { count: newsletterCount },
    { count: newsletterPendingSync },
  ] = await Promise.all([
    supabaseAdmin
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabaseAdmin
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .eq("plan_type", "digital"),
    supabaseAdmin
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .eq("plan_type", "mail_club"),
    supabaseAdmin
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "incomplete"),
    supabaseAdmin
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "canceled"),
    supabaseAdmin
      .from("subscriber_migrations")
      .select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("editions")
      .select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("editions")
      .select("*", { count: "exact", head: true })
      .eq("featured", true),
    supabaseAdmin
      .from("feedback")
      .select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("creator_applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabaseAdmin
      .from("newsletters")
      .select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("newsletters")
      .select("*", { count: "exact", head: true })
      .eq("sender_synced", false),
  ]);

  return {
    active_subscribers: activeSubs || 0,
    active_digital: activeDigital || 0,
    active_mail_club: activeMailClub || 0,
    pending_payment: pendingPayment || 0,
    canceled_subscribers: canceledSubs || 0,
    migrated_subscribers: migratedSubs || 0,
    editions_total: editionsTotal || 0,
    editions_featured: editionsFeatured || 0,
    feedback_count: feedbackCount || 0,
    creators_pending: creatorsPending || 0,
    newsletter_count: newsletterCount || 0,
    newsletter_pending_sync: newsletterPendingSync || 0,
  };
}
