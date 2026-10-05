// Activación de suscripciones Mercado Pago — fuente única compartida por el
// webhook y la reconciliación admin. Idempotente: el upsert clavea en
// (provider, provider_subscription_id), así eventos repetidos o replays no
// duplican filas; la bienvenida solo se envía en la primera activación.
import { supabaseAdmin } from "./supabase-admin";
import { logger } from "./logger";
import { syncPaidSubscriber } from "./sender";
import { sendWelcomeEmail } from "./email";
import { getPreferredLocale } from "./locale-pref";
import { sendMailClubActivation } from "./mail-club-activation";
import { isActivationBlocked, planFromPreapproval } from "./mercadopago-status";

const MP_API_BASE = "https://api.mercadopago.com";

export interface MpPreapproval {
  id?: string;
  status?: string;
  reason?: string;
  external_reference?: string;
  payer_email?: string;
  next_payment_date?: string;
  auto_recurring?: { currency_id?: string };
}

export interface MpPayment {
  id?: number;
  status?: string;
  preapproval_id?: string;
  external_reference?: string;
  currency_id?: string;
  payer?: { email?: string };
}

export interface MpAuthorizedPaymentLink {
  preapprovalId: string;
  paymentId: string;
  payerEmail: string | null;
  userId: string | null;
}

// Resuelve un evento subscription_authorized_payment a su preaprobación.
// Cubre los dos formatos de data.id que envía MP y la ausencia de
// `preapproval_id` en /v1/payments (caso real 03-oct-2026: pago aprobado
// sin ese campo, que dejaba la sub en 'incomplete' para siempre).
export async function resolveAuthorizedPayment(dataId: string): Promise<MpAuthorizedPaymentLink | null> {
  // Caso 1: dataId es un pago directo.
  const payment = await mpGet<MpPayment>(`/v1/payments/${dataId}`);
  if (payment && payment.status === "approved") {
    const payerEmail = payment.payer?.email || null;
    const userId = payment.external_reference || null;
    if (payment.preapproval_id) {
      return { preapprovalId: payment.preapproval_id, paymentId: String(payment.id || dataId), payerEmail, userId };
    }
    // Pago aprobado sin preapproval_id: linkear por external_reference a la
    // única sub MP 'incomplete' del usuario. Con 0 o 2+ no se adivina:
    // se devuelve null y el caso queda para reconciliación admin.
    if (userId) {
      const { data: cands } = await supabaseAdmin
        .from("subscriptions")
        .select("provider_subscription_id")
        .eq("user_id", userId)
        .eq("provider", "mercadopago")
        .eq("status", "incomplete");
      if (cands && (cands as any[]).length === 1) {
        return {
          preapprovalId: (cands as any[])[0].provider_subscription_id as string,
          paymentId: String(payment.id || dataId),
          payerEmail,
          userId,
        };
      }
      logger.warn(
        { dataId, userId, count: (cands as any[])?.length || 0 },
        "[MP] approved payment without preapproval_id and ambiguous incomplete subs — needs reconcile",
      );
      return null;
    }
  }

  // Caso 2: dataId es un authorized_payment id (o el pago aún no está
  // visible): barrer las 'incomplete' y matchear vía search.
  const { data: pendings } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id, provider_subscription_id")
    .eq("provider", "mercadopago")
    .eq("status", "incomplete")
    .limit(50);
  for (const p of (pendings as any[]) || []) {
    const page = await mpGet<{ results?: { id?: number; payment?: { id?: number; status?: string } }[] }>(
      `/authorized_payments/search?preapproval_id=${(p as any).provider_subscription_id}`,
    );
    const hit = (page?.results || []).find(
      (r) => String(r.id) === String(dataId) || String(r.payment?.id) === String(dataId),
    );
    if (hit && hit.payment?.status === "approved") {
      return {
        preapprovalId: (p as any).provider_subscription_id as string,
        paymentId: String(hit.payment?.id || dataId),
        payerEmail: null,
        userId: (p as any).user_id as string,
      };
    }
  }
  return null;
}

