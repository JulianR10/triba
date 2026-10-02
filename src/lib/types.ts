export type SubscriptionStatus = "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "migrated";

export type PaymentProvider = "stripe" | "mercadopago" | "migrated";

export interface Profile {
  id: string;
  email: string;
  role: "free" | "subscriber" | "admin";
  subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PlanType = "digital" | "mail_club";

export interface Subscription {
  id: string;
  user_id: string;
  provider: PaymentProvider;
  provider_subscription_id: string;
  status: SubscriptionStatus;
  plan_currency: "EUR" | "USD" | "ARS";
  // Opcional durante la transición: selects parciales antiguos no la traen.
  // El valor canónico vive en DB (default 'digital'); usar getPlanType().
  plan_type?: PlanType;
  cancel_at_period_end?: boolean | null;
  scheduled_plan_type?: PlanType | null;
  scheduled_plan_at?: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
  canceled_at: string | null;
}
