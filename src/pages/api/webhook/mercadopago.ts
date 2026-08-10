import type { APIRoute } from "astro";
import { WebhookSignatureValidator } from "mercadopago";
import type { Database } from "../../../lib/database.types";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { ok, error } from "../../../lib/response";
import { logger } from "../../../lib/logger";
import { syncPaidSubscriber } from "../../../lib/sender";
import { sendWelcomeEmail } from "../../../lib/email";

const isSignatureVerificationEnabled = import.meta.env.VERIFY_MP_SIGNATURES !== "false";
const MP_API_BASE = "https://api.mercadopago.com";

interface MpPreapproval {
  id?: string;
  status?: string;
  external_reference?: string;
  payer_email?: string;
  next_payment_date?: string;
  auto_recurring?: { currency_id?: string };
}

interface MpPayment {
  id?: string;
  status?: string;
  preapproval_id?: string;
  payer?: { email?: string };
}

function verifyMercadoPagoSignature(request: Request, body: any): boolean {
  if (!isSignatureVerificationEnabled) return true;

  const webhookSecret = import.meta.env.MP_WEBHOOK_SECRET || "";
  if (!webhookSecret) {
    logger.error("[MP webhook] MP_WEBHOOK_SECRET not configured — rejecting");
    return false;
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      dataId: body?.data?.id,
      secret: webhookSecret,
    });
    return true;
  } catch (err: any) {
    logger.error(
      { reason: err?.reason, requestId: err?.requestId, dataId: body?.data?.id },
      "[MP webhook] Invalid signature",
    );
    return false;
  }
}

