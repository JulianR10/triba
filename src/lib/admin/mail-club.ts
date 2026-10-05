import { supabaseAdmin } from "../supabase-admin";
import { logger } from "../logger";
import {
  MAIL_CLUB_CUTOFF_DAY,
  MAIL_CLUB_TIME_ZONE,
  resolveMailClubZone,
  shipmentMonthLabel,
} from "../mail-club";
import { getPreferredLocale } from "../locale-pref";
import { sendDispatchNoticeEmail } from "../email";
import { csvCell } from "../csv";

export interface MailClubBatchSummary {
  id: string;
  period_year: number;
  period_month: number;
  cutoff_at: string;
  dispatched_at: string | null;
  status: "open" | "closed" | "dispatched";
  item_count: number;
}

function madridOffsetMinutes(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: MAIL_CLUB_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUTC - instant.getTime()) / 60000);
}

// Corte inclusivo: día 15 23:59:59 hora Madrid, devuelto como ISO UTC.
export function cutoffAtMadrid(year: number, month: number): string {
  let guess = Date.UTC(year, month - 1, MAIL_CLUB_CUTOFF_DAY, 23, 59, 59);
  for (let i = 0; i < 3; i++) {
    const off = madridOffsetMinutes(new Date(guess));
    guess = Date.UTC(year, month - 1, MAIL_CLUB_CUTOFF_DAY, 23, 59, 59) - off * 60000;
  }
  return new Date(guess).toISOString();
}

export async function listMailClubBatches(): Promise<MailClubBatchSummary[]> {
  const { data: batches } = await supabaseAdmin
    .from("mail_club_batches")
    .select("id, period_year, period_month, cutoff_at, dispatched_at, status")
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });
  const out: MailClubBatchSummary[] = [];
  for (const b of (batches as any[]) || []) {
    const { count } = await supabaseAdmin
      .from("mail_club_batch_items")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", b.id);
    out.push({ ...b, item_count: count || 0 });
  }
  return out;
}

interface SkippedRow {
  email: string;
  reason: string;
}

export interface MailClubEligibleRow {
  user_id: string;
  subscription_id: string;
  email: string;
  plan_currency: "EUR" | "USD" | "ARS";
  zone: string;
  founder_number: number | null;
  address: {
    recipient_name: string;
    country_iso: string;
    region: string;
    city: string;
    postal_code: string;
    street_address: string;
    address_extra: string;
  };
  joined_at: string;
}

// Elegibles al CORTE (no al momento de generar): plan mail_club, activas,
// período iniciado en/antes del corte y vigente al corte. Un alta posterior
// al 15 no entra retroactivamente; sin vencimiento conocido no entra.
// Solo lectura: la usan tanto la simulación (preview) como la creación.
export async function listMailClubEligible(
  cutoff: string,
): Promise<{ eligible: MailClubEligibleRow[]; skipped: SkippedRow[] }> {
  const { data: subs } = await supabaseAdmin
    .from("subscriptions")
    .select("id, user_id, plan_currency, status")
    .eq("plan_type", "mail_club")
    .eq("status", "active")
    .or(`current_period_start.is.null,current_period_start.lte.${cutoff}`)
    .gte("current_period_end", cutoff);

  const eligible: MailClubEligibleRow[] = [];
  const skipped: SkippedRow[] = [];

  for (const s of (subs as any[]) || []) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", s.user_id)
      .maybeSingle();
    const email = (profile as any)?.email || "";
    const { data: addr } = await supabaseAdmin
      .from("mailing_addresses")
      .select("recipient_name, country_iso, region, city, postal_code, street_address, address_extra")
      .eq("user_id", s.user_id)
      .maybeSingle();
    if (!addr) {
      skipped.push({ email, reason: "sin dirección postal" });
      continue;
    }
    const { data: founder } = await supabaseAdmin
      .from("mail_club_founders")
      .select("founder_number")
      .eq("user_id", s.user_id)
      .maybeSingle();

    const zone = resolveMailClubZone((addr as any).country_iso).zone;
    const joinedAt = await resolveMailClubJoinedAt(s.user_id, s.id);
    eligible.push({
      user_id: s.user_id,
      subscription_id: s.id,
      email,
      plan_currency: s.plan_currency,
      zone,
      founder_number: (founder as any)?.founder_number ?? null,
      address: {
        recipient_name: (addr as any).recipient_name,
        country_iso: (addr as any).country_iso,
        region: (addr as any).region,
        city: (addr as any).city,
        postal_code: (addr as any).postal_code,
        street_address: (addr as any).street_address,
        address_extra: (addr as any).address_extra,
      },
      joined_at: joinedAt || "",
    });
  }

  return { eligible, skipped };
}

