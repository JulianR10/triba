import { isActiveSubscription } from "../lib/subscription-status";

interface SubscriptionStatusResult {
  subscription: {
    status?: string | null;
    current_period_end?: string | null;
  } | null;
}

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 20;

// Polls /api/subscription-status until the subscription activates (webhook may
// land seconds after Mercado Pago returns to back_url), then reloads so the
// SSR-rendered panel reflects the new access.
export function startCheckoutPoll(
  getAccessToken: () => Promise<string | undefined>,
  onTimeout?: () => void,
): void {
  let attempts = 0;

  const timer = window.setInterval(async () => {
    attempts += 1;
    if (attempts > MAX_ATTEMPTS) {
      window.clearInterval(timer);
      if (onTimeout) onTimeout();
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) return;

      const res = await fetch("/api/subscription-status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as SubscriptionStatusResult;

      if (
    isActiveSubscription(
      data.subscription?.status,
      data.subscription?.current_period_end ?? undefined,
    )
  ) {
    window.clearInterval(timer);
    window.location.reload();
  }
    } catch {
      // transient failure — retry on the next tick
    }
  }, POLL_INTERVAL_MS);
}