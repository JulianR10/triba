export function shouldRetainMailClubAddress(subscriptions, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  return subscriptions.some((subscription) => {
    if (subscription.status === "past_due") return true;
    if (subscription.status !== "active" || !subscription.current_period_end) return false;
    const periodEnd = Date.parse(subscription.current_period_end);
    return Number.isFinite(periodEnd) && periodEnd > nowMs;
  });
}
