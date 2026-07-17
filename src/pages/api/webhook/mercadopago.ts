import type { APIRoute } from "astro";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { ok, error } from "../../../lib/response";
import { logger } from "../../../lib/logger";

const isSignatureVerificationEnabled = import.meta.env.VERIFY_MP_SIGNATURES !== "false";

function buildManifest(dataId: string, userId: string, xRequestId: string, ts: string): string {
  return `${dataId},${userId},${xRequestId},${ts}`;
}

function verifyMercadoPagoSignature(request: Request, body: any): boolean {
  if (!isSignatureVerificationEnabled) return true;

  const webhookSecret = import.meta.env.MP_WEBHOOK_SECRET || "";
  if (!webhookSecret) {
    logger.error("[MP webhook] MP_WEBHOOK_SECRET not configured — rejecting");
    return false;
  }

  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");
  if (!xSignature || !xRequestId) {
    logger.error("[MP webhook] Missing x-signature or x-request-id headers");
    return false;
  }

  const entries = xSignature.split(",").map((p) => {
    const i = p.indexOf("=");
    return i < 0 ? [p.trim(), ""] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
  });
  const parsed = Object.fromEntries(entries);
  const ts = parsed.ts;
  const v1 = parsed.v1;
  if (!ts || !v1) {
    logger.error("[MP webhook] Malformed x-signature header");
    return false;
  }

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
    logger.error(`[MP webhook] Timestamp out of window (ts=${ts})`);
    return false;
  }

  const dataId = body?.data?.id;
  const userId = body?.user_id;
  if (!dataId || !userId) {
    logger.error("[MP webhook] Missing data.id or user_id in body");
    return false;
  }

  const manifest = buildManifest(String(dataId), String(userId), xRequestId, ts);
  const expected = createHmac("sha256", webhookSecret).update(manifest).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length) {
    logger.error(`[MP webhook] HMAC length mismatch. dataId=${dataId}`);
    return false;
  }
  if (!timingSafeEqual(a, b)) {
    logger.error(`[MP webhook] HMAC mismatch. dataId=${dataId}`);
    return false;
  }

  return true;
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
    await supabase.from("profiles").update({
      role: "subscriber",
      subscription_id: subs.id,
      updated_at: now,
    }).eq("id", userId);
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
