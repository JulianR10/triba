import { supabaseAdmin } from "./supabase-admin";
import { logger } from "./logger";

// Un upgrade 'pending' que nunca se confirmó (checkout abandonado, pago
// rechazado sin webhook, timeout) bloquea nuevos intentos por el índice
// parcial único (migración 024). Este helper los expira a 'failed' para
// liberar el slot sin tocar pagos ya confirmados.
export const UPGRADE_PENDING_TTL_MINUTES = 60;

export async function expireStalePendingUpgrades(
  userId: string,
  olderThanMinutes: number = UPGRADE_PENDING_TTL_MINUTES,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  try {
    const { data, error } = await supabaseAdmin
      .from("mail_club_upgrades")
      .update({
        status: "failed",
        error: "El upgrade quedó pendiente y expiró. Podés reintentarlo.",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("status", "pending")
      .lt("created_at", cutoff)
      .select("id");
    if (error) {
      logger.error({ err: error, userId }, "expireStalePendingUpgrades error");
      return 0;
    }
    const count = data?.length ?? 0;
    if (count > 0) {
      logger.info({ userId, count }, "expired stale pending upgrades");
    }
    return count;
  } catch (err: any) {
    logger.error({ err, userId }, "expireStalePendingUpgrades exception");
    return 0;
  }
}
