import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../lib/auth";
import { ok, error } from "../../../../../lib/response";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { logAdminAction } from "../../../../../lib/admin/audit";
import { stripe } from "../../../../../lib/stripe";
import { mpClient } from "../../../../../lib/mercadopago";
import { PreApproval } from "mercadopago";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { isAlreadyCanceledProviderError } from "../../../../../lib/cancel-providers";
import { logger } from "../../../../../lib/logger";

export const prerender = false;

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || "";

interface RefundPreview {
  amountLabel: string;
  dateLabel: string;
}

const formatMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
};
const formatDay = (d: Date) => d.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });

// Busca el cobro que se reembolsaría (el de la última factura) sin tocar nada.
async function findStripeRefundTarget(subscriptionId: string) {
  if (!stripe) throw new Error("Stripe no está configurado");

  const invoices = await stripe.invoices.list({ subscription: subscriptionId, limit: 1 });
  if (invoices.data.length === 0) throw new Error("No se encontraron facturas para esta suscripción");

  const latestInvoice = invoices.data[0];
  const payments = await stripe.invoicePayments.list({ invoice: latestInvoice.id, limit: 1 });
  if (payments.data.length === 0) throw new Error("No se encontraron pagos asociados a la última factura");

  const paymentInfo = payments.data[0].payment;
  if (!paymentInfo) throw new Error("No hay información de pago en la factura");

  let refundParam: { charge?: string; payment_intent?: string } = {};
  if (paymentInfo.type === "payment_intent" && paymentInfo.payment_intent) {
    const piId = typeof paymentInfo.payment_intent === "string"
      ? paymentInfo.payment_intent
      : paymentInfo.payment_intent.id;
    refundParam = { payment_intent: piId };
  } else if (paymentInfo.type === "charge" && paymentInfo.charge) {
    const chargeId = typeof paymentInfo.charge === "string"
      ? paymentInfo.charge
      : paymentInfo.charge.id;
    refundParam = { charge: chargeId };
  } else {
    throw new Error(`El tipo de pago '${paymentInfo.type}' no es compatible con reembolsos directos`);
  }

  const preview: RefundPreview = {
    amountLabel: formatMoney((latestInvoice.amount_paid ?? 0) / 100, latestInvoice.currency || "usd"),
    dateLabel: formatDay(new Date((latestInvoice.created ?? 0) * 1000)),
  };
  return { refundParam, preview };
}

async function previewStripeRefund(subscriptionId: string): Promise<RefundPreview> {
  return (await findStripeRefundTarget(subscriptionId)).preview;
}

async function refundStripe(subscriptionId: string): Promise<{ warnings: string[] }> {
  if (!stripe) throw new Error("Stripe no está configurado");

  const { refundParam } = await findStripeRefundTarget(subscriptionId);
  await stripe.refunds.create(refundParam);

  // El dinero ya se devolvió: un fallo al frenar la recurrencia no puede tirar abajo
  // el reembolso. Se avisa con claridad para frenarla a mano y se sigue con la baja local.
  const warnings: string[] = [];
  try {
    await stripe.subscriptions.cancel(subscriptionId);
  } catch (cancelErr: any) {
    if (!isAlreadyCanceledProviderError(cancelErr?.message || "")) {
      warnings.push(`Reembolso OK, pero no se pudo cancelar la renovación en Stripe: ${cancelErr?.message || cancelErr}. Cancelala a mano en Stripe para que no cobre de nuevo.`);
    }
  }
  return { warnings };
}

// Un reembolso previo (reintento tras un fallo parcial) no debe bloquear la baja local.
const isAlreadyRefundedError = (message: string) => /already.{0,20}refunded|has already been refunded/i.test(message);

async function findMpApprovedPaymentId(preapprovalId: string): Promise<string | number> {
  if (!mpClient) throw new Error("Mercado Pago no está configurado");
  if (!MP_ACCESS_TOKEN) throw new Error("Falta MP_ACCESS_TOKEN en las variables de entorno");

  // The MP payments/search API rejects `preapproval_id` as a filter. Use the
  // subscription's authorized payments instead, which expose the real payment id.
  const searchRes = await fetch(
    `https://api.mercadopago.com/authorized_payments/search?preapproval_id=${preapprovalId}`,
    { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } },
  );
  if (!searchRes.ok) throw new Error(`Error al buscar pagos en Mercado Pago: ${await searchRes.text()}`);

  const searchData = await searchRes.json();
  const authorizedPayment = (searchData.results || []).find(
    (ap: any) => ap.payment && ap.payment.status === "approved",
  );
  const approvedPaymentId = authorizedPayment?.payment?.id;
  if (!approvedPaymentId) throw new Error("No se encontró ningún pago aprobado para esta suscripción");
  return approvedPaymentId;
}

