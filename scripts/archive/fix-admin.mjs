/**
 * Operative tool to fix an admin user:
 *  1. Reset the password (with auto-confirm email if needed)
 *  2. Promote to role='admin' in the profiles table
 *  3. Print final state for verification
 *
 * Usage:
 *   node --env-file=.env scripts/fix-admin.mjs <email> <new-password>
 *
 * Requires in .env:
 *   PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Example:
 *   node --env-file=.env scripts/fix-admin.mjs julianrecarte@gmail.com 'Triba2026Admin!'
 */

import { createClient } from "@supabase/supabase-js";

const [, , emailArg, passwordArg] = process.argv;

if (!emailArg || !passwordArg) {
  console.error("Uso: node --env-file=.env scripts/fix-admin.mjs <email> <new-password>");
  console.error("Ej:  node --env-file=.env scripts/fix-admin.mjs julianrecarte@gmail.com 'Triba2026Admin!'");
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

console.log(`\n[1/4] Buscando user con email ${email}...`);

const { data: listData, error: listErr } = await admin.auth.admin.listUsers();
if (listErr) {
  console.error(`Error listando users: ${listErr.message}`);
  process.exit(1);
}

const matches = (listData?.users || []).filter((u) => u.email === email);
if (matches.length === 0) {
  console.error(`No se encontró ningún user con email ${email}.`);
  console.error(`Users existentes:`);
  for (const u of listData?.users || []) {
    console.error(`  - ${u.email} (provider: ${u.app_metadata?.provider})`);
  }
  process.exit(1);
}
if (matches.length > 1) {
  console.error(`Hay ${matches.length} users con el mismo email. Esto no debería pasar.`);
  for (const u of matches) {
    console.error(`  - id=${u.id} provider=${u.app_metadata?.provider}`);
  }
  process.exit(1);
}

const user = matches[0];
console.log(`     OK: id=${user.id} provider=${user.app_metadata?.provider} confirmed=${!!user.email_confirmed_at}`);

console.log(`\n[2/4] Reseteando password y asegurando email confirmado...`);
const { error: pwdErr } = await admin.auth.admin.updateUserById(user.id, {
  password: newPassword,
  email_confirm: true,
});
if (pwdErr) {
  console.error(`Error: ${pwdErr.message}`);
  process.exit(1);
}
console.log(`     OK`);

console.log(`\n[3/4] Promoviendo a admin (profiles.role = 'admin')...`);
const { error: roleErr } = await admin
  .from("profiles")
  .update({ role: "admin", updated_at: new Date().toISOString() })
  .eq("id", user.id);
if (roleErr) {
  console.error(`Error: ${roleErr.message}`);
  process.exit(1);
}
console.log(`     OK`);

console.log(`\n[4/4] Verificando estado final...`);
const { data: finalProfile, error: profileErr } = await admin
  .from("profiles")
  .select("id, email, role, updated_at")
  .eq("id", user.id)
  .single();
if (profileErr) {
  console.error(`Error leyendo profile: ${profileErr.message}`);
  process.exit(1);
}

const { data: { user: finalUser }, error: finalUserErr } = await admin.auth.admin.getUserById(user.id);
if (finalUserErr) {
  console.error(`Error leyendo user: ${finalUserErr.message}`);
  process.exit(1);
}

console.log(`\n--- Estado final ---`);
console.log(`  id:                ${finalUser.id}`);
console.log(`  email:             ${finalUser.email}`);
console.log(`  email_confirmed:   ${!!finalUser.email_confirmed_at}`);
console.log(`  profile.role:      ${finalProfile.role}`);
console.log(`  profile.updated:   ${finalProfile.updated_at}`);
console.log(`  password:          (actualizada, no se muestra)`);

console.log(`\nListo. Iniciá sesión con:`);
console.log(`  email:    ${email}`);
console.log(`  password: ${newPassword}`);
console.log(`\nDespués andá a http://localhost:4321/admin (con npm run dev levantado).\n`);
