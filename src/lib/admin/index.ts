export {
  logAdminAction,
  getAdminAuditLog,
  getAdminAuditLogCount,
} from "./audit";
export type { AdminLogRow } from "./audit";

export {
  listEditionsForAdmin,
  getEditionForAdmin,
  validateEditionInput,
} from "./editions";
export type { AdminEditionRow, EditionInput } from "./editions";

export {
  listSubscribersForAdmin,
  searchSubscribersForAdmin,
  exportSubscribersCSV,
} from "./subscribers";
export type { AdminSubscriberRow, SearchSubscribersResult } from "./subscribers";

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
  canceled_subscribers: number;
  editions_total: number;
  editions_featured: number;
  feedback_count: number;
  creators_pending: number;
  newsletter_count: number;
  audit_log_count: number;
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const [
    { count: activeSubs },
    { count: canceledSubs },
    { count: editionsTotal },
    { count: editionsFeatured },
    { count: feedbackCount },
    { count: creatorsPending },
    { count: newsletterCount },
    { count: auditLogCount },
  ] = await Promise.all([
    supabaseAdmin
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabaseAdmin
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "canceled"),
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
      .from("admin_audit_log")
      .select("*", { count: "exact", head: true }),
  ]);

  return {
    active_subscribers: activeSubs || 0,
    canceled_subscribers: canceledSubs || 0,
    editions_total: editionsTotal || 0,
    editions_featured: editionsFeatured || 0,
    feedback_count: feedbackCount || 0,
    creators_pending: creatorsPending || 0,
    newsletter_count: newsletterCount || 0,
    audit_log_count: auditLogCount || 0,
  };
}
