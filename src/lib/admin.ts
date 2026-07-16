import { supabaseAdmin } from "./supabase-admin";
import type { Edition, EditionPage } from "./editions";
import type { Profile, Subscription } from "./types";

export async function logAdminAction(
  adminId: string,
  adminEmail: string,
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  await supabaseAdmin.from("admin_audit_log").insert({
    admin_id: adminId,
    admin_email: adminEmail,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    details: details || null,
  });
}

export interface AdminLogRow {
  id: string;
  admin_id: string;
  admin_email: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export async function getAdminAuditLog(
  limit = 100,
  offset = 0
): Promise<AdminLogRow[]> {
  const { data } = await supabaseAdmin
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return (data as AdminLogRow[]) || [];
}

export async function getAdminAuditLogCount(): Promise<number> {
  const { count } = await supabaseAdmin
    .from("admin_audit_log")
    .select("*", { count: "exact", head: true });
  return count || 0;
}

export interface AdminEditionRow extends Edition {
  pages_count: number;
  pdf_size_hint?: string | null;
}

export async function listEditionsForAdmin(): Promise<AdminEditionRow[]> {
  const { data: editions, error } = await supabaseAdmin
    .from("editions")
    .select("*")
    .order("edition_number", { ascending: false });
  if (error || !editions) return [];

  const { data: pages } = await supabaseAdmin
    .from("edition_pages")
    .select("edition_id");

  const counts = new Map<number, number>();
  for (const p of pages || []) {
    counts.set(p.edition_id, (counts.get(p.edition_id) || 0) + 1);
  }

  return (editions as Edition[]).map((e) => ({
    ...e,
    pages_count: counts.get(e.id) || 0,
  }));
}

export async function getEditionForAdmin(id: number): Promise<{
  edition: Edition;
  pages: EditionPage[];
} | null> {
  const { data: edition, error } = await supabaseAdmin
    .from("editions")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !edition) return null;

  const { data: pages } = await supabaseAdmin
    .from("edition_pages")
    .select("*")
    .eq("edition_id", id)
    .order("page_number", { ascending: true });

  return {
    edition: edition as Edition,
    pages: (pages as EditionPage[]) || [],
  };
}

export interface AdminSubscriberRow {
  profile: Profile;
  subscription: Subscription | null;
}

export async function listSubscribersForAdmin(): Promise<AdminSubscriberRow[]> {
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !profiles) return [];

  const subscriberProfiles = (profiles as Profile[]).filter(
    (p) => p.role === "subscriber" || p.subscription_id !== null
  );

  if (subscriberProfiles.length === 0) return [];

  const subIds = subscriberProfiles
    .map((p) => p.subscription_id)
    .filter((id): id is string => !!id);

  const { data: subs } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .in("id", subIds);

  const subMap = new Map<string, Subscription>();
  for (const s of (subs as Subscription[]) || []) {
    subMap.set(s.id, s);
  }

  return subscriberProfiles.map((p) => ({
    profile: p,
    subscription: p.subscription_id ? subMap.get(p.subscription_id) || null : null,
  }));
}

