import { supabaseAdmin } from "../supabase-admin";
import type { Profile, Subscription } from "../types";

export interface AdminSubscriberRow {
  profile: Profile;
  subscription: Subscription | null;
}

export interface SearchSubscribersResult {
  rows: AdminSubscriberRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listSubscribersForAdmin(): Promise<AdminSubscriberRow[]> {
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !profiles) return [];

  const subscriberProfiles = (profiles as Profile[]).filter(
    (p) => p.role === "subscriber" || p.subscription_id !== null,
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

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function exportSubscribersCSV(
  search: string,
  status: "all" | "active" | "canceled" | "none",
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
    const periodEnd = s?.current_period_end
      ? new Date(s.current_period_end).toISOString()
      : "";
    const createdAt = r.profile.created_at
      ? new Date(r.profile.created_at).toISOString()
      : "";
    return `${email},${role},${provider},${planId},${currency},${statusVal},${periodEnd},${createdAt}`;
  });

  return [header, ...lines].join("\n");
}

export async function searchSubscribersForAdmin(
  search: string,
  status: "all" | "active" | "canceled" | "none",
  page: number,
  pageSize: number,
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