async function mpGet<T>(path: string): Promise<T | null> {
  const res = await fetch(`${MP_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${import.meta.env.MP_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    logger.error(
      { status: res.status, path, body: (await res.text().catch(() => "")).slice(0, 200) },
      "[MP webhook] API error",
    );
    return null;
  }
  return res.json();
}

function isActivePreapproval(status?: string): boolean {
  return status === "authorized" || status === "active";
}

// MP does not expose payer_email on the preapproval; resolve it via the
// authorized_payments -> payments chain (documented in AGENTS.md).
async function resolvePayerEmail(preapprovalId: string): Promise<string | null> {
  try {
    const page = await mpGet<{ results?: { payment?: { id?: string } }[] }>(
      `/authorized_payments/search?preapproval_id=${preapprovalId}`,
    );
    const first = (page?.results || [])[0];
    if (!first?.payment?.id) return null;
    const payment = await mpGet<MpPayment>(`/v1/payments/${first.payment.id}`);
    return payment?.payer?.email || null;
  } catch (err: any) {
    logger.error({ err, preapprovalId }, "[MP webhook] resolvePayerEmail error");
    return null;
  }
}

// Fallback when external_reference is missing: match the auth user by email.
async function lookUpUserIdByEmail(email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  try {
    let page = 1;
    const perPage = 200;
    for (let guard = 0; guard < 60; guard++) {
      const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      const users = data?.users || [];
      const found = users.find((u) => u.email && u.email.toLowerCase() === target);
      if (found) return found.id;
      if (users.length < perPage) return null;
      page += 1;
    }
  } catch (err: any) {
    logger.error({ err, email }, "[MP webhook] lookUpUserIdByEmail error");
  }
  return null;
}

// Single source of truth to create/refresh a Mercado Pago subscription and bind
// it to the user's profile. Idempotent: the upsert keys on
// (provider, provider_subscription_id), so double events never duplicate.
async function activateSubscription({
  preapproval,
  userId,
  email,
  providerSubscriptionId,
}: {
  preapproval: MpPreapproval;
  userId: string;
  email?: string;
  providerSubscriptionId: string;
}): Promise<void> {
  if (!isActivePreapproval(preapproval.status)) return;

  const now = new Date().toISOString();
  const currency = (preapproval.auto_recurring?.currency_id || "USD") as "EUR" | "USD" | "ARS";
  const periodEnd = preapproval.next_payment_date
    ? new Date(preapproval.next_payment_date).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: existingSub } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("provider", "mercadopago")
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        provider: "mercadopago",
        provider_subscription_id: providerSubscriptionId,
        status: "active",
        plan_currency: currency,
        current_period_start: now,
        current_period_end: periodEnd,
      },
      { onConflict: "provider, provider_subscription_id" },
    )
    .select("id")
    .single();

  if (!sub?.id) {
    logger.error({ userId, providerSubscriptionId }, "[MP webhook] activateSubscription upsert failed");
    return;
  }

  await supabaseAdmin.from("profiles").upsert(
    {
      id: userId,
      ...(email ? { email } : {}), // never overwrite with null (NOT NULL)
      role: "subscriber",
      subscription_id: sub.id,
      updated_at: now,
    } as Database["public"]["Tables"]["profiles"]["Insert"],
    { onConflict: "id" },
  );

  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "canceled", updated_at: now })
    .eq("user_id", userId)
    .eq("provider", "migrated");

  // Only notify on the first activation; MP can resend events (retries up to 96h).
  if (existingSub?.id) return;

  if (email) {
    syncPaidSubscriber(email).catch((err) =>
      logger.error({ err, email }, "Sender sync error (mercadopago)"),
    );
    sendWelcomeEmail(email, false).catch((err) =>
      logger.error({ err, email }, "Welcome email error (mercadopago)"),
    );
  }
}

async function handlePreApprovalEvent(preapprovalId: string): Promise<void> {
  const preapproval = await mpGet<MpPreapproval>(`/preapproval/${preapprovalId}`);
  if (!preapproval) return;
  if (!isActivePreapproval(preapproval.status)) return;

  let userId = preapproval.external_reference || null;
  let email = preapproval.payer_email || null;
  if (!userId) {
    if (!email) email = await resolvePayerEmail(preapprovalId);
    userId = await lookUpUserIdByEmail(email || "");
  }
  if (!userId) {
    logger.warn({ preapprovalId, email }, "[MP webhook] subscription without resolvable user — skipping");
    return;
  }

  await activateSubscription({
    preapproval,
    userId,
    email: email || undefined,
    providerSubscriptionId: preapprovalId,
  });
}

async function handleAuthorizedPaymentEvent(paymentId: string): Promise<void> {
  const payment = await mpGet<MpPayment>(`/v1/payments/${paymentId}`);
  if (!payment || payment.status !== "approved") return;

  const preapprovalId = payment.preapproval_id;
  if (!preapprovalId) return;

  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("provider_subscription_id", preapprovalId)
    .eq("provider", "mercadopago")
    .maybeSingle();

  // Renewal of an already-linked subscription: just extend the period.
  if (existing?.id) {
    await supabaseAdmin
      .from("subscriptions")
      .update({
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return;
  }

  // Self-heal: an approved charge with no linked subscription means the preapproval
  // event never activated access — create it from the preapproval itself.
  const preapproval = await mpGet<MpPreapproval>(`/preapproval/${preapprovalId}`);
  if (!preapproval) return;
  if (!isActivePreapproval(preapproval.status)) return;

  let userId = preapproval.external_reference || null;
  const email = payment.payer?.email || preapproval.payer_email || null;
  if (!userId) {
    userId = await lookUpUserIdByEmail(email || "");
  }
  if (!userId) {
    logger.warn({ preapprovalId, email }, "[MP webhook] approved payment without resolvable user — skipping");
    return;
  }

  await activateSubscription({
    preapproval,
    userId,
    email: email || undefined,
    providerSubscriptionId: preapprovalId,
  });
}

export const POST: APIRoute = async ({ request }) => {
  const webhookSecret = import.meta.env.MP_WEBHOOK_SECRET || "";
  if (isSignatureVerificationEnabled && !webhookSecret) {
    logger.error("[MP webhook] MP_WEBHOOK_SECRET not configured");
    return error("Webhook misconfigured", 500);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return error("Invalid body", 400);
  }

  if (!verifyMercadoPagoSignature(request, body)) {
    return error("Invalid signature", 401);
  }

  const { action, data, type } = body;
  const dataId = String(data?.id ?? "");

  try {
    if (type === "subscription_preapproval" && dataId) {
      await handlePreApprovalEvent(dataId);
    }

    if (type === "subscription_authorized_payment" && dataId) {
      // Handle both created and updated actions; the handler gates on
      // payment.status === "approved", so pending charges are a no-op
      // and only approved ones (first charge and renewals) take effect.
      await handleAuthorizedPaymentEvent(dataId);
    }

    return ok({ received: true });
  } catch (err: any) {
    logger.error({ err, action, type, dataId }, "mercadopago webhook error");
    return error("Internal server error", 500);
  }
};