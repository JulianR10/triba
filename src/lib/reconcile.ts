// Reconciliación de pagos: fuente única usada por el endpoint admin, el
// botón de la ficha y el cron automático. Solo activa con evidencia del
// proveedor (pago aprobado); 'past_due' no entra (dunning por diseño).
import { supabaseAdmin } from "./supabase-admin";
import { logger } from "./logger";
import { syncPaidSubscriber } from "./sender";
import { sendWelcomeEmail } from "./email";
import { getPreferredLocale } from "./locale-pref";
import { sendMailClubActivation } from "./mail-club-activation";
import { stripe } from "./stripe";
import { periodRange } from "./stripe-period";
import { roleAfterPayment } from "./profile-role";
import { blockIfDuplicateCheckout } from "./duplicate-checkout";
import { pickLiveSubscription } from "./subscription-guard";
import {
  activateSubscription,
  applyMpRenewal,
  mpGet,
  type MpPreapproval,
} from "./mercadopago-activation";

export interface ReconcileCandidate {
  subscription_id: string;
  user_id: string;
  email: string;
  provider: string;
  plan_type: string;
  plan_currency: string;
  provider_subscription_id: string;
  evidence: string;
}

export interface ReconcileSkipped {
  subscription_id: string;
  email: string;
  reason: string;
}

// Junta evidencia del proveedor para cada fila 'incomplete'.
export async function findReconcileCandidates(): Promise<{
  candidates: ReconcileCandidate[];
  skipped: ReconcileSkipped[];
}> {
  const candidates: ReconcileCandidate[] = [];
  const skipped: ReconcileSkipped[] = [];

  const { data: subs } = await supabaseAdmin
    .from("subscriptions")
    .select("id, user_id, provider, plan_type, plan_currency, status, provider_subscription_id")
    .eq("status", "incomplete");
  if (!subs || (subs as any[]).length === 0) return { candidates, skipped };

  for (const s of subs as any[]) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", s.user_id)
      .maybeSingle();
    const email = (profile as any)?.email || "";

    if (s.provider === "mercadopago") {
      const page = await mpGet<{ results?: { payment?: { id?: number; status?: string } }[] }>(
        `/authorized_payments/search?preapproval_id=${s.provider_subscription_id}`,
      );
      const approved = (page?.results || []).some((r) => r.payment?.status === "approved");
      if (approved) {
        candidates.push({
          subscription_id: s.id,
          user_id: s.user_id,
          email,
          provider: s.provider,
          plan_type: s.plan_type,
          plan_currency: s.plan_currency,
          provider_subscription_id: s.provider_subscription_id,
          evidence: "authorized_payment approved",
        });
      } else {
        skipped.push({ subscription_id: s.id, email, reason: "sin pago aprobado en MP" });
      }
    } else if (s.provider === "stripe") {
      if (!stripe) {
        skipped.push({ subscription_id: s.id, email, reason: "Stripe no configurado" });
        continue;
      }
      try {
        const stripeSub = await stripe.subscriptions.retrieve(s.provider_subscription_id);
        if (stripeSub.status === "active" || stripeSub.status === "trialing") {
          candidates.push({
            subscription_id: s.id,
            user_id: s.user_id,
            email,
            provider: s.provider,
            plan_type: s.plan_type,
            plan_currency: s.plan_currency,
            provider_subscription_id: s.provider_subscription_id,
            evidence: `stripe status=${stripeSub.status}`,
          });
        } else {
          skipped.push({ subscription_id: s.id, email, reason: `stripe status=${stripeSub.status}` });
        }
      } catch (err: any) {
        logger.error({ err, subId: s.id }, "[reconcile] stripe retrieve error");
        skipped.push({ subscription_id: s.id, email, reason: "error consultando Stripe" });
      }
    } else {
      skipped.push({ subscription_id: s.id, email, reason: `provider ${s.provider} no reconciliable` });
    }
  }

  return { candidates, skipped };
}

