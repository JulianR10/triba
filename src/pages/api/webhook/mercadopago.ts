import type { APIRoute } from "astro";
import { WebhookSignatureValidator } from "mercadopago";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { ok, error } from "../../../lib/response";
import { logger } from "../../../lib/logger";
import { applyUpgrade } from "../../../lib/upgrade-apply";
import {
  activateSubscription,
  mpGet,
  resolveAuthorizedPayment,
  type MpPreapproval,
} from "../../../lib/mercadopago-activation";
import { isActivePreapproval } from "../../../lib/mercadopago-status";

const isSignatureVerificationEnabled = import.meta.env.VERIFY_MP_SIGNATURES !== "false";

interface MpPayment {
  id?: string;
  status?: string;
  preapproval_id?: string;
  currency_id?: string;
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

async function handlePreApprovalEvent(preapprovalId: string): Promise<void> {
  const preapproval = await mpGet<MpPreapproval>(`/preapproval/${preapprovalId}`);
  if (!preapproval) return;

  // Cancelación/pausa/expiración (desde el dashboard MP o por nuestro cancel):
  // se frena la recurrencia y se conserva el acceso hasta el fin del período
  // ya pagado (mismo criterio que Stripe cancel_at_period_end). No se degrada
  // el rol acá: el gate corta por fecha y evita revocar acceso vigente.
  if (
    preapproval.status === "cancelled" ||
    preapproval.status === "expired" ||
    preapproval.status === "paused"
  ) {
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("provider", "mercadopago")
      .eq("provider_subscription_id", preapprovalId)
      .maybeSingle();
    if ((sub as any)?.id) {
      await supabaseAdmin
        .from("subscriptions")
        .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
        .eq("id", (sub as any).id);
      logger.info(
        { preapprovalId, status: preapproval.status },
        "[MP webhook] preapproval inactive — recurrence stopped, access kept until period end",
      );
    }
    return;
  }

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
    confirmedPayment: false,
  });
}

async function handleAuthorizedPaymentEvent(dataId: string): Promise<void> {
  // dataId puede ser un pago o un authorized_payment, y el pago puede no
  // traer preapproval_id: el resolvedor cubre todos los casos.
  const link = await resolveAuthorizedPayment(dataId);
  if (!link) {
    logger.info(
      { dataId },
      "[MP webhook] authorized payment not resolvable to an approved charge — no-op",
    );
    return;
  }
  const { preapprovalId, paymentId } = link;

  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("id, status")
    .eq("provider_subscription_id", preapprovalId)
    .eq("provider", "mercadopago")
    .maybeSingle();

  // Renewal of an already-ACTIVE subscription: just extend the period.
  // An 'incomplete' Mail Club row means the first payment just got approved,
  // so it falls through to full activation (founder + welcome included).
  const existingId = (existing as any)?.id as string | undefined;
  if (existingId && (existing as any)?.status === "active") {
    const { data: schedRow } = await supabaseAdmin
      .from("subscriptions")
      .select("scheduled_plan_type, current_period_end")
      .eq("id", existingId)
      .maybeSingle();
    const downgradeDue = (schedRow as any)?.scheduled_plan_type === "digital";
    const currentEnd = (schedRow as any)?.current_period_end as string | null;
    // Webhook repetido: si el período ya fue extendido hace instantes
    // (> ~28 días por delante) no se vuelve a extender. En la renovación
    // real el vencimiento está cerca o vencido, así que la guarda no aplica.
    const alreadyExtended =
      !!currentEnd && new Date(currentEnd).getTime() > Date.now() + 28 * 24 * 60 * 60 * 1000;
    if (alreadyExtended && !downgradeDue) return;

    // Extender desde el vencimiento vigente (no desde "ahora"): evita el
    // corrimiento acumulativo si el webhook llega tarde.
    const base =
      currentEnd && new Date(currentEnd).getTime() > Date.now()
        ? new Date(currentEnd)
        : new Date();
    await supabaseAdmin
      .from("subscriptions")
      .update({
        current_period_end: new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: "active",
        // El nuevo cobro ya vino con el importe digital: se completa acá.
        ...(downgradeDue
          ? { plan_type: "digital", scheduled_plan_type: null, scheduled_plan_at: null }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingId);
    return;
  }

  // Self-heal: an approved charge with no linked subscription means the preapproval
  // event never activated access — create it from the preapproval itself.
  const preapproval = await mpGet<MpPreapproval>(`/preapproval/${preapprovalId}`);
  if (!preapproval) {
    logger.error({ preapprovalId, paymentId }, "[MP webhook] approved payment with unfetchable preapproval — needs reconcile");
    return;
  }
  // NOTE: no gatear por isActivePreapproval(preapproval.status) acá. MP es
  // eventualmente consistente: cuando llega el primer pago aprobado la
  // preaprobación puede reportar "pending". Un pago APPROVED es fuente de
  // verdad, así que se activa igual (activateSubscription saltea el gate
  // cuando confirmedPayment=true). El gate de estado queda SOLO en
  // handlePreApprovalEvent (dispara antes de la autorización del pago).
  // See AGENTS.md: webhook must activate from subscription_authorized_payment approved.

  let userId = preapproval.external_reference || link.userId;
  const email = link.payerEmail || preapproval.payer_email || null;
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
    confirmedPayment: true,
  });
}

