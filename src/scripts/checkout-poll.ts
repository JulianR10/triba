import { isActiveSubscription } from "../lib/subscription-status";

interface SubscriptionStatusResult {
  subscription: {
    status?: string | null;
    current_period_end?: string | null;
  } | null;
}

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 20;
const NETWORK_ERROR_THRESHOLD = 3;

// Polls /api/subscription-status until the subscription activates (webhook may
// land seconds after Mercado Pago returns to back_url), then reloads so the
// SSR-rendered panel reflects the new access.
export function startCheckoutPoll(
  getAccessToken: () => Promise<string | undefined>,
  onTimeout?: () => void,
  onNetworkError?: () => void,
): void {
  let attempts = 0;
  let consecutiveFailures = 0;
  let networkErrorNotified = false;

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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SubscriptionStatusResult;

      // Successful fetch (even if not yet active) resets failure counter
      consecutiveFailures = 0;

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
      consecutiveFailures += 1;
      if (consecutiveFailures >= NETWORK_ERROR_THRESHOLD && !networkErrorNotified) {
        networkErrorNotified = true;
        if (onNetworkError) onNetworkError();
      }
      // transient failure — retry on the next tick
    }
  }, POLL_INTERVAL_MS);
}