async function activateStripeCandidate(c: ReconcileCandidate): Promise<void> {
  if (!stripe) throw new Error("Stripe not configured");
  const stripeSub = await stripe.subscriptions.retrieve(c.provider_subscription_id);
  if (stripeSub.status !== "active" && stripeSub.status !== "trialing") {
    throw new Error(`Stripe status is ${stripeSub.status}, not payable`);
  }
  // Período real (por ítem en esta cuenta); el +30d de periodRange es solo el último recurso.
  const period = periodRange(stripeSub);
  const now = new Date().toISOString();

  // Transición atómica incomplete -> active (mismo criterio que invoice.paid).
  const { data: flipped, error: flipError } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "active",
      ...(period.start ? { current_period_start: period.start } : {}),
      ...(period.end ? { current_period_end: period.end } : {}),
      updated_at: now,
    })
    .eq("id", c.subscription_id)
    .neq("status", "active")
    .select("id");
  if (flipError) throw new Error(`subscription activation failed: ${flipError.message}`);
  if (!flipped || (flipped as any[]).length === 0) return;

  // Misma regla que el webhook: la recuperación no puede dejar dos cobros vivos ni repuntar el perfil.
  if (await blockIfDuplicateCheckout({
    id: c.subscription_id,
    userId: c.user_id,
    provider: "stripe",
    providerSubscriptionId: c.provider_subscription_id,
  })) return;

  const { error: linkError } = await supabaseAdmin.from("profiles").upsert({
    id: c.user_id,
    role: await roleAfterPayment(c.user_id),
    subscription_id: c.subscription_id,
    updated_at: now,
  } as any, { onConflict: "id" });
  if (linkError) throw new Error(`profile link failed: ${linkError.message}`);

  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "canceled", updated_at: now })
    .eq("user_id", c.user_id)
    .eq("provider", "migrated");

  if (c.email) {
    syncPaidSubscriber(c.email).catch((err) =>
      logger.error({ err, userId: c.user_id, subscriptionId: c.subscription_id }, "Sender sync error (reconcile stripe)"),
    );
    try {
      if (c.plan_type === "mail_club") {
        await sendMailClubActivation(c.user_id, c.email);
      } else {
        const locale = await getPreferredLocale(c.user_id).catch(() => "es" as const);
        await sendWelcomeEmail(c.email, false, locale);
      }
    } catch (err) {
      logger.error({ err, userId: c.user_id, subscriptionId: c.subscription_id }, "Welcome email error (reconcile stripe)");
    }
  }
}

export interface ReconcileApplyResult {
  activated: string[];
  failed: { email: string; error: string }[];
  skipped: ReconcileSkipped[];
}

// Activa candidatos con evidencia. Idempotente por las guardas de activación
// (upsert + primera-activación); seguro para correr en cron.
export async function applyReconcileCandidates(
  onlyIds?: string[] | null,
): Promise<ReconcileApplyResult> {
  const { candidates, skipped } = await findReconcileCandidates();
  const targets = onlyIds ? candidates.filter((c) => onlyIds.includes(c.subscription_id)) : candidates;

  const activated: string[] = [];
  const failed: { email: string; error: string }[] = [];

  for (const c of targets) {
    try {
      if (c.provider === "mercadopago") {
        const preapproval = await mpGet<MpPreapproval>(`/preapproval/${c.provider_subscription_id}`);
        if (!preapproval) throw new Error("preapproval no disponible en MP");
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .eq("id", c.user_id)
          .maybeSingle();
        await activateSubscription({
          preapproval,
          userId: c.user_id,
          email: (profile as any)?.email || c.email || undefined,
          providerSubscriptionId: c.provider_subscription_id,
          confirmedPayment: true,
        });
      } else if (c.provider === "stripe") {
        await activateStripeCandidate(c);
      }
      activated.push(c.email);
    } catch (err: any) {
      logger.error({ err, subId: c.subscription_id }, "[reconcile] activation error");
      failed.push({ email: c.email, error: (err.message || "error").slice(0, 200) });
    }
  }

  return { activated, failed, skipped };
}

