/**
 * Crea un usuario de prueba con suscripción activa para testear /mi-cuenta.
 *
 * Usage:
 *   node --env-file=.env scripts/create-test-subscriber.mjs <email> <password>
 *
 * Requires in .env:
 *   PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Example:
 *   node --env-file=.env scripts/create-test-subscriber.mjs suscriptora@triba.com 'TestTriba2026!'
 */

import { createClient } from "@supabase/supabase-js";

const [, , emailArg, passwordArg] = process.argv;

if (!emailArg || !passwordArg) {
  console.error("Uso: node --env-file=.env scripts/create-test-subscriber.mjs <email> <password>");
  console.error("Ej:  node --env-file=.env scripts/create-test-subscriber.mjs suscriptora@triba.com 'TestTriba2026!'");
  process.exit(1);
}

const email = emailArg.trim();
const newPassword = passwordArg;

if (newPassword.length < 6) {
  console.error("Error: la password debe tener al menos 6 caracteres.");
  process.exit(1);
}

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Error: PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar en .env");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── 1. Buscar o crear el user ───────────────────────────────
console.log(`\n[1/5] Buscando user con email ${email}...`);

let userId;

const { data: listData, error: listErr } = await admin.auth.admin.listUsers();
if (listErr) {
  console.error(`Error listando users: ${listErr.message}`);
  process.exit(1);
}

const matches = (listData?.users || []).filter((u) => u.email === email);

if (matches.length > 0) {
  const user = matches[0];
  userId = user.id;
  console.log(`     OK: ya existe (id=${user.id.slice(0, 8)}…)`);

  console.log(`\n[2/5] Reseteando password...`);
  const { error: pwdErr } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
    email_confirm: true,
  });
  if (pwdErr) {
    console.error(`Error: ${pwdErr.message}`);
    process.exit(1);
  }
  console.log(`     OK`);
} else {
  console.log(`     No existe. Creando...`);
  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: newPassword,
    email_confirm: true,
  });
  if (createErr) {
    console.error(`Error creando user: ${createErr.message}`);
    process.exit(1);
  }
  userId = newUser.user.id;
  console.log(`     OK: id=${userId.slice(0, 8)}…`);
}

// ─── 3. Crear subscription ────────────────────────────────────
console.log(`\n[3/5] Creando suscripción de prueba (stripe, USD, activa)...`);

const periodStart = new Date();
const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 días

const { data: sub, error: subErr } = await admin
  .from("subscriptions")
  .insert({
    user_id: userId,
    provider: "stripe",
    provider_subscription_id: `test_sub_${Date.now()}`,
    status: "active",
    plan_currency: "USD",
    current_period_start: periodStart.toISOString(),
    current_period_end: periodEnd.toISOString(),
  })
  .select("id")
  .single();

if (subErr) {
  console.error(`Error creando subscription: ${subErr.message}`);
  process.exit(1);
}
console.log(`     OK: id=${sub.id.slice(0, 8)}… vence ${periodEnd.toLocaleDateString("es-AR")}`);

// ─── 4. Actualizar profile ────────────────────────────────────
console.log(`\n[4/5] Actualizando profile (role=subscriber, subscription_id)...`);

const { error: profileErr } = await admin
  .from("profiles")
  .update({
    role: "subscriber",
    subscription_id: sub.id,
    updated_at: new Date().toISOString(),
  })
  .eq("id", userId);

if (profileErr) {
  console.error(`Error actualizando profile: ${profileErr.message}`);
  process.exit(1);
}
console.log(`     OK`);

// ─── 5. Verificar ─────────────────────────────────────────────
console.log(`\n[5/5] Verificando estado final...`);

const { data: profile } = await admin
  .from("profiles")
  .select("id, email, role, subscription_id")
  .eq("id", userId)
  .single();

const { data: subscription } = await admin
  .from("subscriptions")
  .select("*")
  .eq("id", sub.id)
  .single();

console.log(`\n--- Estado final ---`);
console.log(`  email:               ${profile?.email}`);
console.log(`  role:                ${profile?.role}`);
console.log(`  subscription_id:     ${profile?.subscription_id?.slice(0, 8)}…`);
console.log(`  sub.status:          ${subscription?.status}`);
console.log(`  sub.provider:        ${subscription?.provider}`);
console.log(`  sub.plan_currency:   ${subscription?.plan_currency}`);
console.log(`  sub.current_period_end: ${subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString("es-AR") : "—"}`);

console.log(`\nListo. Iniciá sesión con:`);
console.log(`  email:    ${email}`);
console.log(`  password: ${newPassword}`);
console.log(`\nDespués andá a http://localhost:4321/mi-cuenta\n`);
