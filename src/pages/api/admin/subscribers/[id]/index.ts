import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../lib/auth";
import { ok, error } from "../../../../../lib/response";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";

export const prerender = false;

// Ficha 360° de una suscriptora: todo lo necesario para atender soporte sin
// cruzar pantallas. Solo lectura (las acciones usan sus endpoints propios).
export const GET: APIRoute = async ({ params, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  const id = params.id;
  if (!id) return error("ID inválido", 400);

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role, subscription_id, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!profile) return error("Suscriptora no encontrada", 404);

  const email = (profile as any).email as string;

  const [
    { data: subscriptions },
    { data: address },
    { data: founder },
    { data: upgrades },
    { data: batchItems },
  ] = await Promise.all([
    supabaseAdmin
      .from("subscriptions")
      .select("id, provider, provider_subscription_id, plan_type, plan_currency, status, cancel_at_period_end, current_period_start, current_period_end, welcome_sent_at, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("mailing_addresses")
      .select("recipient_name, country_iso, region, city, postal_code, street_address, address_extra, updated_at")
      .eq("user_id", id)
      .maybeSingle(),
    supabaseAdmin
      .from("mail_club_founders")
      .select("founder_number, first_confirmed_at")
      .eq("user_id", id)
      .maybeSingle(),
    supabaseAdmin
      .from("mail_club_upgrades")
      .select("id, from_plan, to_plan, plan_currency, amount_cents, provider, status, error, created_at, updated_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("mail_club_batch_items")
      .select("batch_id, email, zone, plan_currency, founder_number, status, notice_sent, joined_at, sub_status, address_snapshot")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
  ]);

  // Períodos de los lotes donde apareció.
  let batches: any[] = [];
  const batchIds = [...new Set(((batchItems as any[]) || []).map((i) => i.batch_id).filter(Boolean))];
  if (batchIds.length > 0) {
    const { data: batchRows } = await supabaseAdmin
      .from("mail_club_batches")
      .select("id, period_year, period_month, status, dispatched_at")
      .in("id", batchIds);
    const byId = new Map(((batchRows as any[]) || []).map((b) => [b.id, b]));
    batches = ((batchItems as any[]) || []).map((i) => ({ ...i, batch: byId.get(i.batch_id) || null }));
  }

  // Timeline: acciones admin sobre esta usuaria (por entity_id o por email en details).
  const { data: logsById } = await supabaseAdmin
    .from("admin_audit_log")
    .select("id, admin_email, action, entity_type, created_at, details")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(30);
  const { data: logsByEmail } = await supabaseAdmin
    .from("admin_audit_log")
    .select("id, admin_email, action, entity_type, created_at, details")
    .eq("entity_type", "subscriber")
    .order("created_at", { ascending: false })
    .limit(100);
  const seen = new Set<string>();
  const timeline: any[] = [];
  for (const log of [...((logsById as any[]) || []), ...((logsByEmail as any[]) || [])]) {
    if (seen.has(log.id)) continue;
    seen.add(log.id);
    const details = (log.details as any) || {};
    const mentions =
      log.entity_id === id ||
      Object.values(details).some((v) => typeof v === "string" && v.toLowerCase() === email.toLowerCase());
    if (mentions) timeline.push(log);
    if (timeline.length >= 30) break;
  }

  return ok({
    profile,
    subscriptions: subscriptions || [],
    address: address || null,
    founder: founder || null,
    upgrades: upgrades || [],
    batches,
    timeline,
  });
};
