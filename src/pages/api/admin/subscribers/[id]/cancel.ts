import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../lib/auth";
import { ok, error } from "../../../../../lib/response";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { getPaymentProvider } from "../../../../../lib/payment-provider";
import { logAdminAction } from "../../../../../lib/admin/audit";

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
    // Also get provider from subscriptions table
    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("provider, provider_subscription_id")
      .eq("user_id", id)
      .single();

    if (subError || !subscription) {
      return error("No active subscription found", 404);
    }

    const provider = getPaymentProvider(subscription.provider as "stripe" | "mercadopago");

    // 1. Probar RPC primero
    const { error: rpcErr } = await supabaseAdmin.rpc("cancel_subscription", { p_user_id: profile.id });

    if (rpcErr) {
      // RPC falló → intentar cancelar en proveedor como compensación
      if (provider && subscription.provider_subscription_id) {
        try {
          await provider.cancelSubscription(subscription.provider_subscription_id);
          // RPC falló pero provider cancel succeeded: avisamos al usuario
          return ok({
            message: "No se pudo actualizar la BD, pero la suscripción se canceló en el proveedor",
            providerWarnings: [rpcErr.message || "RPC failed"],
          });
        } catch (err: any) {
          // Ambos fallaron: error crítico
          return error(`Error en ambos lados: ${err.message || "Provider cancel failed"}`, 500);
        }
      }
      // Sin proveedor externo (migrada) ni fallback: devolver el error del RPC
      return error(rpcErr.message || "Error actualizando la suscripción", 500);
    }

    // RPC éxito → solo limpiar BD y log
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

  const migrationProvider = getPaymentProvider("stripe");
  try {
    await migrationProvider.cancelSubscription(migration.stripe_subscription_id);
  } catch (err: any) {
    return error(`Error al cancelar en proveedor: ${err.message || err}`, 500);
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