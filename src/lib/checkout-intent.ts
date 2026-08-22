const STORAGE_KEY = "triba:checkout";
const TTL_MS = 24 * 60 * 60 * 1000;
const VALID_PROVIDERS = new Set(["stripe", "mercadopago"]);
const VALID_CURRENCIES = new Set(["EUR", "USD", "ARS"]);

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
    // P8: validate values — a corrupted provider/currency would be cleared by
    // flush without ever matching a button, silently losing the checkout.
    if (!VALID_PROVIDERS.has((intent as CheckoutIntent).provider)) return drop();
    if (!VALID_CURRENCIES.has((intent as CheckoutIntent).currency)) return drop();

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
