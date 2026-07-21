const STORAGE_KEY = "triba:checkout";
const TTL_MS = 5 * 60 * 1000;

export interface CheckoutIntent {
  provider: string;
  currency: string;
  timestamp: number;
}

export function saveCheckoutIntent(provider: string, currency: string): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ provider, currency, timestamp: Date.now() } satisfies CheckoutIntent),
    );
  } catch {
    /* localStorage full or unavailable */
  }
}

export function getCheckoutIntent(): CheckoutIntent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const intent: unknown = JSON.parse(raw);
    if (typeof intent !== "object" || intent === null) return drop();
    if (!("provider" in intent) || !("currency" in intent) || !("timestamp" in intent)) return drop();
    if (typeof (intent as CheckoutIntent).timestamp !== "number") return drop();

    if (Date.now() - (intent as CheckoutIntent).timestamp > TTL_MS) return drop();

    return intent as CheckoutIntent;
  } catch {
    return drop();
  }
}

function drop(): null {
  clearCheckoutIntent();
  return null;
}

export function clearCheckoutIntent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
