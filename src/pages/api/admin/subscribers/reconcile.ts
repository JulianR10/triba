import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok } from "../../../../lib/response";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { logger } from "../../../../lib/logger";
import { logAdminAction } from "../../../../lib/admin/audit";
import { syncPaidSubscriber } from "../../../../lib/sender";
import { sendWelcomeEmail } from "../../../../lib/email";
import { getPreferredLocale } from "../../../../lib/locale-pref";
import { sendMailClubActivation } from "../../../../lib/mail-club-activation";
import { stripe } from "../../../../lib/stripe";
import {
  activateSubscription,
  mpGet,
  type MpPreapproval,
} from "../../../../lib/mercadopago-activation";

export const prerender = false;

interface Candidate {
  subscription_id: string;
  user_id: string;
  email: string;
  provider: string;
  plan_type: string;
  plan_currency: string;
  provider_subscription_id: string;
  evidence: string;
}

interface Skipped {
  subscription_id: string;
  email: string;
  reason: string;
}

// Junta evidencia del proveedor para cada fila 'incomplete'. Solo las que
// tienen pago confirmado califican como candidatas; 'past_due' no entra acá
// (dunning conserva acceso por diseño, no es reconciliación).
async function findCandidates(): Promise<{ candidates: Candidate[]; skipped: Skipped[] }> {
  const candidates: Candidate[] = [];
  const skipped: Skipped[] = [];

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

async function activateStripeCandidate(c: Candidate): Promise<void> {
  if (!stripe) throw new Error("Stripe not configured");
  const stripeSub = await stripe.subscriptions.retrieve(c.provider_subscription_id);
  if (stripeSub.status !== "active" && stripeSub.status !== "trialing") {
    throw new Error(`Stripe status is ${stripeSub.status}, not payable`);
  }
  // Esta cuenta no expone current_period_* en la suscripción: fallback +30d.
  const startSec = (stripeSub as any).current_period_start ?? (stripeSub as any).start_date ?? stripeSub.created;
  const endSec = (stripeSub as any).current_period_end ?? (startSec ? startSec + 30 * 24 * 60 * 60 : undefined);
  const now = new Date().toISOString();

  // Transición atómica incomplete -> active (mismo criterio que invoice.paid).
  const { data: flipped } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "active",
      ...(startSec ? { current_period_start: new Date(startSec * 1000).toISOString() } : {}),
      ...(endSec ? { current_period_end: new Date(endSec * 1000).toISOString() } : {}),
      updated_at: now,
    })
    .eq("id", c.subscription_id)
    .neq("status", "active")
    .select("id");
  if (!flipped || (flipped as any[]).length === 0) return;

  await supabaseAdmin.from("profiles").upsert({
    id: c.user_id,
    role: "subscriber",
    subscription_id: c.subscription_id,
    updated_at: now,
  } as any, { onConflict: "id" });

  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "canceled", updated_at: now })
    .eq("user_id", c.user_id)
    .eq("provider", "migrated");

  if (c.email) {
    syncPaidSubscriber(c.email).catch((err) =>
      logger.error({ err, email: c.email }, "Sender sync error (reconcile stripe)"),
    );
    try {
      if (c.plan_type === "mail_club") {
        await sendMailClubActivation(c.user_id, c.email);
      } else {
        const locale = await getPreferredLocale(c.user_id).catch(() => "es" as const);
        await sendWelcomeEmail(c.email, false, locale);
      }
    } catch (err) {
      logger.error({ err, email: c.email }, "Welcome email error (reconcile stripe)");
    }
  }
}

export const GET: APIRoute = async ({ locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  const { candidates, skipped } = await findCandidates();
  return ok({ candidates, skipped });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  const body = await request.json().catch(() => ({}));
  const onlyIds = Array.isArray(body.subscriptionIds) ? body.subscriptionIds as string[] : null;

  const { candidates, skipped } = await findCandidates();
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
      logAdminAction(admin.user.id, admin.profile.email, "subscriber.reconciled", "subscriber", c.user_id, {
        reconciled_email: c.email,
        provider: c.provider,
        evidence: c.evidence,
      });
    } catch (err: any) {
      logger.error({ err, subId: c.subscription_id }, "[reconcile] activation error");
      failed.push({ email: c.email, error: (err.message || "error").slice(0, 200) });
    }
  }

  return ok({ activated, failed, skipped });
};
