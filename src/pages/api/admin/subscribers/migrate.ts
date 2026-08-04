import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { ok, error } from "../../../../lib/response";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { logger } from "../../../../lib/logger";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return error("Body inválido", 400);
  }

  const email = body?.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return error("Email inválido", 400);
  }

  // 1. Insertar en subscriber_migrations
  const { error: migError } = await supabaseAdmin
    .from("subscriber_migrations")
    .insert({ email });

  if (migError && migError.code !== "23505") {
    logger.error({ err: migError, email }, "Error inserting subscriber_migration");
    return error("Error registrando migración", 500);
  }

  const alreadyMigrated = migError?.code === "23505";

  // 2. Buscar si ya existe un auth user con ese email
  const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
  const existing = (listData?.users || []).find((u) => u.email === email);

  if (!existing) {
    return ok({
      migrated: true,
      accountCreated: false,
      alreadyMigrated,
      note: "Email registrado. Cuando esta persona se registre, obtendrá acceso automáticamente.",
    });
  }

  // 3. Ya tiene cuenta → actualizar profile y crear subscription migrated
  const userId = existing.id;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, role, subscription_id")
    .eq("id", userId)
    .single();

  if (!profile) {
    return error("Profile no encontrado", 500);
  }

  if (profile.role === "subscriber") {
    return ok({
      migrated: true,
      accountCreated: true,
      alreadyMigrated,
      note: `${email} ya tiene role subscriber. No se realizaron cambios.`,
    });
  }

  // Crear subscription migrated
  const { data: sub, error: subErr } = await supabaseAdmin
    .from("subscriptions")
    .insert({
      user_id: userId,
      provider: "migrated",
      provider_subscription_id: `migrated-${userId}-${Date.now()}`,
      status: "migrated",
      plan_currency: "USD",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (subErr) {
    logger.error({ err: subErr, userId }, "Error creating migrated subscription");
    return error("Error creando suscripción migrada", 500);
  }

  const { error: profileErr } = await supabaseAdmin
    .from("profiles")
    .update({
      role: "subscriber",
      subscription_id: sub.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileErr) {
    logger.error({ err: profileErr, userId }, "Error updating profile for migration");
    return error("Error actualizando perfil", 500);
  }

  return ok({
    migrated: true,
    accountCreated: true,
    alreadyMigrated,
    note: `${email} actualizada a subscriber con acceso por 7 días.`,
  });
};
