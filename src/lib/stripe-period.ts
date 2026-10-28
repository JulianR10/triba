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
