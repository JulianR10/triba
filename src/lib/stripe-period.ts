import type Stripe from "stripe";

export function periodRange(sub: Stripe.Subscription) {
  // This Stripe account (API 2026-06-24.dahlia) exposes the period per item, not on the
  // subscription object; the +30d fallback is stale after the first renewal.
  const item = sub.items?.data?.[0] as { current_period_start?: number; current_period_end?: number } | undefined;
  const startSec =
    item?.current_period_start ?? (sub as any).current_period_start ?? (sub as any).start_date ?? sub.created;
  const endSec =
    item?.current_period_end ??
    (sub as any).current_period_end ??
    (startSec ? startSec + 30 * 24 * 60 * 60 : undefined);
  return {
    start: startSec ? new Date(startSec * 1000).toISOString() : undefined,
    end: endSec ? new Date(endSec * 1000).toISOString() : undefined,
  };
}

export type LocalSubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "trialing"
  | "incomplete"
  | "migrated";

// Mapeo explícito Stripe -> estado local. Los estados que no tienen
// equivalente se devuelven como "unknown" y el caller los omite con un
// warn (200, sin reintento): escribir el string crudo rompía el check y
// generaba tormentas de retry.
export function mapStripeSubscriptionStatus(status: string): LocalSubscriptionStatus | "unknown" {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "incomplete":
      return "incomplete";
    case "canceled":
      return "canceled";
    case "unpaid":
      // Stripe agotó los reintentos: ya no hay dunning y no da acceso (past_due sí lo da).
      return "canceled";
    case "incomplete_expired":
      // El pago inicial nunca se completó: la sub no da acceso.
      return "canceled";
    default:
      return "unknown";
  }
}
