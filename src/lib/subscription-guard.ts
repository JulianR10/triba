import { supabaseAdmin } from "./supabase-admin";
import { isActiveSubscription } from "./subscription-status";

export interface ActiveSubscription {
  id: string;
  status: string;
  plan_type: string | null;
  provider: string;
  plan_currency: string;
  current_period_end: string | null;
}

// Devuelve la suscripción vigente de la usuaria (si tiene) para evitar
// dobles suscripciones. Considera activa: active/trialing siempre, y
// migrated solo si el período de cortesía aún no venció.
export async function getActiveSubscriptionForUser(
  userId: string,
): Promise<ActiveSubscription | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("subscription_id")
    .eq("id", userId)
    .maybeSingle();
  const subscriptionId = (profile as any)?.subscription_id as string | null;
  if (!subscriptionId) return null;

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("id, status, plan_type, provider, plan_currency, current_period_end")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!sub) return null;

  const status = (sub as any).status as string;
  const end = (sub as any).current_period_end as string | null;
  // Misma regla que el gate: active/trialing con período vigente; migrated
  // con cortesía vigente. Expiradas no habilitan upgrade/downgrade.
  if (status === "trialing") return sub as ActiveSubscription;
  if (isActiveSubscription(status, end)) return sub as ActiveSubscription;
  return null;
}
