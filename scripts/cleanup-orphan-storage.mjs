/**
 * Barrido de huérfanos históricos en Supabase Storage.
 *
 * - Bucket público `editions`: covers/ (+ pdfs/ legacy hasta el backfill).
 * - Bucket privado `editions-pdfs`: pdfs/ (referencias `storage://...`).
 * Compara contra cover_url / pdf_url de edition_languages en ambos formatos
 * (URL pública legacy y storage://bucket/path).
 *
 * Idempotente y seguro: DRY-RUN por defecto; solo borra con --real.
 *
 * Usage:
 *   node --env-file=.env scripts/cleanup-orphan-storage.mjs            # dry-run
 *   node --env-file=.env scripts/cleanup-orphan-storage.mjs --real     # borra
 *
 * Requires in .env: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const real = process.argv.includes("--real");
const PUBLIC_BUCKET = "editions";
const PDF_BUCKET = "editions-pdfs";
const LEGACY_PREFIX = "/storage/v1/object/public/editions/";

function parseRef(url) {
  if (typeof url !== "string" || !url) return null;
  if (url.startsWith("storage://")) {
    const rest = url.slice("storage://".length);
    const slash = rest.indexOf("/");
    if (slash < 0) return null;
    return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
  }
  const idx = url.indexOf(LEGACY_PREFIX);
  if (idx >= 0) return { bucket: PUBLIC_BUCKET, path: url.slice(idx + LEGACY_PREFIX.length) };
  return null;
}

async function listAll(bucket, folder) {
  const out = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, { limit, offset, sortBy: { column: "created_at", order: "desc" } });
    if (error) {
      if (error.message.includes("not found") || error.message.includes("does not exist")) return out;
      throw new Error(`list(${bucket}/${folder}): ${error.message}`);
    }
    if (!data || data.length === 0) break;
    for (const f of data) {
      // folders have id === null
      if (f.id !== null) out.push(`${folder}/${f.name}`);
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

async function main() {
  console.log(`modo: ${real ? "REAL (borra)" : "DRY-RUN (sin cambios)"}`);

  // 1) Referencias actuales en DB
  const { data: versions, error } = await supabase
    .from("edition_languages")
    .select("id, language, cover_url, pdf_url");
  if (error) {
    console.error("Supabase select edition_languages:", error.message);
    process.exit(1);
  }

  const referenced = new Map(); // bucket -> Set(path)
  for (const v of versions || []) {
    for (const url of [v.cover_url, v.pdf_url]) {
      const ref = parseRef(url);
      if (ref) {
        if (!referenced.has(ref.bucket)) referenced.set(ref.bucket, new Set());
        referenced.get(ref.bucket).add(ref.path);
      } else if (url) console.log(`  · ref externa/ignorada (${v.language}): ${String(url).slice(0, 80)}`);
    }
  }
  console.log(`referencias en edition_languages: ${[...referenced.values()].reduce((n, s) => n + s.size, 0)}`);

  // 2) Archivos reales en storage
  const publicFiles = [...(await listAll(PUBLIC_BUCKET, "covers")), ...(await listAll(PUBLIC_BUCKET, "pdfs"))];
  const privateFiles = await listAll(PDF_BUCKET, "pdfs");
  console.log(`archivos: ${publicFiles.length} en ${PUBLIC_BUCKET}, ${privateFiles.length} en ${PDF_BUCKET}`);

  // 3) Diferencia por bucket
  const orphans = [];
  for (const p of publicFiles) {
    if (!referenced.get(PUBLIC_BUCKET)?.has(p)) orphans.push({ bucket: PUBLIC_BUCKET, path: p });
  }
  for (const p of privateFiles) {
    if (!referenced.get(PDF_BUCKET)?.has(p)) orphans.push({ bucket: PDF_BUCKET, path: p });
  }

  if (orphans.length === 0) {
    console.log("\n✓ Sin huérfanos. Storage limpio.");
    return;
  }
  console.log(`\nhuérfanos detectados: ${orphans.length}`);
  for (const o of orphans) console.log(`  ✗ [${o.bucket}] ${o.path}`);

  if (!real) {
    console.log("\nListo. Corré con --real para borrar los huérfanos.");
    return;
  }

  const byBucket = new Map();
  for (const o of orphans) {
    const arr = byBucket.get(o.bucket) ?? [];
    arr.push(o.path);
    byBucket.set(o.bucket, arr);
  }
  for (const [bucket, paths] of byBucket) {
    const { error: rmError } = await supabase.storage.from(bucket).remove(paths);
    if (rmError) {
      console.error(`\nError borrando en ${bucket}:`, rmError.message);
      process.exit(1);
    }
  }
  console.log(`\n✓ Borrados ${orphans.length} huérfanos.`);
}

main().catch((err) => {
  console.error("\n💥 Error fatal:", err);
  process.exit(1);
});
