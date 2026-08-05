import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../lib/auth";
import { ok, error } from "../../../../../lib/response";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { logAdminAction } from "../../../../../lib/admin/audit";
import { stripe } from "../../../../../lib/stripe";

export const prerender = false;

export const POST: APIRoute = async ({ params, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  const id = params.id;
  if (!id) return error("ID inválido", 400);

  // Try profile first
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, subscription_id")
    .eq("id", id)
    .single();

  if (profile?.subscription_id) {
    const { error: rpcErr } = await supabaseAdmin.rpc("cancel_subscription", { p_user_id: profile.id });
    if (rpcErr) return error(rpcErr.message, 500);

    logAdminAction(admin.user.id, admin.profile.email, "subscriber.canceled", "subscriber", profile.id, {
      canceled_email: profile.email,
    });

    return ok();
  }

  // Try migration (migrated user without account)
  const { data: migration } = await supabaseAdmin
    .from("subscriber_migrations")
    .select("id, email, stripe_subscription_id")
    .eq("id", id)
    .single();

  if (!migration?.stripe_subscription_id) {
    return error("No se encontró suscripción activa para cancelar", 404);
  }

  if (stripe) {
    try {
      await stripe.subscriptions.cancel(migration.stripe_subscription_id);
    } catch (err: any) {
      return error(`Error al cancelar en Stripe: ${err.message || err}`, 500);
    }
  }

  await supabaseAdmin
    .from("subscriber_migrations")
    .update({ stripe_subscription_id: null })
    .eq("id", id);

  logAdminAction(admin.user.id, admin.profile.email, "subscriber.canceled", "subscriber", id, {
    canceled_email: migration.email,
  });

  return ok();
};
