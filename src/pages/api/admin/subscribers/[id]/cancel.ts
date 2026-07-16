import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { logAdminAction } from "../../../../../lib/admin";

export const prerender = false;

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user || locals.profile?.role !== "admin") {
    return json({ error: "Forbidden" }, 403);
  }

  const userId = params.id;
  if (!userId) return json({ error: "user_id inválido" }, 400);

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("id, subscription_id")
    .eq("id", userId)
    .single();

  if (profileErr || !profile) {
    return json({ error: "Usuario no encontrado" }, 404);
  }
  if (!profile.subscription_id) {
    return json({ error: "Este usuario no tiene una suscripción activa" }, 400);
  }

  const { error: rpcErr } = await supabaseAdmin.rpc("cancel_subscription", {
    p_user_id: userId,
  });

  if (rpcErr) {
    return json({ error: rpcErr.message }, 500);
  }

  logAdminAction(
    locals.user!.id,
    locals.profile!.email,
    "subscriber.canceled",
    "subscriber",
    userId,
    { canceled_email: profile.email }
  );

  return json({ ok: true });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
