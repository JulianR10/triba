import { supabaseAdmin } from "../supabase-admin";

export interface AdminFeedbackRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  mensaje: string;
  created_at: string;
}

export async function listFeedbackForAdmin(): Promise<AdminFeedbackRow[]> {
  const { data: feedback, error } = await supabaseAdmin
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !feedback) return [];

  const userIds = Array.from(
    new Set(
      feedback.map((f: any) => f.user_id).filter((id: any) => !!id),
    ),
  ) as string[];

  let emailByUserId = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .in("id", userIds);
    for (const p of (profiles as any[]) || []) {
      emailByUserId.set(p.id, p.email);
    }
  }

  return (feedback as any[]).map((f) => ({
    id: f.id,
    user_id: f.user_id,
    user_email: f.user_id ? emailByUserId.get(f.user_id) || null : null,
    mensaje: f.mensaje,
    created_at: f.created_at,
  }));
}
