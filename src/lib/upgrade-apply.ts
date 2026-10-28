import { supabaseAdmin } from "./supabase-admin";
import { logger } from "./logger";
import { syncPaidSubscriber } from "./sender";
import { sendMailClubActivation } from "./mail-club-activation";
import { MAIL_CLUB_PRICE_CENTS } from "./mail-club";
import { MAIL_CLUB_STRIPE_PRICE_IDS } from "./stripe";

// Aplica un upgrade con pago confirmado: cambia la tarifa recurrente sin
// prorrateo, pasa la suscripción a mail_club y activa fundadora + bienvenida.
// Idempotente: si ya quedó en recurrence_updated no repite nada. Los fallos
// intermedios dejan la fila en 'failed' para reintento admin sin volver a
// cobrar (el pago único ya está hecho).
export async function applyUpgrade(upgradeId: string): Promise<{ applied: boolean }> {
  const { data: row } = await supabaseAdmin
    .from("mail_club_upgrades")
    .select("*")
    .eq("id", upgradeId)
    .maybeSingle();
  if (!row) throw new Error("Upgrade not found");
  const status = (row as any).status as string;
  if (status === "recurrence_updated") return { applied: false };
  if (status !== "payment_confirmed" && status !== "failed") {
    throw new Error(`Upgrade not payable (status ${status})`);
  }

  const userId = (row as any).user_id as string;
  const provider = (row as any).provider as "stripe" | "mercadopago";
  const currency = (row as any).plan_currency as "EUR" | "USD" | "ARS";

  const markFailed = async (message: string) => {
    await supabaseAdmin
      .from("mail_club_upgrades")
      .update({ status: "failed", error: message.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", upgradeId);
  };

  try {
    // Acepta también una fila ya pasada a mail_club: un reintento tras un fallo parcial
    // (el plan se aplicó pero el upgrade quedó sin cerrar) debe poder completarse. La
    // actualización del proveedor es idempotente. limit(1): dos filas activas no deben romper.
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id, provider_subscription_id")
      .eq("user_id", userId)
      .eq("provider", provider)
      .in("plan_type", ["digital", "mail_club"])
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub) throw new Error("No active digital subscription to upgrade");

    if (provider === "stripe") {
      const { stripe } = await import("./stripe");
      if (!stripe) throw new Error("Stripe not configured");
      const priceId = MAIL_CLUB_STRIPE_PRICE_IDS[currency as "EUR" | "USD"];
      if (!priceId) throw new Error(`No Mail Club price ID for ${currency}`);
      const current = await stripe.subscriptions.retrieve((sub as any).provider_subscription_id);
      const itemId = current.items.data[0]?.id;
      if (!itemId) throw new Error("Stripe subscription without items");
      await stripe.subscriptions.update((sub as any).provider_subscription_id, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "none",
      });
    } else {
      const { mpClient } = await import("./mercadopago");
      if (!mpClient) throw new Error("Mercado Pago not configured");
      const { PreApproval } = await import("mercadopago");
      const preApproval = new PreApproval(mpClient);
      await preApproval.update({
        id: (sub as any).provider_subscription_id,
        body: {
          auto_recurring: {
            transaction_amount: MAIL_CLUB_PRICE_CENTS.ARS,
            currency_id: "ARS",
          },
        },
      });
    }

    // Primero el plan (lo que la clienta ve y lo que habilita el lote), con el error chequeado:
    // si falla, el upgrade queda 'failed' y se puede reintentar sin cobrar de nuevo.
    const { error: planError } = await supabaseAdmin
      .from("subscriptions")
      .update({ plan_type: "mail_club", updated_at: new Date().toISOString() })
      .eq("id", (sub as any).id);
    if (planError) throw new Error(`plan_type update failed: ${planError.message}`);

    // El plan ya está aplicado: si este registro falla no se revierte nada, solo queda en el log.
    const { error: markError } = await supabaseAdmin
      .from("mail_club_upgrades")
      .update({ status: "recurrence_updated", error: null, updated_at: new Date().toISOString() })
      .eq("id", upgradeId);
    if (markError) logger.error({ err: markError, upgradeId, userId }, "upgrade applied but status update failed");

    // Los avisos son posteriores al cambio: su fallo no debe marcar como fallido un upgrade que salió bien.
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .maybeSingle();
      const email = (profile as any)?.email as string | undefined;
      if (email) {
        syncPaidSubscriber(email).catch((err) =>
          logger.error({ err, userId, upgradeId }, "Sender sync error (upgrade)"),
        );
        await sendMailClubActivation(userId, email);
      }
    } catch (err) {
      logger.error({ err, userId, upgradeId }, "upgrade applied but welcome failed");
    }
    return { applied: true };
  } catch (err: any) {
    logger.error({ err, upgradeId, userId }, "applyUpgrade error");
    await markFailed(err.message || "apply error");
    throw err;
  }
}