async function previewMpRefund(preapprovalId: string): Promise<RefundPreview> {
  const paymentId = await findMpApprovedPaymentId(preapprovalId);
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Error al consultar el pago en Mercado Pago: ${await res.text()}`);
  const payment = await res.json();
  const when = new Date(payment.date_approved || payment.date_created || Date.now());
  return {
    amountLabel: formatMoney(Number(payment.transaction_amount ?? 0), payment.currency_id || "ARS"),
    dateLabel: formatDay(when),
  };
}

async function refundMercadoPago(preapprovalId: string): Promise<{ warnings: string[] }> {
  if (!mpClient) throw new Error("Mercado Pago no está configurado");
  const approvedPaymentId = await findMpApprovedPaymentId(preapprovalId);

  const refundRes = await fetch(
    `https://api.mercadopago.com/v1/payments/${approvedPaymentId}/refunds`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  if (!refundRes.ok) throw new Error(`Error al procesar el reembolso en Mercado Pago: ${await refundRes.text()}`);

  const warnings: string[] = [];

  // Cancelar la preapproval usando import estático (no dinámico)
  try {
    const preApproval = new PreApproval(mpClient);
    await preApproval.update({ id: preapprovalId, body: { status: "cancelled" } });
  } catch (cancelErr: any) {
    warnings.push(`Reembolso OK, pero no se pudo cancelar la renovación en MP: ${cancelErr.message || cancelErr}`);
  }

  return { warnings };
}

// Consulta de solo lectura: qué cobro se reembolsaría, para mostrarlo en la confirmación.
export const GET: APIRoute = async ({ params, locals, request }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  const limited = await enforceRateLimit(request, "admin-subscribers", { maxRequests: 60, windowMs: 60_000 });
  if (limited) return limited;

  const id = params.id;
  if (!id) return error("ID inválido", 400);

  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, subscription_id")
      .eq("id", id)
      .maybeSingle();

    if (profile?.subscription_id) {
      const { data: sub } = await supabaseAdmin
        .from("subscriptions")
        .select("provider, provider_subscription_id")
        .eq("id", profile.subscription_id)
        .maybeSingle();
      if (!sub) return error("Suscripción no encontrada en la base de datos", 404);
      if (sub.provider === "stripe") return ok(await previewStripeRefund(sub.provider_subscription_id));
      if (sub.provider === "mercadopago") return ok(await previewMpRefund(sub.provider_subscription_id));
      return error("Esta suscripción no tiene un cobro reembolsable (sin pasarela de pago).", 409);
    }

    const { data: migration } = await supabaseAdmin
      .from("subscriber_migrations")
      .select("stripe_subscription_id")
      .eq("id", id)
      .maybeSingle();
    if (!migration?.stripe_subscription_id) return error("No se encontró un cobro para reembolsar.", 404);
    return ok(await previewStripeRefund(migration.stripe_subscription_id));
  } catch (err: any) {
    logger.error({ err, targetId: id }, "admin refund preview error");
    return error(`No se pudo consultar el cobro a reembolsar: ${err?.message || err}`, 502);
  }
};