// Activas Mail Club sin dirección: quedarían fuera del lote en silencio.
// Es el reclamo más caro ("pagué y no me llegó"), va a superficie en el panel.
export async function listMailClubWithoutAddress(): Promise<{ user_id: string; email: string; since: string }[]> {
  const { data: subs } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id, created_at")
    .eq("plan_type", "mail_club")
    .eq("status", "active");
  if (!subs || (subs as any[]).length === 0) return [];
  const userIds = [...new Set((subs as any[]).map((s) => s.user_id as string))];
  const sinceByUser = new Map<string, string>();
  for (const s of subs as any[]) {
    if (!sinceByUser.has(s.user_id)) sinceByUser.set(s.user_id, s.created_at);
  }
  const { data: addrs } = await supabaseAdmin
    .from("mailing_addresses")
    .select("user_id")
    .in("user_id", userIds);
  const withAddr = new Set(((addrs as any[]) || []).map((a) => a.user_id as string));
  const missing = userIds.filter((u) => !withAddr.has(u));
  if (missing.length === 0) return [];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .in("id", missing);
  const emailById = new Map(((profiles as any[]) || []).map((p) => [p.id as string, p.email as string]));
  return missing.map((u) => ({ user_id: u, email: emailById.get(u) || "", since: sinceByUser.get(u) || "" }));
}

// Crea (o reutiliza) el lote del mes con snapshot inmutable. Idempotente:
// re-ejecutar no duplica ni sobrescribe etiquetas ya congeladas.
export async function createMailClubBatch(
  year: number,
  month: number,
): Promise<{ batchId: string; included: number; skipped: SkippedRow[]; reused: boolean }> {
  if (!Number.isInteger(year) || year < 2026 || year > 2100) throw new Error("Año inválido");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Mes inválido");

  const cutoff = cutoffAtMadrid(year, month);

  // Un lote despachado es inmutable: repetir no lo reabre ni lo modifica.
  const { data: existingBatch } = await supabaseAdmin
    .from("mail_club_batches")
    .select("id, status")
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();
  if ((existingBatch as any)?.status === "dispatched") {
    const { count } = await supabaseAdmin
      .from("mail_club_batch_items")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", (existingBatch as any).id);
    return { batchId: (existingBatch as any).id, included: count || 0, skipped: [], reused: true };
  }

  const { data: batch, error: batchError } = await supabaseAdmin
    .from("mail_club_batches")
    .upsert(
      { period_year: year, period_month: month, cutoff_at: cutoff, status: "closed" },
      { onConflict: "period_year, period_month", ignoreDuplicates: false },
    )
    .select("id, status")
    .single();
  if (batchError || !batch) throw new Error("No se pudo crear el lote");
  const batchId = (batch as any).id as string;
  const reused = !!existingBatch;

  // Elegibles al CORTE vía función compartida (misma que el preview).
  const { eligible, skipped } = await listMailClubEligible(cutoff);

  for (const e of eligible) {
    // Snapshot completo: además de la dirección, fecha de alta y estado de la
    // suscripción quedan congelados al crear el item (el CSV ya no cambia en
    // vivo si la suscripción se cancela después del corte).
    // ignoreDuplicates: un reintento no pisa el snapshot ya congelado.
    const { error: itemError } = await supabaseAdmin.from("mail_club_batch_items").upsert(
      {
        batch_id: batchId,
        user_id: e.user_id,
        subscription_id: e.subscription_id,
        address_snapshot: e.address,
        email: e.email.toLowerCase().trim(),
        zone: e.zone,
        plan_currency: e.plan_currency,
        founder_number: e.founder_number,
        status: "included",
        joined_at: e.joined_at || null,
        sub_status: "active",
      },
      { onConflict: "batch_id, user_id", ignoreDuplicates: true },
    );
    if (itemError) {
      logger.error({ err: itemError, userId: e.user_id, batchId }, "batch item upsert error");
      skipped.push({ email: e.email, reason: "error al guardar" });
      continue;
    }
  }

  // Conteo real (un reintento no suma duplicados gracias a ignoreDuplicates).
  const { count: included } = await supabaseAdmin
    .from("mail_club_batch_items")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId);

  return { batchId, included: included || 0, skipped, reused };
}

