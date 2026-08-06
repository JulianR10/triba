/**
 * Re-sincroniza los suscriptores del newsletter gratuito de la tabla `newsletters`
 * con el grupo Sender "newsletter-gratuito" (que dispara la automatización de bienvenida).
 *
 * Antes de esto, el sync a Sender era best-effort dentro de un try/catch silencioso:
 * si el POST /subscribers fallaba (p. ej. 429 por cuota del plan free), el email se
 * guardaba en Supabase pero nunca se agregaba a Sender -> nunca llegaba el welcome.
 *
 * Este script:
 *   1. Trae todas las filas de `newsletters`.
 *   2. Trae todos los subscribers de Sender (paginado) y arma el set de emails que ya
 *      están en el grupo "newsletter-gratuito".
 *   3. Para cada fila SIN sync (sender_synced = false/null) o que no esté en Sender,
 *      hace el POST /subscribers con trigger_automation y actualiza el estado en base.
 *   4. Nunca re-dispara la automatización para los que ya están sync'eados (idempotente
 *      por presencia, no por estado).
 *
 * Usage:
 *   node --env-file=.env scripts/resync-newsletters.mjs [--email user@example.com]
 *   node --env-file=.env scripts/resync-newsletters.mjs --all   # fuerza re-sync de todos
 *
 * Requires in .env: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SENDER_API_KEY
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const key = process.env.SENDER_API_KEY;
if (!key) {
  console.error("Falta SENDER_API_KEY en .env");
  process.exit(1);
}

const SENDER_API_BASE = "https://api.sender.net/v2";
const dry = process.argv.includes("--dry");
const all = process.argv.includes("--all");

const onlyEmailArg = process.argv.find((a) => a.startsWith("--email="));
const onlyEmail = onlyEmailArg ? onlyEmailArg.split("=")[1] : null;

// ─── Sender helpers ─────────────────────────────────────────────

async function senderListAll() {
  const out = [];
  let page = 1;
  const perPage = 100;
  for (;;) {
    const res = await fetch(`${SENDER_API_BASE}/subscribers?limit=${perPage}&page=${page}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Sender GET subscribers ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    out.push(...(j.data || []));
    const meta = j.meta || {};
    if (page >= (meta.last_page || 1)) break;
    page++;
  }
  return out;
}

async function ensureFreeGroupId() {
  const res = await fetch(`${SENDER_API_BASE}/groups`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Sender GET groups ${res.status}`);
  const j = await res.json();
  let group = (j.data || []).find((g) => g.title === "newsletter-gratuito");
  if (!group) {
    const created = await fetch(`${SENDER_API_BASE}/groups`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "newsletter-gratuito" }),
    }).then((r) => r.json());
    group = created.data;
  }
  return group.id;
}

async function senderAdd(email, groupId) {
  const res = await fetch(`${SENDER_API_BASE}/subscribers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, groups: [groupId], trigger_automation: true }),
  });
  if (!res.ok) throw new Error(`Sender POST /subscribers ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log(`modo: ${dry ? "DRY-RUN" : "REAL"} | lights: ${all ? "--all" : "solo pendientes"}`);

  const groupId = await ensureFreeGroupId();
  console.log(`grupo newsletter-gratuito: ${groupId}`);

  const senderSubs = await senderListAll();
  const inSender = new Set(
    senderSubs
      .filter((s) => (s.subscriber_tags || []).some((t) => t.id === groupId))
      .map((s) => s.email.toLowerCase()),
  );
  console.log(`subscribers en Sender (grupo free): ${inSender.size}`);

  let q = supabase.from("newsletters").select("id, email, sender_synced, sender_sync_error");
  if (onlyEmail) q = q.eq("email", onlyEmail.toLowerCase());
  if (!all) q = q.or("sender_synced.is.null,sender_synced.eq.false");
  const { data: rows, error } = await q;

  if (error) { console.error("Supabase select:", error.message); process.exit(1); }

  console.log(`filas de newsletters a procesar: ${rows.length}`);

  let synced = 0;
  let already = 0;
  let failed = 0;

  for (const row of rows) {
    const email = row.email.toLowerCase();
    if (inSender.has(email)) {
      already++;
      // Puede estar en Sender pero el flag en base quedar en false (caso viejo): lo marcamos
      if (!row.sender_synced && !dry) {
        await supabase.from("newsletters").update({ sender_synced: true, sender_synced_at: new Date().toISOString(), sender_sync_error: null }).eq("id", row.id);
      }
      console.log(`  ✓ ${email} (ya en Sender)`);
      continue;
    }

    console.log(`  → ${email} sin sync, agregando...`);
    if (dry) { synced++; continue; }

    try {
      await senderAdd(email, groupId);
      inSender.add(email); // evitar duplicados dentro del lote
      await supabase.from("newsletters").update({ sender_synced: true, sender_synced_at: new Date().toISOString(), sender_sync_error: null }).eq("id", row.id);
      synced++;
    } catch (e) {
      failed++;
      console.error(`   ✗ ${email}: ${e.message}`);
      await supabase.from("newsletters").update({ sender_synced: false, sender_sync_error: (e.message || "").slice(0, 500) }).eq("id", row.id);
    }
  }

  console.log(`\n━━━ Resumen ━━━`);
  console.log(`  Ya en Sender:         ${already}`);
  console.log(`  Agregados a Sender:   ${synced}`);
  console.log(`  Fallidos:             ${failed}`);
  console.log(`  Modo:                 ${dry ? "DRY-RUN (sin cambios)" : "aplicado"}`);
}

main().catch((err) => {
  console.error("\n💥 Error fatal:", err);
  process.exit(1);
});