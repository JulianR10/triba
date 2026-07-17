import { supabaseAdmin } from "../supabase-admin";

export interface AdminLogRow {
  id: string;
  admin_id: string;
  admin_email: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

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
    details: details || null,
  });
}

export async function getAdminAuditLog(
  limit = 100,
  offset = 0,
): Promise<AdminLogRow[]> {
  const { data } = await supabaseAdmin
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return (data as AdminLogRow[]) || [];
}

export async function getAdminAuditLogCount(): Promise<number> {
  const { count } = await supabaseAdmin
    .from("admin_audit_log")
    .select("*", { count: "exact", head: true });
  return count || 0;
}
