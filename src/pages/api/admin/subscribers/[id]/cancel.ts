import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../lib/auth";
import { ok, error } from "../../../../../lib/response";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { logAdminAction } from "../../../../../lib/admin/audit";

export const prerender = false;

export const POST: APIRoute = async ({ params, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  const userId = params.id;
  if (!userId) return error("user_id inválido", 400);

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("id, subscription_id")
    .eq("id", userId)
    .single();

  if (profileErr || !profile) {
    return error("Usuario no encontrado", 404);
  }
  if (!profile.subscription_id) {
    return error("Este usuario no tiene una suscripción activa", 400);
  }

  const { error: rpcErr } = await supabaseAdmin.rpc("cancel_subscription", {
    p_user_id: userId,
  });

  if (rpcErr) {
    return error(rpcErr.message, 500);
  }

  logAdminAction(
    admin.user.id,
    admin.profile.email,
    "subscriber.canceled",
    "subscriber",
    userId,
    { canceled_email: profile.email }
  );

  return ok();
};
