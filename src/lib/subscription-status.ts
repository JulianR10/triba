export function isActiveSubscription(status?: string | null): boolean {
  return status === "active" || status === "migrated";
}