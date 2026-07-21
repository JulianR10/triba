export type SubscriptionStatus = "active" | "canceled" | "past_due" | "trialing" | "incomplete";

export type PaymentProvider = "stripe" | "mercadopago";

export interface Profile {
  id: string;
  email: string;
  role: "free" | "subscriber" | "admin";
  subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  provider: PaymentProvider;
  provider_subscription_id: string;
  status: SubscriptionStatus;
  plan_currency: "EUR" | "USD" | "ARS";
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
  canceled_at: string | null;
}
