import { supabaseAdmin } from "./supabase-admin";
import { getPaymentProvider } from "./payment-provider";
import { isAlreadyCanceledProviderError } from "./cancel-providers";
import { isActiveSubscription } from "./subscription-status";
import { logger } from "./logger";

// Dos checkouts abiertos en paralelo pueden terminar en dos cobros vivos. Al activar una
// suscripción nueva, si la usuaria ya tenía OTRA paga y vigente creada antes, la nueva se
// frena en el proveedor y se marca 'canceled': gana la primera. Idempotente: un reintento
// del mismo evento ve la fila ya cancelada y el proveedor responde "ya cancelada".
// Devuelve true si la nueva quedó bloqueada (el caller no debe dar acceso ni enviar bienvenida).
// El cobro ya hecho NO se reembolsa solo: queda en el log (error) para que lo decida la admin.
export async function blockIfDuplicateCheckout(sub: {
  id: string;
  userId: string;
  provider: "stripe" | "mercadopago";
  providerSubscriptionId: string;
}): Promise<boolean> {
  const { data: mine } = await supabaseAdmin
    .from("subscriptions")
    .select("status, created_at")
    .eq("id", sub.id)
    .maybeSingle();
  // Una fila ya cancelada por un bloqueo previo también cuenta: un reintento del evento no debe
  // volver a apuntar el perfil a la duplicada.
  if (!mine || (mine.status !== "active" && mine.status !== "canceled")) return false;

  const { data: others, error } = await supabaseAdmin
    .from("subscriptions")
    .select("id, status, current_period_end, created_at")
    .eq("user_id", sub.userId)
    .in("provider", ["stripe", "mercadopago"])
    .eq("status", "active")
    .neq("id", sub.id);
  if (error) throw new Error(`duplicate checkout lookup failed: ${error.message}`);

  const earlier = (others ?? []).find(
    (o) => isActiveSubscription(o.status, o.current_period_end) && o.created_at < mine.created_at,
  );
  if (!earlier) return false;

  if (mine.status === "active") {
    try {
      await getPaymentProvider(sub.provider).cancelSubscription(sub.providerSubscriptionId);
    } catch (err: any) {
      // Un error real corta: el webhook responde 500 y el proveedor reintenta.
      if (!isAlreadyCanceledProviderError(err?.message || String(err))) throw err;
    }

    const { error: updateError } = await supabaseAdmin
      .from("subscriptions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("id", sub.id);
    if (updateError) throw new Error(`duplicate checkout cancel failed: ${updateError.message}`);

    logger.error(
      { userId: sub.userId, blocked: sub.providerSubscriptionId, kept: earlier.id },
      "duplicate checkout blocked — user was charged twice, review refund",
    );
  }
  return true;
}
