/**
 * Importa suscriptores pagos desde WooCommerce (CSV) al nuevo sistema.
 *
 * Para cada email:
 *   1. Lo registra en subscriber_migrations (para auto-upgrade al registrarse)
 *
 * Usage:
 *   node --env-file=.env scripts/import-wp-subscribers.mjs <ruta-al-csv>
 *
 * CSV debe tener al menos columna "email" (con header).
 *
 * Requires in .env:
 *   PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// ─── CSV parser simple ──────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const emailIdx = headers.indexOf("email");

  if (emailIdx === -1) {
    console.error("El CSV debe tener una columna 'email'.");
    process.exit(1);
  }

  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    return {
      email: cols[emailIdx],
    };
  }).filter((r) => r.email);
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const csvPath = process.argv[2];

  if (!csvPath) {
    console.error("Uso: node --env-file=.env scripts/import-wp-subscribers.mjs <ruta-al-csv>");
    console.error("Ej:  node --env-file=.env scripts/import-wp-subscribers.mjs ./suscriptores-woo.csv");
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

  // ─── Leer CSV ──────────────────────────────────────────────────
  console.log("\n📄 Leyendo CSV...");
  let csvText;
  try {
    csvText = readFileSync(csvPath, "utf-8");
  } catch (err) {
    console.error(`Error leyendo ${csvPath}: ${err.message}`);
    process.exit(1);
  }

  const rows = parseCSV(csvText);
  console.log(`   ${rows.length} registros encontrados\n`);

  if (rows.length === 0) {
    console.log("No hay registros para importar.");
    process.exit(0);
  }

  // ─── Importar ──────────────────────────────────────────────────
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    process.stdout.write(`[${imported + skipped + errors + 1}/${rows.length}] ${row.email}... `);

    try {
      const { error: insertErr } = await admin
        .from("subscriber_migrations")
        .insert({ email: row.email, old_subscription_data: { imported_at: new Date().toISOString() } });

      if (insertErr) {
        if (insertErr.code === "23505") {
          skipped++;
          console.log(`⏭️  ya migrado`);
          continue;
        }
        throw insertErr;
      }

      imported++;
      console.log(`✅`);
    } catch (err) {
      errors++;
      console.log(`❌ ${err.message}`);
    }
  }

  // ─── Resumen ────────────────────────────────────────────────────
  console.log(`\n━━━ Importación completa ━━━`);
  console.log(`  ✅ Importados:  ${imported}`);
  console.log(`  ⏭️  Ya existían: ${skipped}`);
  console.log(`  ❌ Errores:     ${errors}`);
  console.log(`  📊 Total:       ${rows.length}`);

  if (imported > 0) {
    console.log(`\n📝 Los ${imported} suscriptores nuevos:`);
    console.log(`   • Están en subscriber_migrations → si se registran en la nueva web`);
    console.log(`     con el mismo email, obtendrán role='subscriber' automáticamente`);
  }
}

main().catch((err) => {
  console.error("\n💥 Error fatal:", err);
  process.exit(1);
});
