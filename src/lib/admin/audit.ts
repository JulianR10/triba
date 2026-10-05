import { supabaseAdmin } from "../supabase-admin";
import type { Json } from "../database.types";

// Registro de acciones admin (solo escritura: ya no hay vista de actividad).
export async function logAdminAction(
  adminId: string,
  adminEmail: string,
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, unknown>,
) {
  await supabaseAdmin.from("admin_audit_log").insert({
    admin_id: adminId,
    admin_email: adminEmail,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    details: (details || null) as unknown as Json,
  });
}
