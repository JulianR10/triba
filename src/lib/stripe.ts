import Stripe from "stripe";

const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY || "";

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2026-06-24.dahlia" })
  : null;

export const STRIPE_WEBHOOK_SECRET = import.meta.env.STRIPE_WEBHOOK_SECRET || "";

// P13: STRIPE_PRICE_ARS definido por tolerancia del provider; UI manda ARS siempre a MP (src/components/CheckoutButton), no a Stripe. Se mantiene para no romper si se rutea ARS a Stripe en el futuro.
export const STRIPE_PRICE_IDS: Record<"EUR" | "USD" | "ARS", string> = {
  EUR: import.meta.env.STRIPE_PRICE_EUR || "",
  USD: import.meta.env.STRIPE_PRICE_USD || "",
  ARS: import.meta.env.STRIPE_PRICE_ARS || "",
};