export interface MailClubBatchItemView {
  id: string;
  email: string;
  zone: string;
  plan_currency: string;
  founder_number: number | null;
  status: string;
  notice_sent: boolean;
  address: {
    recipient_name: string;
    street_address: string;
    address_extra: string;
    city: string;
    region: string;
    postal_code: string;
    country_iso: string;
  };
  joined_at: string;
  live_status: string;
}

// Fecha de alta Mail Club: fundación > upgrade confirmado > creación de la sub.
async function resolveMailClubJoinedAt(userId: string, subscriptionId: string | null): Promise<string> {
  const { data: founder } = await supabaseAdmin
    .from("mail_club_founders")
    .select("first_confirmed_at")
    .eq("user_id", userId)
    .maybeSingle();
  if ((founder as any)?.first_confirmed_at) {
    return (founder as any).first_confirmed_at as string;
  }
  const { data: up } = await supabaseAdmin
    .from("mail_club_upgrades")
    .select("updated_at")
    .eq("user_id", userId)
    .eq("status", "recurrence_updated")
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if ((up as any)?.updated_at) {
    return (up as any).updated_at as string;
  }
  if (subscriptionId) {
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("created_at")
      .eq("id", subscriptionId)
      .maybeSingle();
    return (sub as any)?.created_at || "";
  }
  return "";
}

async function resolveLiveStatus(subscriptionId: string | null): Promise<string> {
  if (!subscriptionId) return "";
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("status")
    .eq("id", subscriptionId)
    .maybeSingle();
  return (sub as any)?.status || "";
}

// Detalle de un lote para pantalla: snapshot congelado + fecha de alta.
// Misma fuente que el CSV; la pantalla es lectura, el CSV sigue siendo la
// vía de etiquetas/impresión.
export async function listMailClubBatchItems(batchId: string): Promise<MailClubBatchItemView[]> {
  const { data: items } = await supabaseAdmin
    .from("mail_club_batch_items")
    .select("*")
    .eq("batch_id", batchId)
    .order("email", { ascending: true });
  const out: MailClubBatchItemView[] = [];
  for (const it of (items as any[]) || []) {
    const snap = (it.address_snapshot as any) || {};
    out.push({
      id: it.id,
      email: it.email || "",
      zone: it.zone || "",
      plan_currency: it.plan_currency || "",
      founder_number: it.founder_number ?? null,
      status: it.status || "",
      notice_sent: !!it.notice_sent,
      address: {
        recipient_name: snap.recipient_name || "",
        street_address: snap.street_address || "",
        address_extra: snap.address_extra || "",
        city: snap.city || "",
        region: snap.region || "",
        postal_code: snap.postal_code || "",
        country_iso: snap.country_iso || "",
      },
      joined_at: it.joined_at || (await resolveMailClubJoinedAt(it.user_id, it.subscription_id)),
      live_status: it.sub_status || (await resolveLiveStatus(it.subscription_id)),
    });
  }
  return out;
}

