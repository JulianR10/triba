import { supabase } from "./supabase";
import { supabaseAdmin } from "./supabase-admin";
import { error } from "./response";

export async function requireUser(request: Request, opts?: { useAdmin?: boolean }) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return error("Unauthorized", 401);
  }

  const token = authHeader.slice(7);
  const client = opts?.useAdmin ? supabaseAdmin : supabase;
  const { data: { user }, error: authError } = await client.auth.getUser(token);

  if (authError || !user) {
    return error("Unauthorized", 401);
  }

  return { user, token };
}

export function requireAdmin(locals: App.Locals) {
  if (!locals.user || locals.profile?.role !== "admin") {
    return error("Forbidden", 403);
  }
  return { user: locals.user, profile: locals.profile };
}