export const POST: APIRoute = async ({ params, locals, request }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  const limited = await enforceRateLimit(request, "admin-subscribers", {
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const id = params.id;
  if (!id) return error("ID inválido", 400);

  // Try profile first
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, subscription_id")
    .eq("id", id)
    .single();

  if (profile?.subscription_id) {
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("id", profile.subscription_id)
      .single();

    if (subErr || !sub) return error("Suscripción no encontrada en la base de datos", 404);

    const warnings: string[] = [];
    // Proveedor primero: si el reembolso falla NO se toca nada en Triba. Antes se seguía igual,
    // se cortaba el acceso y el panel decía "reembolso procesado" sin que se hubiera devuelto el dinero.
    if (sub.provider === "stripe") {
      try {
        const result = await refundStripe(sub.provider_subscription_id);
        warnings.push(...result.warnings);
      } catch (err: any) {
        const message = err?.message || String(err);
        if (!isAlreadyRefundedError(message)) {
          logger.error({ err, targetUserId: profile.id }, "admin refund stripe error");
          return error(`No se pudo reembolsar en Stripe: ${message}. No se canceló ni se cambió nada en Triba.`, 502);
        }
        warnings.push("Stripe indica que ese cobro ya estaba reembolsado; se completó la baja en Triba.");
      }
    } else if (sub.provider === "mercadopago") {
      try {
        const result = await refundMercadoPago(sub.provider_subscription_id);
        warnings.push(...result.warnings);
      } catch (err: any) {
        const message = err?.message || String(err);
        if (!isAlreadyRefundedError(message)) {
          logger.error({ err, targetUserId: profile.id }, "admin refund mercadopago error");
          return error(`No se pudo reembolsar en Mercado Pago: ${message}. No se canceló ni se cambió nada en Triba.`, 502);
        }
        warnings.push("Mercado Pago indica que ese cobro ya estaba reembolsado; se completó la baja en Triba.");
      }
    } else if (sub.provider === "migrated") {
      // Legacy migration, no active payment provider charge
    } else {
      return error(`Proveedor '${sub.provider}' no soportado para reembolsos automáticos`, 400);
    }

    const { error: rpcErr } = await supabaseAdmin.rpc("cancel_subscription", { p_user_id: profile.id });
    if (rpcErr) return error(`Reembolso procesado, pero falló la actualización en la BD local: ${rpcErr.message}`, 500);

    // Reembolso = revocación inmediata (se devolvió el dinero): a diferencia
    // de la cancelación diferida, acá el acceso se corta en el acto.
    const now = new Date().toISOString();
    // Todas las filas con cobro vigente (no solo 'active'): una past_due/incomplete reembolsada
    // quedaba viva mientras el perfil pasaba a 'free'.
    const { error: cutError } = await supabaseAdmin
      .from("subscriptions")
      .update({ status: "canceled", cancel_at_period_end: false, updated_at: now })
      .eq("user_id", profile.id)
      .in("status", ["active", "trialing", "past_due", "incomplete"]);
    // .neq("role","admin"): reembolsar a una admin no le quita el rol.
    const { error: roleError } = await supabaseAdmin
      .from("profiles")
      .update({ role: "free", subscription_id: null, updated_at: now })
      .eq("id", profile.id)
      .neq("role", "admin");
    if (cutError || roleError) {
      logger.error({ cutError, roleError, targetUserId: profile.id }, "admin refund local update error");
      return error("El reembolso se procesó en el proveedor, pero no se pudo cortar el acceso en Triba. Reintentá: el reintento completa la baja sin reembolsar de nuevo.", 500);
    }

    await logAdminAction(admin.user.id, admin.profile.email, "subscriber.refunded", "subscriber", profile.id, {
      refunded_email: profile.email,
      provider: sub.provider,
      provider_subscription_id: sub.provider_subscription_id,
    });

    return ok({ message: "Reembolso procesado correctamente y suscripción cancelada", warnings: warnings.length > 0 ? warnings : undefined });
  }

  // Try migration (migrated user without account)
  const { data: migration } = await supabaseAdmin
    .from("subscriber_migrations")
    .select("id, email, stripe_subscription_id, old_subscription_data")
    .eq("id", id)
    .single();

  if (!migration?.stripe_subscription_id) {
    return error("No se encontró suscripción activa para reembolsar", 404);
  }

  const warnings: string[] = [];
  try {
    const result = await refundStripe(migration.stripe_subscription_id);
    warnings.push(...result.warnings);
  } catch (err: any) {
    return error(`Error en Stripe: ${err.message || err}`, 500);
  }

  const existingData = (migration.old_subscription_data as Record<string, any>) || {};
  await supabaseAdmin
    .from("subscriber_migrations")
    .update({
      stripe_subscription_id: null,
      stripe_customer_id: null,
      old_subscription_data: { ...existingData, refunded_at: new Date().toISOString() },
    })
    .eq("id", id);

  await logAdminAction(admin.user.id, admin.profile.email, "subscriber.refunded", "subscriber", id, {
    refunded_email: migration.email,
    provider: "stripe",
    provider_subscription_id: migration.stripe_subscription_id,
  });

  return ok({ message: "Reembolso procesado correctamente y suscripción cancelada", warnings: warnings.length > 0 ? warnings : undefined });
};