export async function exportMailClubBatchCSV(batchId: string): Promise<string> {
  const { data: items } = await supabaseAdmin
    .from("mail_club_batch_items")
    .select("*")
    .eq("batch_id", batchId)
    .order("email", { ascending: true });

  const header = [
    "Destinataria", "Dirección", "Complemento", "Ciudad", "Provincia", "Código postal",
    "País", "Email", "Zona", "Moneda", "Alta Mail Club", "Estado", "Fundadora",
  ].join(",");

  const lines: string[] = [];
  for (const it of (items as any[]) || []) {
    const snap = (it.address_snapshot as any) || {};
    // Preferir el snapshot congelado; los lotes viejos (pre-025) caen a vivo.
    const joinedAt = it.joined_at || (await resolveMailClubJoinedAt(it.user_id, it.subscription_id));
    const liveStatus = it.sub_status || (await resolveLiveStatus(it.subscription_id));
    lines.push(
      [
        snap.recipient_name, snap.street_address, snap.address_extra, snap.city,
        snap.region, snap.postal_code, snap.country_iso, it.email, it.zone,
        it.plan_currency,
        joinedAt ? new Date(joinedAt).toISOString().slice(0, 10) : "",
        liveStatus,
        it.founder_number ?? "",
      ].map(csvCell).join(","),
    );
  }

  return "﻿" + [header, ...lines].join("\n");
}

interface DispatchFailure {
  email: string;
  error: string;
}

// Registra el despacho del día 20 y avisa por email. El estado físico del
// item (included/dispatched) es independiente del aviso: si falla Sender,
// el lote sigue registrado como despachado y solo el aviso queda pendiente
// (notice_sent=false) para reintentar. Los ya avisados no se repiten.
export async function dispatchMailClubBatch(
  batchId: string,
  onlyEmails?: string[],
): Promise<{ sent: number; failed: DispatchFailure[]; alreadyDispatched: boolean }> {
  const { data: batch } = await supabaseAdmin
    .from("mail_club_batches")
    .select("id, period_year, period_month, status")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) throw new Error("Lote no encontrado");
  const alreadyDispatched = (batch as any).status === "dispatched";

  let query = supabaseAdmin
    .from("mail_club_batch_items")
    .select("*")
    .eq("batch_id", batchId)
    .eq("notice_sent", false);
  if (onlyEmails && onlyEmails.length > 0) {
    query = query.in("email", onlyEmails.map((e) => e.toLowerCase().trim()));
  }
  const { data: items } = await query;

  const monthLabel = (locale: "es" | "en") =>
    shipmentMonthLabel((batch as any).period_year, (batch as any).period_month, locale);

  let sent = 0;
  const failed: DispatchFailure[] = [];
  for (const it of (items as any[]) || []) {
    try {
      const locale = await getPreferredLocale(it.user_id).catch(() => "es" as const);
      const snap = (it.address_snapshot as any) || {};
      await sendDispatchNoticeEmail(
        it.email,
        { recipientName: snap.recipient_name || it.email, shipmentMonth: monthLabel(locale) },
        locale,
      );
      await supabaseAdmin
        .from("mail_club_batch_items")
        .update({ notice_sent: true })
        .eq("id", it.id);
      sent++;
    } catch (err: any) {
      const message = err.message || "send error";
      logger.error({ err, itemId: it.id }, "dispatch notice error");
      failed.push({ email: it.email, error: message.slice(0, 200) });
    }
  }

  // El primer despacho registra fecha y estado; un reintento de avisos no
  // reescribe dispatched_at ni vuelve a marcar items. Un lote sin items no
  // se marca como despachado (no salió nada físicamente).
  if (!alreadyDispatched) {
    const { count: itemCount } = await supabaseAdmin
      .from("mail_club_batch_items")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batchId);
    if ((itemCount || 0) > 0) {
      await supabaseAdmin
        .from("mail_club_batches")
        .update({
          status: "dispatched",
          dispatched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", batchId);
      await supabaseAdmin
        .from("mail_club_batch_items")
        .update({ status: "dispatched" })
        .eq("batch_id", batchId)
        .eq("status", "included");
    } else {
      logger.warn({ batchId }, "dispatch on empty batch — not marking dispatched");
    }
  }

  return { sent, failed, alreadyDispatched };
}
