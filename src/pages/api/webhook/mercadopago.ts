import type { APIRoute } from "astro";
import { WebhookSignatureValidator } from "mercadopago";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { ok, error } from "../../../lib/response";
import { logger } from "../../../lib/logger";
import { syncPaidSubscriber } from "../../../lib/sender";
import { sendWelcomeEmail } from "../../../lib/email";

const isSignatureVerificationEnabled = import.meta.env.VERIFY_MP_SIGNATURES !== "false";

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

async function handlePreApprovalEvent(
  supabase: typeof supabaseAdmin,
  preapprovalId: string,
): Promise<void> {
  const response = await fetch(
    `https://api.mercadopago.com/preapproval/${preapprovalId}`,
    { headers: { Authorization: `Bearer ${import.meta.env.MP_ACCESS_TOKEN}` } },
  );
  if (!response.ok) return;

  const preapproval = await response.json();
  const status = preapproval.status;
  if (status !== "authorized" && status !== "active") return;

  const userId = preapproval.external_reference;
  if (!userId) return;

  const currency = preapproval.auto_recurring?.currency_id || "USD";
  const now = new Date().toISOString();

  const { data: subs } = await supabase.from("subscriptions").upsert({
    user_id: userId,
    provider: "mercadopago",
    provider_subscription_id: preapprovalId,
    status: "active",
    plan_currency: currency,
    current_period_start: now,
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }, { onConflict: "provider, provider_subscription_id" }).select("id").single();

  if (subs?.id) {
    await supabase.from("profiles").upsert({
      id: userId,
      email: preapproval.payer_email || null,
      role: "subscriber",
      subscription_id: subs.id,
      updated_at: now,
    }, { onConflict: "id" });
  }

  const email = preapproval.payer_email;
  if (email) {
    syncPaidSubscriber(email).catch((err) =>
      logger.error({ err, email }, "Sender sync error (mercadopago)"),
    );
    sendWelcomeEmail(email, false).catch((err) =>
      logger.error({ err, email }, "Welcome email error (mercadopago)"),
    );
  }
}

async function handleAuthorizedPaymentEvent(
  supabase: typeof supabaseAdmin,
  paymentId: string,
): Promise<void> {
  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    { headers: { Authorization: `Bearer ${import.meta.env.MP_ACCESS_TOKEN}` } },
  );
  if (!response.ok) return;

  const payment = await response.json();
  if (payment.status !== "approved") return;

  const preapprovalId = payment.preapproval_id;
  if (!preapprovalId) return;

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("provider_subscription_id", preapprovalId)
    .eq("provider", "mercadopago")
    .maybeSingle();

  if (!existing) return;
  if (!existing?.id) return;

  await supabase.from("subscriptions").update({
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: "active",
    updated_at: new Date().toISOString(),
  }).eq("id", existing.id);
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

  try {
    if (type === "subscription_preapproval") {
      await handlePreApprovalEvent(supabaseAdmin, data.id);
    }

    if (type === "subscription_authorized_payment" && action === "created") {
      await handleAuthorizedPaymentEvent(supabaseAdmin, data.id);
    }

    return ok({ received: true });
  } catch (err: any) {
    logger.error({ err, action, type, dataId: data?.id }, "mercadopago webhook error");
    return error("Internal server error", 500);
  }
};