export async function mpGet<T>(path: string): Promise<T | null> {
  const res = await fetch(`${MP_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${import.meta.env.MP_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    logger.error(
      { status: res.status, path, body: (await res.text().catch(() => "")).slice(0, 200) },
      "[MP] API error",
    );
    return null;
  }
  return res.json();
}

// Crea/refresca la suscripción y la linkea al perfil. confirmedPayment=true
// solo cuando viene de un subscription_authorized_payment aprobado: el pago
// aprobado es fuente de verdad aunque la preaprobación reporte "pending"
// (consistencia eventual de MP). El gate de estado aplica únicamente al
// evento preapproval (confirmedPayment=false).
export async function activateSubscription({
  preapproval,
  userId,
  email,
  providerSubscriptionId,
  confirmedPayment,
}: {
  preapproval: MpPreapproval;
  userId: string;
  email?: string;
  providerSubscriptionId: string;
  confirmedPayment: boolean;
}): Promise<void> {
  const plan = planFromPreapproval(preapproval);
  if (isActivationBlocked(confirmedPayment, preapproval.status)) return;

  const now = new Date().toISOString();
  // Mercado Pago solo procesa ARS en esta app: el fallback correcto es ARS,
  // no USD (un currency_id ausente clasificaba mal el plan/precio).
  const currency = (preapproval.auto_recurring?.currency_id || "ARS") as "EUR" | "USD" | "ARS";
  const periodEnd = preapproval.next_payment_date
    ? new Date(preapproval.next_payment_date).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: existingSub } = await supabaseAdmin
    .from("subscriptions")
    .select("id, status")
    .eq("provider", "mercadopago")
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();

  // Mail Club sin pago aprobado todavía: registrar pendiente sin dar acceso
  // ni bienvenida. La activación real llega con el primer pago aprobado.
  if (plan === "mail_club" && !confirmedPayment) {
    if ((existingSub as any)?.id) return;
    const { error: pendingError } = await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: userId,
        provider: "mercadopago",
        provider_subscription_id: providerSubscriptionId,
        status: "incomplete",
        plan_currency: currency,
        plan_type: plan,
        current_period_start: now,
        current_period_end: periodEnd,
      },
      { onConflict: "provider, provider_subscription_id" },
    );
    if (pendingError) {
      logger.error({ err: pendingError, userId, providerSubscriptionId }, "[MP] mail club pending upsert failed");
    }
    return;
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        provider: "mercadopago",
        provider_subscription_id: providerSubscriptionId,
        status: "active",
        plan_currency: currency,
        plan_type: plan,
        current_period_start: now,
        current_period_end: periodEnd,
      },
      { onConflict: "provider, provider_subscription_id" },
    )
    .select("id")
    .single();

  if (!sub?.id) {
    logger.error({ userId, providerSubscriptionId }, "[MP] activateSubscription upsert failed");
    return;
  }

  // Separar UPDATE desde el upsert: el on_conflict de upsert no garantiza
  // que role/subscription_id se actualicen si la fila ya existe (race condition
  // con handle_new_user que crea el profile en "free" antes del webhook).
  // UPDATE explícito fuerza el linkeo.
  await supabaseAdmin
    .from("profiles")
    .update({
      role: "subscriber",
      subscription_id: sub.id,
      updated_at: now,
    })
    .eq("id", userId);

  if (email) {
    const { error: emailErr } = await supabaseAdmin
      .from("profiles")
      .update({ email })
      .eq("id", userId)
      .is("email", null);
    if (emailErr) {
      logger.warn({ err: emailErr, userId, email }, "[MP] failed updating null email");
    }
  }

  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "canceled", updated_at: now })
    .eq("user_id", userId)
    .eq("provider", "migrated");

  // Only notify on the first activation; MP can resend events (retries up to 96h).
  // Digital keeps its original rule (notify only brand-new rows). A mail_club
  // row in 'incomplete' means this approved payment is the first
  // confirmation, so it still counts as first activation.
  const isFirstActivation =
    !(existingSub as any)?.id ||
    (plan === "mail_club" && (existingSub as any)?.status === "incomplete");
  if (!isFirstActivation) return;

  if (email) {
    syncPaidSubscriber(email).catch((err) =>
      logger.error({ err, email }, "Sender sync error (mercadopago)"),
    );
    if (plan === "mail_club") {
      try {
        await sendMailClubActivation(userId, email);
      } catch (err) {
        logger.error({ err, email }, "Mail Club welcome email error (mercadopago)");
      }
    } else {
      getPreferredLocale(userId).then((locale) =>
        sendWelcomeEmail(email, false, locale),
      ).catch((err) =>
        logger.error({ err, email }, "Welcome email error (mercadopago)"),
      );
    }
  }
}