// Red de seguridad de renovaciones MP: si el webhook no aplicó un cobro aprobado,
// la fila queda 'active' con el período vencido y la clienta pierde el acceso.
// Renueva solo con evidencia de MP: preapproval 'authorized' y un cobro posterior
// al vencimiento. Canceladas/pausadas se omiten (vencieron legítimamente).
// Un error de MP (429) deja la fila para la corrida siguiente.
export async function renewExpiredMpSubscriptions(limit = 100): Promise<{ renewed: number; failed: number }> {
  const { data: subs, error } = await supabaseAdmin
    .from("subscriptions")
    .select("id, provider_subscription_id, current_period_end")
    .eq("provider", "mercadopago")
    .eq("status", "active")
    .lt("current_period_end", new Date().toISOString())
    .order("current_period_end")
    .limit(limit);
  if (error) throw new Error(`expired MP subscriptions query failed: ${error.message}`);

  let renewed = 0;
  let failed = 0;
  for (const s of (subs as any[]) || []) {
    try {
      const preapproval = await mpGet<MpPreapproval>(`/preapproval/${s.provider_subscription_id}`);
      if (!preapproval || preapproval.status !== "authorized") continue;
      const lastCharge = preapproval.summarized?.last_charged_date
        ? new Date(preapproval.summarized.last_charged_date).getTime()
        : 0;
      // El primer cobro es ~30 días antes del vencimiento: la tolerancia de 2 días lo descarta.
      if (lastCharge < new Date(s.current_period_end).getTime() - 2 * 24 * 60 * 60 * 1000) continue;
      if (await applyMpRenewal(s.id, s.provider_subscription_id)) {
        renewed++;
        logger.warn({ subscriptionId: s.id }, "[reconcile] MP renewal recovered — the webhook did not apply it");
      }
    } catch (err) {
      failed++;
      logger.error({ err, subId: s.id }, "[reconcile] MP renewal error");
    }
  }
  return { renewed, failed };
}

// Cura el puntero del perfil: quien tiene una suscripción paga vigente debe figurar como
// suscriptora aunque el puntero apunte a otra fila ya vencida/cancelada, o no exista (o el rol
// haya quedado en 'free'). Solo reenlaza hacia una fila viva; no cancela ni toca nada del
// proveedor, y no degrada admins. Si el puntero ya apunta a una fila viva, no lo mueve.
export async function healProfileSubscriptions(): Promise<{ healed: number; failed: number }> {
  const { data: rows, error } = await supabaseAdmin
    .from("subscriptions")
    .select("id, user_id, provider, status, current_period_end")
    .in("provider", ["stripe", "mercadopago"])
    .eq("status", "active");
  if (error) throw new Error(`live subscriptions query failed: ${error.message}`);

  const liveByUser = new Map<string, any[]>();
  for (const r of (rows as any[]) || []) {
    if (!pickLiveSubscription([r])) continue;
    const list = liveByUser.get(r.user_id) ?? [];
    list.push(r);
    liveByUser.set(r.user_id, list);
  }
  if (liveByUser.size === 0) return { healed: 0, failed: 0 };

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, subscription_id")
    .in("id", [...liveByUser.keys()]);
  if (profilesError) throw new Error(`profiles query failed: ${profilesError.message}`);

  let healed = 0;
  let failed = 0;
  for (const p of (profiles as any[]) || []) {
    const live = liveByUser.get(p.id) ?? [];
    const pointerIsLive = live.some((r) => r.id === p.subscription_id);
    const roleOk = p.role === "subscriber" || p.role === "admin";
    if (pointerIsLive && roleOk) continue;
    const target = pickLiveSubscription(live, p.subscription_id);
    if (!target) continue;
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        role: await roleAfterPayment(p.id),
        subscription_id: target.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.id);
    if (updateError) {
      failed++;
      logger.error({ err: updateError, userId: p.id }, "[reconcile] profile heal failed");
      continue;
    }
    healed++;
    logger.warn({ userId: p.id, subscriptionId: target.id }, "[reconcile] profile re-linked to its live subscription");
  }
  return { healed, failed };
}