// Upgrade digital -> Mail Club (MP): pago único de ARS 9.000 cobrado por
// Checkout Pro. Al aprobarse, actualiza el importe recurrente de la
// preaprobación de 7.000 a 16.000 ARS. Idempotente por upgrade_id.
async function handleUpgradePaymentEvent(paymentId: string): Promise<void> {
  const payment = await mpGet<MpPayment & { external_reference?: string; transaction_amount?: number }>(
    `/v1/payments/${paymentId}`,
  );
  if (!payment) return;

  const ref = payment.external_reference || "";
  if (!ref.startsWith("mailclub-upgrade:")) return;
  const upgradeId = ref.slice("mailclub-upgrade:".length);
  if (!upgradeId) return;

  const { data: row } = await supabaseAdmin
    .from("mail_club_upgrades")
    .select("*")
    .eq("id", upgradeId)
    .maybeSingle();
  if (!row) return;

  const markFailed = async (message: string) => {
    await supabaseAdmin
      .from("mail_club_upgrades")
      .update({ status: "failed", error: message.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", upgradeId);
  };

  // Pago rechazado/cancelado del Checkout Pro: liberar el pending para que la
  // usuaria pueda reintentar. El cobro nunca se aplicó.
  if (payment.status === "rejected" || payment.status === "cancelled") {
    if ((row as any).status === "pending") {
      await markFailed(`Mercado Pago: pago ${payment.status}`);
    }
    return;
  }

  if (payment.status !== "approved") return;
  // 'failed' se reintenta (mismo criterio que Stripe): applyUpgrade acepta
  // failed→payment_confirmed sin volver a cobrar. recurrence_updated no repite.
  if ((row as any).status !== "pending" && (row as any).status !== "failed") return;

  try {
    const expected = (row as any).amount_cents as number;
    const got = Number((payment as any).transaction_amount);
    if (Number.isFinite(got) && got !== expected) {
      throw new Error(`Upgrade amount mismatch: got ${got}, expected ${expected}`);
    }
    if (payment.currency_id && payment.currency_id !== "ARS") {
      throw new Error(`Upgrade currency mismatch: got ${payment.currency_id}`);
    }

    await supabaseAdmin
      .from("mail_club_upgrades")
      .update({ status: "payment_confirmed", updated_at: new Date().toISOString() })
      .eq("id", upgradeId);
    await applyUpgrade(upgradeId);
  } catch (err: any) {
    logger.error({ err, upgradeId }, "mail club upgrade apply error (mercadopago)");
    await markFailed(err.message || "apply error");
  }
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

    if (type === "payment" && dataId) {
      // One-time Mail Club upgrade payments (Checkout Pro). Regular
      // subscription charges carry no upgrade external_reference and are
      // ignored here.
      await handleUpgradePaymentEvent(dataId);
    }

    return ok({ received: true });
  } catch (err: any) {
    logger.error({ err, action, type, dataId }, "mercadopago webhook error");
    return error("Internal server error", 500);
  }
};