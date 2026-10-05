import { supabaseAdmin } from "../supabase-admin";
import { stripe } from "../stripe";
import { isActiveSubscription } from "../subscription-status";
import type { Profile, Subscription } from "../types";

export interface AdminSubscriberRow {
  profile: Profile | null;
  subscription: Subscription | null;
  migrationId?: string;
  migrationEmail?: string;
  migrationStripeSubId?: string | null;
  migrationStripeStatus?: string;
  migrationMpPreapprovalId?: string | null;
  migrationMpCurrency?: string | null;
  migrationRefunded?: boolean;
}

export type AdminSubscriberStatus = "all" | "active" | "canceled" | "none" | "pending" | "refunded" | "digital" | "mail_club";

export interface SearchSubscribersResult {
  rows: AdminSubscriberRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totalMigrated: number;
  totalPending: number;
  totalRefunded: number;
  totalActive: number;
  totalCanceled: number;
  totalNone: number;
}

export interface MigratedSubscriberRow {
  email: string;
  migratedAt: string;
  hasAccount: boolean;
  hasStripe: boolean;
}

export interface SearchMigratedResult {
  rows: MigratedSubscriberRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function exportSubscribersCSV(
  search: string,
  status: AdminSubscriberStatus,
): Promise<string> {
  const result = await searchSubscribersForAdmin(search, status, 1, 999999);
  const rows = result.rows;

  const header = "Email,Rol,Provider,Plan,Moneda,Estado,Vence,Creada";
  const lines = rows.map((r) => {
    const s = r.subscription;
    const email = escapeCSV(r.profile?.email || r.migrationId || "");
    const role = r.profile?.role || "migrated";
    const provider = s?.provider || (r.migrationId ? (r.migrationMpPreapprovalId ? "mercadopago" : r.migrationStripeSubId ? "stripe" : "migrado") : "");
    const plan = (s as any)?.plan_type || "";
    const currency = s?.plan_currency || "";
    const statusVal = s?.status || (r.migrationId ? "pending" : "none");
    const periodEnd = s?.current_period_end
      ? new Date(s.current_period_end).toISOString()
      : "";
    const createdAt = r.profile?.created_at
      ? new Date(r.profile.created_at).toISOString()
      : "";
    return `${email},${role},${provider},${plan},${currency},${statusVal},${periodEnd},${createdAt}`;
  });

  return [header, ...lines].join("\n");
}

export async function searchMigratedSubscribersForAdmin(
  search: string,
  page: number,
  pageSize: number,
): Promise<SearchMigratedResult> {
  let query = supabaseAdmin
    .from("subscriber_migrations")
    .select("email, migrated_at, stripe_subscription_id", { count: "exact", head: false });

  if (search) {
    query = query.ilike("email", `%${search}%`);
  }

  const { data: migs, error, count } = await query
    .order("migrated_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error || !migs) {
    return { rows: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("email");

  const accountEmails = new Set((profiles || []).map((p) => p.email));

  const rows = (migs as { email: string; migrated_at: string; stripe_subscription_id: string | null }[]).map((m) => ({
    email: m.email,
    migratedAt: m.migrated_at,
    hasAccount: accountEmails.has(m.email),
    hasStripe: !!m.stripe_subscription_id,
  }));

  const total = count || 0;
  const totalPages = Math.ceil(total / pageSize);

  return { rows, total, page, pageSize, totalPages };
}

// Estado live de Stripe para migraciones: cache best-effort 60s por instancia.
// Evita 1 roundtrip a la API de Stripe (~1.4s) en cada click de filtro.
let stripeStatusCache: { at: number; map: Map<string, string> } = { at: 0, map: new Map() };
const STRIPE_STATUS_TTL_MS = 60 * 1000;

async function getStripeStatusMap(stripeSubIds: string[]): Promise<Map<string, string>> {
  const fresh = Date.now() - stripeStatusCache.at < STRIPE_STATUS_TTL_MS;
  if (fresh) {
    const hit = new Map<string, string>();
    for (const id of stripeSubIds) {
      const s = stripeStatusCache.map.get(id);
      if (s) hit.set(id, s);
    }
    if (hit.size > 0 || stripeStatusCache.map.size > 0) return hit;
  }
  const map = new Map<string, string>();
  if (!stripe) return map;
  try {
    const stripeSubs = await stripe.subscriptions.list({ limit: 100 });
    for (const s of stripeSubs.data) {
      map.set(s.id, s.status);
    }
    stripeStatusCache = { at: Date.now(), map };
  } catch {
    // If Stripe query fails, we just won't show real-time status
  }
  const out = new Map<string, string>();
  for (const id of stripeSubIds) {
    const s = map.get(id);
    if (s) out.set(id, s);
  }
  return out;
}

// El estado live de Stripe solo se muestra en filas de migración pendiente:
// para el resto de las pestañas no se consulta (era ~1.4s por request).
function needsStripeStatus(status: AdminSubscriberStatus): boolean {
  return status === "all" || status === "pending";
}

export async function searchSubscribersForAdmin(
  search: string,
  status: AdminSubscriberStatus,
  page: number,
  pageSize: number,
): Promise<SearchSubscribersResult> {
  // Lecturas independientes en paralelo (antes eran 3 roundtrips en serie).
  // Columnas acotadas: la tabla crece y `select *` paga transferencia de más.
  const profilesBase = supabaseAdmin
    .from("profiles")
    .select("id, email, role, subscription_id, created_at");

  let profilesQuery = search
    ? profilesBase.ilike("email", `%${search}%`)
    : profilesBase;

  let migQuery = supabaseAdmin
    .from("subscriber_migrations")
    .select("id, email, migrated_at, stripe_subscription_id, mp_preapproval_id, mp_plan_currency, old_subscription_data");
  if (search) {
    migQuery = migQuery.ilike("email", `%${search}%`);
  }

  const [{ data: allProfiles, error }, { data: migs }, { count: totalMigrated }] = await Promise.all([
    profilesQuery.order("created_at", { ascending: false }),
    migQuery.order("migrated_at", { ascending: false }),
    supabaseAdmin.from("subscriber_migrations").select("id", { count: "exact", head: true }),
  ]);

  const profiles = (error || !allProfiles) ? [] : (allProfiles as Profile[]);

  const profileEmails = new Set(profiles.map((p) => p.email));

  const pendingMigrations = ((migs as any[]) || []).filter((m) => !profileEmails.has(m.email));
  const totalPending = pendingMigrations.length;

  // Estado live de Stripe solo donde se muestra (tabs todas/pendientes).
  const stripeSubIds = needsStripeStatus(status)
    ? pendingMigrations.map((m) => m.stripe_subscription_id).filter((id): id is string => !!id)
    : [];
  const stripeStatusMap = stripeSubIds.length > 0 ? await getStripeStatusMap(stripeSubIds) : new Map<string, string>();

  // Count refunded (old_subscription_data has refunded_at, but stripe_subscription_id is null)
  const refundedMigrations = pendingMigrations.filter((m) =>
    !m.stripe_subscription_id && (m.old_subscription_data as any)?.refunded_at
  );
  const totalRefunded = refundedMigrations.length;

  const subIds = profiles
    .map((p) => p.subscription_id)
    .filter((id): id is string => !!id);

  let subMap = new Map<string, Subscription>();
  if (subIds.length > 0) {
    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("id, user_id, provider, plan_type, plan_currency, status, current_period_end")
      .in("id", subIds);
    for (const s of (subs as Subscription[]) || []) {
      subMap.set(s.id, s);
    }
  }

  const profileRows: AdminSubscriberRow[] = profiles.map((p) => ({
    profile: p,
    subscription: p.subscription_id ? subMap.get(p.subscription_id) || null : null,
  }));

  // Fallback por user_id: una sub 'incomplete' (pago aún no confirmado) nunca
  // se linkea a profiles.subscription_id por diseño, pero igual debe verse en
  // el panel en vez de figurar como "sin sub". Solo aplica cuando el perfil
  // no apunta a ninguna suscripción.
  const unlinkedUserIds = profileRows
    .filter((r) => r.profile && !r.subscription)
    .map((r) => (r.profile as Profile).id);
  if (unlinkedUserIds.length > 0) {
    const { data: looseSubs } = await supabaseAdmin
      .from("subscriptions")
      .select("id, user_id, provider, plan_type, plan_currency, status, current_period_end")
      .in("user_id", unlinkedUserIds)
      .order("created_at", { ascending: false });
    const firstByUser = new Map<string, Subscription>();
    for (const s of (looseSubs as Subscription[]) || []) {
      if (!firstByUser.has(s.user_id)) firstByUser.set(s.user_id, s);
    }
    for (const r of profileRows) {
      if (r.profile && !r.subscription) {
        const found = firstByUser.get(r.profile.id);
        if (found) {
          r.subscription = found;
          subMap.set(found.id, found);
        }
      }
    }
  }

  const pendingRows: AdminSubscriberRow[] = pendingMigrations.map((m) => {
    const refunded = !m.stripe_subscription_id && !!(m.old_subscription_data as any)?.refunded_at;
    const stripeStatus = m.stripe_subscription_id ? stripeStatusMap.get(m.stripe_subscription_id) : undefined;
    return {
      profile: null,
      subscription: null,
      migrationId: m.id,
      migrationEmail: m.email,
      migrationStripeSubId: m.stripe_subscription_id,
      migrationStripeStatus: stripeStatus,
      migrationMpPreapprovalId: m.mp_preapproval_id,
      migrationMpCurrency: m.mp_plan_currency,
      migrationRefunded: refunded,
    };
  });

  let allRows = [...profileRows, ...pendingRows];

  if (status === "active") {
    allRows = allRows.filter(
  (r) => isActiveSubscription(r.subscription?.status, r.subscription?.current_period_end ?? undefined),
);
  } else if (status === "canceled") {
    allRows = allRows.filter((r) => r.subscription?.status === "canceled");
  } else if (status === "none") {
    allRows = allRows.filter((r) => !!r.profile && !r.subscription);
  } else if (status === "pending") {
    allRows = allRows.filter((r) => !!r.migrationId && !r.migrationRefunded);
  } else if (status === "refunded") {
    allRows = allRows.filter((r) => !!r.migrationId && !!r.migrationRefunded);
  } else if (status === "digital") {
    allRows = allRows.filter((r) => (r.subscription as any)?.plan_type !== "mail_club" && !!r.subscription);
  } else if (status === "mail_club") {
    allRows = allRows.filter((r) => (r.subscription as any)?.plan_type === "mail_club");
  }

  // Global stats (respect search, ignore status/pagination) — fixes P2
  const totalActive = profileRows.filter((r) =>
    isActiveSubscription(r.subscription?.status, r.subscription?.current_period_end ?? undefined),
  ).length;
  const totalCanceled = profileRows.filter((r) => r.subscription?.status === "canceled").length;
  const totalNone = profileRows.filter((r) => !!r.profile && !r.subscription).length;

  const total = allRows.length;
  const totalPages = Math.ceil(total / pageSize);
  const rows = allRows.slice((page - 1) * pageSize, page * pageSize);

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages,
    totalMigrated: totalMigrated || 0,
    totalPending,
    totalRefunded,
    totalActive,
    totalCanceled,
    totalNone,
  };
}
