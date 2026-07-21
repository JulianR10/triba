import Stripe from "stripe";

const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY || "";

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2026-06-24.dahlia" })
  : null;

export const STRIPE_WEBHOOK_SECRET = import.meta.env.STRIPE_WEBHOOK_SECRET || "";

export const STRIPE_PRICE_IDS = {
  EUR: import.meta.env.STRIPE_PRICE_EUR || "",
  USD: import.meta.env.STRIPE_PRICE_USD || "",
};
