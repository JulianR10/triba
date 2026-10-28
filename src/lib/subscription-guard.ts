import { supabaseAdmin } from "./supabase-admin";
import { isActiveSubscription } from "./subscription-status";

export interface ActiveSubscription {
  id: string;
  status: string;
  plan_type: string | null;
  provider: string;
  plan_currency: string;
  current_period_end: string | null;
  scheduled_plan_type: string | null;
}

// Devuelve la suscripción vigente de la usuaria (si tiene) para evitar
// dobles suscripciones. Triba no ofrece períodos de prueba: active y migrated
// cuentan solo con el período vigente.
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
    .select("id, status, plan_type, provider, plan_currency, current_period_end, scheduled_plan_type")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!sub) return null;

  const status = (sub as any).status as string;
  const end = (sub as any).current_period_end as string | null;
  // Misma regla que el gate. Expiradas no habilitan upgrade/downgrade.
  if (isActiveSubscription(status, end)) return sub as ActiveSubscription;
  return null;
}

// Hay una suscripción paga vigente (Stripe/MP) en cualquier fila de la usuaria,
// no solo la del puntero del perfil. Las 'migrated' (cortesía) no cuentan:
// esas personas deben poder suscribirse para convertir.
export async function hasLivePaidSubscription(userId: string): Promise<boolean> {
  return (await getLivePaidSubscription(userId)) !== null;
}

// La suscripción paga vigente a mostrar al rechazar un checkout. Si hay varias, gana una sin baja
// programada: con esa no hay nada que esperar. `endsAt` solo viene cuando TODAS tienen la baja programada.
export async function getLivePaidSubscription(
  userId: string,
): Promise<{ endsAt: string | null } | null> {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("status, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .in("provider", ["stripe", "mercadopago"])
    .eq("status", "active");
  const live = (data || []).filter((s: any) => isActiveSubscription(s.status, s.current_period_end));
  if (live.length === 0) return null;
  if (live.some((s: any) => !s.cancel_at_period_end)) return { endsAt: null };
  return { endsAt: live[0].current_period_end ?? null };
}
