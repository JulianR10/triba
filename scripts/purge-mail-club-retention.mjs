/**
 * Retención postal Mail Club (60 días): purga snapshots de envíos despachados
 * hace más de `--days` días y elimina direcciones de usuarias que ya no tienen
 * una suscripción Mail Club activa.
 *
 * Alineado con la política de privacidad: los datos de cada envío se conservan
 * 60 días después del despacho para gestionar reposiciones.
 *
 * Uso:
 *   node --env-file=.env scripts/purge-mail-club-retention.mjs            # dry-run
 *   node --env-file=.env scripts/purge-mail-club-retention.mjs --real     # aplica
 *   node --env-file=.env scripts/purge-mail-club-retention.mjs --days 60  # override
 *
 * Requiere: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const REAL = args.includes("--real");
const daysIdx = args.indexOf("--days");
const DAYS = daysIdx >= 0 ? Math.max(1, Number(args[daysIdx + 1]) || 60) : 60;

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Error: PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar en .env");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
console.log(`\nRetención Mail Club — ${REAL ? "APLICAR" : "DRY-RUN"} · corte ${cutoff} (${DAYS} días)\n`);

// 1) Lotes despachados antes del corte.
const { data: batches, error: batchErr } = await admin
  .from("mail_club_batches")
  .select("id, period_year, period_month, dispatched_at")
  .eq("status", "dispatched")
  .lt("dispatched_at", cutoff);
if (batchErr) {
  console.error("Error leyendo lotes:", batchErr.message);
  process.exit(1);
}
const batchIds = (batches || []).map((b) => b.id);
console.log(`Lotes despachados hace >${DAYS} días: ${batchIds.length}`);
if (batchIds.length === 0) {
  console.log("Nada para purgar.\n");
  process.exit(0);
}

// 2) Items de esos lotes con snapshot todavía presente.
const { data: items, error: itemErr } = await admin
  .from("mail_club_batch_items")
  .select("id, user_id, address_snapshot")
  .in("batch_id", batchIds);
if (itemErr) {
  console.error("Error leyendo items:", itemErr.message);
  process.exit(1);
}
const withSnapshot = (items || []).filter((it) => {
  const snap = it.address_snapshot;
  return snap && typeof snap === "object" && Object.keys(snap).length > 0 && !snap.purged;
});
console.log(`Items en lotes vencidos: ${(items || []).length} · con snapshot a purgar: ${withSnapshot.length}`);

// 3) Direcciones de usuarias sin suscripción Mail Club activa.
const userIds = [...new Set(withSnapshot.map((it) => it.user_id))];
const keepAddress = new Set();
for (const userId of userIds) {
  const { data: active } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_type", "mail_club")
    .eq("status", "active")
    .gt("current_period_end", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (active) keepAddress.add(userId);
}
const addressesToDelete = userIds.filter((id) => !keepAddress.has(id));
console.log(`Usuarias alcanzadas: ${userIds.length} · con Mail Club activo (conservan dirección): ${keepAddress.size} · direcciones a borrar: ${addressesToDelete.length}`);

if (!REAL) {
  console.log("\nDry-run: no se escribió nada. Repetir con --real para aplicar.\n");
  process.exit(0);
}

// 4) Purga de snapshots (se reemplaza por un marcador vacío: la columna es NOT NULL).
let purged = 0;
for (const it of withSnapshot) {
  const { error } = await admin
    .from("mail_club_batch_items")
    .update({ address_snapshot: { purged: true, purged_at: new Date().toISOString() } })
    .eq("id", it.id);
  if (error) {
    console.error(`Error purgando item ${it.id}: ${error.message}`);
  } else {
    purged++;
  }
}

// 5) Borrado de direcciones sin suscripción activa.
let deleted = 0;
for (const userId of addressesToDelete) {
  const { error } = await admin.from("mailing_addresses").delete().eq("user_id", userId);
  if (error) {
    console.error(`Error borrando dirección de ${userId}: ${error.message}`);
  } else {
    deleted++;
  }
}

console.log(`\nAplicado: ${purged} snapshots purgados · ${deleted} direcciones eliminadas.\n`);
