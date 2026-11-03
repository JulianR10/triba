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

// De varias filas de una misma persona, la suscripción vigente que corresponde usar. La que
// apunta el perfil gana; si no, una paga antes que una 'migrated' (cortesía); si no, la que
// vence más tarde. Misma regla de vigencia que el gate. Sin vigente → null.
export function pickLiveSubscription<
  T extends { id: string; provider?: string | null; status: string; current_period_end: string | null },
>(rows: T[], pointedId?: string | null): T | null {
  const score = (r: T) => (r.id === pointedId ? 2 : 0) + (r.provider !== "migrated" ? 1 : 0);
  const end = (r: T) => (r.current_period_end ? new Date(r.current_period_end).getTime() : Infinity);
  const live = rows.filter((r) => isActiveSubscription(r.status, r.current_period_end));
  live.sort((a, b) => score(b) - score(a) || end(b) - end(a));
  return live[0] ?? null;
}

// Devuelve la suscripción vigente de la usuaria (si tiene) para evitar
// dobles suscripciones y habilitar el cambio de plan. Triba no ofrece períodos de
// prueba: active y migrated cuentan solo con el período vigente. No depende de que el
// puntero del perfil esté al día: se busca entre todas sus filas.
export async function getActiveSubscriptionForUser(
  userId: string,
): Promise<ActiveSubscription | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("subscription_id")
    .eq("id", userId)
    .maybeSingle();
  const { data: rows } = await supabaseAdmin
    .from("subscriptions")
    .select("id, status, plan_type, provider, plan_currency, current_period_end, scheduled_plan_type")
    .eq("user_id", userId)
    .in("status", ["active", "migrated"]);
  return pickLiveSubscription((rows ?? []) as ActiveSubscription[], (profile as any)?.subscription_id ?? null);
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
    .in("status", ["active", "past_due"]);
  const live = (data || []).filter((s: any) => isActiveSubscription(s.status, s.current_period_end));
  if (live.length === 0) return null;
  if (live.some((s: any) => !s.cancel_at_period_end)) return { endsAt: null };
  return { endsAt: live[0].current_period_end ?? null };
}
