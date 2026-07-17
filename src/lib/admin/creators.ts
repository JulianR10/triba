import { supabaseAdmin } from "../supabase-admin";

export interface AdminCreatorRow {
  id: string;
  nombre: string;
  email: string;
  pais: string;
  areas: string[];
  propuesta: string;
  trabajo_url: string | null;
  status: "pending" | "approved" | "rejected";
  admin_notes: string | null;
  created_at: string;
}

export async function listCreatorApplicationsForAdmin(
  statusFilter: "all" | "pending" | "approved" | "rejected" = "all",
): Promise<AdminCreatorRow[]> {
  let query = supabaseAdmin
    .from("creator_applications")
    .select("*")
    .order("created_at", { ascending: false });
  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data as AdminCreatorRow[];
}
