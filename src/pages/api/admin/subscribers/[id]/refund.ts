import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../lib/auth";
import { ok, error } from "../../../../../lib/response";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { logAdminAction } from "../../../../../lib/admin/audit";
import { stripe } from "../../../../../lib/stripe";
import { mpClient } from "../../../../../lib/mercadopago";

export const prerender = false;

async function refundStripe(subscriptionId: string): Promise<{ warnings: string[] }> {
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

  await stripe.refunds.create(refundParam);
  await stripe.subscriptions.cancel(subscriptionId);
  return { warnings: [] };
}

async function refundMercadoPago(preapprovalId: string): Promise<{ warnings: string[] }> {
  if (!mpClient) throw new Error("Mercado Pago no está configurado");

  const mpAccessToken = import.meta.env.MP_ACCESS_TOKEN || "";
  if (!mpAccessToken) throw new Error("Falta MP_ACCESS_TOKEN en las variables de entorno");

  const searchRes = await fetch(
    `https://api.mercadopago.com/v1/payments/search?preapproval_id=${preapprovalId}&sort=date_created&criteria=desc`,
    { headers: { Authorization: `Bearer ${mpAccessToken}` } },
  );
  if (!searchRes.ok) throw new Error(`Error al buscar pagos en Mercado Pago: ${await searchRes.text()}`);

  const searchData = await searchRes.json();
  const approvedPayment = searchData.results?.find((p: any) => p.status === "approved");
  if (!approvedPayment) throw new Error("No se encontró ningún pago aprobado para esta suscripción");

  const refundRes = await fetch(
    `https://api.mercadopago.com/v1/payments/${approvedPayment.id}/refunds`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${mpAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  if (!refundRes.ok) throw new Error(`Error al procesar el reembolso en Mercado Pago: ${await refundRes.text()}`);

  const warnings: string[] = [];
  try {
    const { PreApproval } = await import("mercadopago");
    const preApproval = new PreApproval(mpClient);
    await preApproval.update({ id: preapprovalId, body: { status: "cancelled" } });
  } catch (cancelErr: any) {
    warnings.push(`Reembolso OK, pero no se pudo cancelar la renovación: ${cancelErr.message || cancelErr}`);
  }

  return { warnings };
}

export const POST: APIRoute = async ({ params, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

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
    if (sub.provider === "stripe") {
      try {
        const result = await refundStripe(sub.provider_subscription_id);
        warnings.push(...result.warnings);
      } catch (err: any) {
        return error(`Error en Stripe: ${err.message || err}`, 500);
      }
    } else if (sub.provider === "mercadopago") {
      try {
        const result = await refundMercadoPago(sub.provider_subscription_id);
        warnings.push(...result.warnings);
      } catch (err: any) {
        return error(`Error en Mercado Pago: ${err.message || err}`, 500);
      }
    } else if (sub.provider === "migrated") {
      // Legacy migration, no active payment provider charge
    } else {
      return error(`Proveedor '${sub.provider}' no soportado para reembolsos automáticos`, 400);
    }

    const { error: rpcErr } = await supabaseAdmin.rpc("cancel_subscription", { p_user_id: profile.id });
    if (rpcErr) return error(`Reembolso procesado, pero falló la actualización en la BD local: ${rpcErr.message}`, 500);

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
