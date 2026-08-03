/**
 * Importa suscriptores pagos desde WooCommerce (CSV) al nuevo sistema.
 *
 * Para cada email:
 *   1. Lo registra en subscriber_migrations (para auto-upgrade al registrarse)
 *   2. Lo sincroniza a Sender (send.net) con grupo "suscriptora-paga"
 *
 * Usage:
 *   node --env-file=.env scripts/import-wp-subscribers.mjs <ruta-al-csv>
 *
 * CSV debe tener al menos columna "email" (con header).
 * Opcional: columna "nombre" para Sender.
 *
 * Requires in .env:
 *   PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SENDER_API_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const SENDER_API_BASE = "https://api.sender.net/v2";

// ─── Helpers ─────────────────────────────────────────────────────

async function senderRequest(method, path, body) {
  const url = `${SENDER_API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.SENDER_API_KEY}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sender API ${res.status}: ${text}`);
  }
  return res.json();
}

async function senderGetOrCreateGroup(title) {
  const res = await senderRequest("GET", "/groups");
  const existing = (res.data || []).find((g) => g.title === title);
  if (existing) return existing;
  const created = await senderRequest("POST", "/groups", { title });
  return created.data;
}

async function senderAddToGroup(email, groupId, firstName) {
  await senderRequest("POST", "/subscribers", {
    email,
    groups: [groupId],
    ...(firstName ? { firstname: firstName } : {}),
    trigger_automation: false,
  });
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
  const senderKey = process.env.SENDER_API_KEY;

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

  // ─── Setup Sender group ────────────────────────────────────────
  let senderGroupId = null;
  if (senderKey) {
    console.log("🏷️  Buscando/creando grupo 'suscriptora-paga' en Sender...");
    const group = await senderGetOrCreateGroup("suscriptora-paga");
    senderGroupId = group.id;
    console.log(`   OK: grupo #${senderGroupId} — "${group.title}"\n`);
  } else {
    console.log("⚠️  SENDER_API_KEY no configurada — se saltea Sender\n");
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

      if (insertErr && insertErr.code !== "23505") {
        throw insertErr;
      }
      const alreadyMigrated = insertErr?.code === "23505";
      if (alreadyMigrated) skipped++;

      // 2. Sync a Sender (siempre, incluso si ya estaba migrado)
      if (senderGroupId) {
        try {
          await senderAddToGroup(row.email, senderGroupId, row.nombre);
        } catch (senderErr) {
          console.log(`⚠️  Sender error: ${senderErr.message}`);
        }
      }

      imported++;
      console.log(alreadyMigrated ? `✅ (ya migrado, sync a Sender)` : `✅`);
    } catch (err) {
      errors++;
      console.log(`❌ ${err.message}`);
    }
  }

  // ─── Resumen ────────────────────────────────────────────────────
  console.log(`\n━━━ Importación completa ━━━`);
  console.log(`  ✅ Sincronizados a Sender:  ${imported}`);
  console.log(`  ⏭️  Ya migrados (DB):       ${skipped}`);
  console.log(`  ❌ Errores:                 ${errors}`);
  console.log(`  📊 Total:                   ${rows.length}`);

  if (imported > 0) {
    console.log(`\n📝 Los ${rows.length} suscriptores:`);
    console.log(`   • Están en subscriber_migrations → si se registran en la nueva web`);
    console.log(`     con el mismo email, obtendrán role='subscriber' automáticamente`);
    if (senderGroupId) {
      console.log(`   • Están en Sender con grupo "suscriptora-paga"`);
    }
    console.log(`\n🔜 Próximo paso: enviar email masivo desde Sender avisando`);
    console.log(`   que la plataforma se mudó y cómo crear su cuenta.`);
  }
}

main().catch((err) => {
  console.error("\n💥 Error fatal:", err);
  process.exit(1);
});
