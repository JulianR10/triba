/**
 * Importa suscriptores pagos desde WooCommerce (CSV) al nuevo sistema.
 *
 * Para cada email:
 *   1. Lo registra en subscriber_migrations (para auto-upgrade al registrarse)
 *   2. Lo sincroniza a Kit con tag "suscriptora-paga"
 *
 * Usage:
 *   node --env-file=.env scripts/import-wp-subscribers.mjs <ruta-al-csv>
 *
 * CSV debe tener al menos columna "email" (con header).
 * Opcional: columna "nombre" para Kit.
 *
 * Requires in .env:
 *   PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   KIT_API_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const KIT_API_BASE = "https://api.kit.com/v4";

// ─── Helpers ─────────────────────────────────────────────────────

async function kitRequest(method, path, body) {
  const url = `${KIT_API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "X-Kit-Api-Key": process.env.KIT_API_KEY,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kit API ${res.status}: ${text}`);
  }
  return res.json();
}

async function kitAddSubscriber(email, firstName) {
  const { subscriber } = await kitRequest("POST", "/subscribers", {
    email_address: email,
    first_name: firstName || null,
  });
  return subscriber;
}

async function kitTagSubscriber(email, tagId) {
  await kitRequest("POST", `/tags/${tagId}/subscribers`, {
    email_address: email,
  });
}

async function kitGetOrCreateTag(name) {
  const res = await kitRequest("GET", `/tags?include=subscriber_count`);
  const existing = (res.tags || []).find((t) => t.name === name);
  if (existing) return existing;
  const { tag } = await kitRequest("POST", "/tags", { name });
  return tag;
}

// ─── CSV parser (respeta comillas) ─────────────────────────────

function splitCSVLine(line) {
  const cols = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cols.push(current.trim().replace(/^"|"$/g, ""));
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current.trim().replace(/^"|"$/g, ""));
  return cols;
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  const emailIdx = headers.indexOf("email");
  const nameIdx = headers.indexOf("nombre");

  if (emailIdx === -1) {
    console.error("El CSV debe tener una columna 'email'.");
    process.exit(1);
  }

  return lines.slice(1).map((line) => {
    const cols = splitCSVLine(line);
    return {
      email: cols[emailIdx],
      nombre: nameIdx >= 0 ? cols[nameIdx] : null,
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
  const kitKey = process.env.KIT_API_KEY;

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

  // ─── Setup Kit tag ────────────────────────────────────────────
  let kitTagId = null;
  if (kitKey) {
    console.log("🏷️  Buscando/creando tag 'suscriptora-paga' en Kit...");
    const tag = await kitGetOrCreateTag("suscriptora-paga");
    kitTagId = tag.id;
    console.log(`   OK: tag #${kitTagId} — "${tag.name}"\n`);
  } else {
    console.log("⚠️  KIT_API_KEY no configurada — se saltea Kit\n");
  }

  // ─── Importar ──────────────────────────────────────────────────
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    process.stdout.write(`[${imported + skipped + errors + 1}/${rows.length}] ${row.email}... `);

    try {
      // 1. Insertar en subscriber_migrations
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

      // 2. Sync a Kit
      if (kitTagId) {
        try {
          const sub = await kitAddSubscriber(row.email, row.nombre);
          await kitTagSubscriber(row.email, kitTagId);
        } catch (kitErr) {
          console.log(`⚠️  Kit error: ${kitErr.message}`);
        }
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
    if (kitTagId) {
      console.log(`   • Están en Kit con tag "suscriptora-paga"`);
    }
    console.log(`\n🔜 Próximo paso: enviar email masivo desde Kit avisando`);
    console.log(`   que la plataforma se mudó y cómo crear su cuenta.`);
  }
}

main().catch((err) => {
  console.error("\n💥 Error fatal:", err);
  process.exit(1);
});
