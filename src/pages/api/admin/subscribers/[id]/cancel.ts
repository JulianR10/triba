import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../lib/auth";
import { ok, error } from "../../../../../lib/response";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { getPaymentProvider } from "../../../../../lib/payment-provider";
import { scheduleProviderCancels } from "../../../../../lib/cancel-providers";
import { logAdminAction } from "../../../../../lib/admin/audit";
import { logger } from "../../../../../lib/logger";
import { enforceRateLimit } from "../../../../../lib/rate-limit";

export const prerender = false;

// Misma semántica que POST /api/cancel-subscription (provider-first):
// si el proveedor falla con un error real, NO se marca localmente.
// La RPC 026 devuelve filas marcadas: 0 = no-op y se verifica antes de
// responder, para no mostrar "cancelada" + reload sin que nada cambie.
const CANCELABLE_STATUSES = ["active", "trialing", "past_due", "incomplete"] as const;

export const POST: APIRoute = async ({ params, locals, request }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  const limited = await enforceRateLimit(request, "admin-subscribers", {
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const id = params.id;
  if (!id) return error("ID inválido", 400);

  // Try profile first
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, subscription_id")
    .eq("id", id)
    .maybeSingle();

  if (profile) {
    // Todas las cancelables (una usuaria puede tener varias filas; el puntero
    // profiles.subscription_id puede estar desactualizado).
    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("id, provider, provider_subscription_id, status, cancel_at_period_end")
      .eq("user_id", profile.id)
      .in("status", CANCELABLE_STATUSES)
      .order("created_at", { ascending: false });

    const subscription = subs?.[0];
    if (!subscription) {
      return error("No se encontró una suscripción cancelable para esta usuaria.", 404);
    }

    if (subs.every((s) => s.cancel_at_period_end)) {
      return ok({ message: "La baja ya estaba programada al fin del período.", alreadyScheduled: true });
    }

    // Provider-first sobre todas las filas: la RPC las marca todas.
    const providerResult = await scheduleProviderCancels(profile.id, subs);
    if (providerResult.failed) {
      return error(
        "No se pudo frenar la recurrencia en el proveedor. No se cambió nada en la base.",
        502,
      );
    }
    const providerWarnings = providerResult.warnings;

    const { data: marked, error: rpcErr } = await supabaseAdmin.rpc("cancel_subscription", {
      p_user_id: profile.id,
    });

    if (rpcErr) {
      logger.error({ err: rpcErr, targetUserId: profile.id }, "admin cancel rpc error");
      return error(
        "Se frenó la recurrencia en el proveedor, pero no se pudo registrar en la base. Reintentá.",
        500,
      );
    }

    if (typeof marked === "number" && marked > 0) {
      await logAdminAction(admin.user.id, admin.profile.email, "subscriber.canceled", "subscriber", profile.id, {
        canceled_email: profile.email,
      });
      return ok({
        message: "Suscripción cancelada al fin del período.",
        providerWarnings: providerWarnings.length > 0 ? providerWarnings : undefined,
      });
    }

    // RPC no-op: verificar antes de responder (nunca falso ok).
    const { data: current } = await supabaseAdmin
      .from("subscriptions")
      .select("cancel_at_period_end, status")
      .eq("id", subscription.id)
      .maybeSingle();

    if (current?.cancel_at_period_end) {
      await logAdminAction(admin.user.id, admin.profile.email, "subscriber.canceled", "subscriber", profile.id, {
        canceled_email: profile.email,
      });
      return ok({
        message: "La baja ya estaba programada al fin del período.",
        alreadyScheduled: true,
        providerWarnings: providerWarnings.length > 0 ? providerWarnings : undefined,
      });
    }

    logger.warn(
      { targetUserId: profile.id, status: current?.status },
      "admin cancel rpc no-op",
    );
    return error("La suscripción cambió de estado y no se pudo marcar la baja. Revisá la ficha.", 409);
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

  await logAdminAction(admin.user.id, admin.profile.email, "subscriber.canceled", "subscriber", id, {
    canceled_email: migration.email,
  });

  return ok({ message: "Suscripción migrada cancelada." });
};