export interface SearchSubscribersResult {
  rows: AdminSubscriberRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function exportSubscribersCSV(
  search: string,
  status: "all" | "active" | "canceled" | "none"
): Promise<string> {
  const result = await searchSubscribersForAdmin(search, status, 1, 999999);
  const rows = result.rows;

  const header = "Email,Rol,Provider,Plan,Moneda,Estado,Vence,Creada";
  const lines = rows.map((r) => {
    const s = r.subscription;
    const email = escapeCSV(r.profile.email);
    const role = r.profile.role;
    const provider = s?.provider || "";
    const planId = s?.plan_id || "";
    const currency = s?.plan_currency || "";
    const statusVal = s?.status || "none";
    const periodEnd = s?.current_period_end ? new Date(s.current_period_end).toISOString() : "";
    const createdAt = r.profile.created_at ? new Date(r.profile.created_at).toISOString() : "";
    return `${email},${role},${provider},${planId},${currency},${statusVal},${periodEnd},${createdAt}`;
  });

  return [header, ...lines].join("\n");
}

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function searchSubscribersForAdmin(
  search: string,
  status: "all" | "active" | "canceled" | "none",
  page: number,
  pageSize: number
): Promise<SearchSubscribersResult> {
  let query = supabaseAdmin
    .from("profiles")
    .select("*", { count: "exact", head: false });

  if (search) {
    query = query.ilike("email", `%${search}%`);
  }

  const { data: allProfiles, error, count } = await query
    .order("created_at", { ascending: false });
  if (error || !allProfiles) {
    return { rows: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const subIds = (allProfiles as Profile[])
    .map((p) => p.subscription_id)
    .filter((id): id is string => !!id);

  let subMap = new Map<string, Subscription>();
  if (subIds.length > 0) {
    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .in("id", subIds);
    for (const s of (subs as Subscription[]) || []) {
      subMap.set(s.id, s);
    }
  }

  let allRows = (allProfiles as Profile[]).map((p) => ({
    profile: p,
    subscription: p.subscription_id ? subMap.get(p.subscription_id) || null : null,
  }));

  if (status === "active") {
    allRows = allRows.filter((r) => r.subscription?.status === "active");
  } else if (status === "canceled") {
    allRows = allRows.filter((r) => r.subscription?.status === "canceled");
  } else if (status === "none") {
    allRows = allRows.filter((r) => !r.subscription);
  }

  const total = allRows.length;
  const totalPages = Math.ceil(total / pageSize);
  const rows = allRows.slice((page - 1) * pageSize, page * pageSize);

  return { rows, total, page, pageSize, totalPages };
}

export interface AdminFeedbackRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  mensaje: string;
  created_at: string;
}

export async function listFeedbackForAdmin(): Promise<AdminFeedbackRow[]> {
  const { data: feedback, error } = await supabaseAdmin
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !feedback) return [];

  const userIds = Array.from(
    new Set(feedback.map((f: any) => f.user_id).filter((id: any) => !!id))
  ) as string[];

  let emailByUserId = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .in("id", userIds);
    for (const p of (profiles as any[]) || []) {
      emailByUserId.set(p.id, p.email);
    }
  }

  return (feedback as any[]).map((f) => ({
    id: f.id,
    user_id: f.user_id,
    user_email: f.user_id ? emailByUserId.get(f.user_id) || null : null,
    mensaje: f.mensaje,
    created_at: f.created_at,
  }));
}

export interface AdminCreatorRow {
  id: string;
  nombre: string;
  email: string;
  pais: string;
  areas: string[];
  propuesta: string;
  trabajo_url: string | null;
  status: "pending" | "approved" | "rejected";
  admin_notes: string | null;
  created_at: string;
}

export async function listCreatorApplicationsForAdmin(
  statusFilter: "all" | "pending" | "approved" | "rejected" = "all"
): Promise<AdminCreatorRow[]> {
  let query = supabaseAdmin
    .from("creator_applications")
    .select("*")
    .order("created_at", { ascending: false });
  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data as AdminCreatorRow[];
}

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

export interface EditionInput {
  edition_number: number;
  title: string;
  description: string;
  cover_url: string;
  pdf_url: string | null;
  featured: boolean;
  badge: string | null;
}

export function validateEditionInput(
  input: Partial<EditionInput>
): { ok: true; data: EditionInput } | { ok: false; error: string } {
  if (
    typeof input.edition_number !== "number" ||
    !Number.isInteger(input.edition_number) ||
    input.edition_number < 1
  ) {
    return { ok: false, error: "edition_number debe ser un entero positivo" };
  }
  if (typeof input.title !== "string" || !input.title.trim()) {
    return { ok: false, error: "title es obligatorio" };
  }
  if (typeof input.description !== "string" || !input.description.trim()) {
    return { ok: false, error: "description es obligatoria" };
  }
  if (typeof input.cover_url !== "string" || !input.cover_url.trim()) {
    return { ok: false, error: "cover_url es obligatorio" };
  }
  if (input.pdf_url !== null && input.pdf_url !== undefined && typeof input.pdf_url !== "string") {
    return { ok: false, error: "pdf_url debe ser string o null" };
  }

  return {
    ok: true,
    data: {
      edition_number: input.edition_number,
      title: input.title.trim(),
      description: input.description.trim(),
      cover_url: input.cover_url.trim(),
      pdf_url: input.pdf_url?.trim() || null,
      featured: !!input.featured,
      badge: input.badge?.trim() || null,
    },
  };
}
