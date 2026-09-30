/**
 * Exporta la lista del newsletter gratuito ANTES de retirarlo (lanzamiento
 * Mail Club). Solo lectura: no modifica Supabase ni Sender.
 *
 *   1. Lee todas las filas de `newsletters` (paginado).
 *   2. Lee todos los subscribers de Sender con su pertenencia a los grupos
 *      "newsletter-gratuito" y "suscriptora-paga".
 *   3. Vuelca la UNIÓN a CSV con origen por email (supabase/sender/ambos) y
 *      marca los que también están en el grupo pago: esos NO se borran nunca
 *      (se les quita solo la pertenencia gratuita).
 *   4. Imprime conteos para contrastar antes del borrado manual posterior.
 *
 * Usage:
 *   node --env-file=.env scripts/export-newsletters.mjs [--out lista-newsletter.csv]
 *
 * Requires in .env: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SENDER_API_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

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
const outArg = process.argv.find((a) => a.startsWith("--out="));
const outPath = outArg ? outArg.split("=")[1] : "lista-newsletter.csv";

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  const neutralized = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  if (/[",\n\r]/.test(s) || neutralized !== s) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

function memberOf(sub, groupId, groupTitle) {
  const tags = sub.subscriber_tags || [];
  const groups = sub.groups || [];
  return [...tags, ...groups].some((g) => g.id === groupId || g.title === groupTitle);
}

async function fetchAllNewsletters() {
  const rows = [];
  const pageSize = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("newsletters")
      .select("email, subscribed_at, sender_synced")
      .order("subscribed_at", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw new Error(`Supabase: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchAllSender() {
  const res = await fetch(`${SENDER_API_BASE}/groups`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Sender GET groups ${res.status}`);
  const j = await res.json();
  const free = (j.data || []).find((g) => g.title === "newsletter-gratuito");
  const paid = (j.data || []).find((g) => g.title === "suscriptora-paga");

  const all = [];
  let page = 1;
  const perPage = 100;
  for (;;) {
    const r = await fetch(`${SENDER_API_BASE}/subscribers?limit=${perPage}&page=${page}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (!r.ok) throw new Error(`Sender GET subscribers ${r.status}`);
    const jj = await r.json();
    all.push(...(jj.data || []));
    const meta = jj.meta || {};
    if (page >= (meta.last_page || 1)) break;
    page++;
  }
  return { subs: all, free, paid };
}

const dbRows = await fetchAllNewsletters();
const dbByEmail = new Map(dbRows.map((r) => [String(r.email).toLowerCase(), r]));

const { subs: senderSubs, free: freeGroup, paid: paidGroup } = await fetchAllSender();

const union = new Map();
for (const r of dbRows) {
  const email = String(r.email).toLowerCase();
  union.set(email, {
    email,
    fuente: "supabase",
    en_grupo_pago: 0,
    suscripto_el: r.subscribed_at || "",
    sender_synced: r.sender_synced ? "1" : "0",
  });
}
let senderFree = 0;
let senderOnly = 0;
for (const s of senderSubs) {
  const email = String(s.email || "").toLowerCase();
  if (!email) continue;
  const inFree = freeGroup ? memberOf(s, freeGroup.id, "newsletter-gratuito") : false;
  const inPaid = paidGroup ? memberOf(s, paidGroup.id, "suscriptora-paga") : false;
  if (inPaid && union.has(email)) union.get(email).en_grupo_pago = 1;
  if (!inFree) continue;
  senderFree++;
  const existing = union.get(email);
  if (existing) {
    existing.fuente = "ambos";
    if (inPaid) existing.en_grupo_pago = 1;
  } else {
    senderOnly++;
    union.set(email, {
      email,
      fuente: "sender",
      en_grupo_pago: inPaid ? 1 : 0,
      suscripto_el: "",
      sender_synced: "",
    });
  }
}

const header = "email,fuente,en_grupo_pago,suscripto_el,sender_synced";
const lines = [...union.values()]
  .sort((a, b) => a.email.localeCompare(b.email))
  .map((r) => [r.email, r.fuente, r.en_grupo_pago, r.suscripto_el, r.sender_synced].map(csvCell).join(","));
writeFileSync(outPath, "﻿" + [header, ...lines].join("\n"), "utf8");

const deletable = [...union.values()].filter((r) => r.en_grupo_pago !== 1).length;
console.log(`Supabase newsletters:            ${dbRows.length}`);
console.log(`Sender grupo gratuito:           ${senderFree}${freeGroup ? "" : " (grupo no encontrado)"}`);
console.log(`Solo en Sender (revisar):        ${senderOnly}`);
console.log(`Unión total (CSV):               ${union.size}`);
console.log(`Borrables (no están en pagas):   ${deletable}`);
console.log(`CSV: ${outPath}`);
console.log("Solo lectura: no se borró ningún contacto. Verificá el archivo y los conteos antes del borrado manual.");
