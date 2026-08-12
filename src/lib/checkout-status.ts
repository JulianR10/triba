export type CheckoutOutcome = "success" | "canceled" | "pending" | "none";

const MP_SUCCESS_STATUS = new Set(["authorized", "active", "approved"]);
const MP_CANCELED_STATUS = new Set(["rejected", "cancelled", "canceled", "refunded"]);
const MP_PENDING_STATUS = new Set(["pending", "in_process"]);

// Mercado Pago redirects back to back_url overwriting the query string with its
// own params (preapproval_id / collection_id, status or collection_status,
// external_reference). Stripe preserves its success/cancel query instead.
function mercadopagoReturn(params: URLSearchParams): CheckoutOutcome | null {
  const isReturn = Boolean(params.get("preapproval_id") || params.get("collection_id"));
  if (!isReturn) return null;

  const status = (params.get("status") || params.get("collection_status") || "").toLowerCase();
  if (MP_SUCCESS_STATUS.has(status)) return "success";
  if (MP_CANCELED_STATUS.has(status)) return "canceled";
  if (MP_PENDING_STATUS.has(status)) return "pending";
  return null;
}

export function getCheckoutOutcome(params: URLSearchParams): CheckoutOutcome {
  const explicit = params.get("checkout");
  if (explicit === "success") return "success";
  if (explicit === "canceled") return "canceled";
  if (explicit === "pending") return "pending";
  return mercadopagoReturn(params) ?? "none";
}

// True when the browser just finished (or is still settling) a payment and the
// panel should keep watching the subscription until it becomes active.
export function isAwaitingActivation(outcome: CheckoutOutcome): boolean {
  return outcome === "success" || outcome === "pending";
}