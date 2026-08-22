/**
 * Barrido de huérfanos históricos en Supabase Storage (bucket `editions`).
 *
 * Complemento del cleanup en caliente de EditionForm ($ST-05, Ago-2026): ese
 * cubre solo los archivos subidos por un submit que luego falla. Este script
 * lista TODO lo que hay en covers/ y pdfs/ y lo compara contra las URLs
 * referenciadas en edition_languages (cover_url / pdf_url). Todo archivo sin
 * referencia es huérfano y se puede borrar.
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
const BUCKET = "editions";
const PREFIX = "/storage/v1/object/public/editions/";

function extractStoragePath(url) {
  if (typeof url !== "string") return null;
  const idx = url.indexOf(PREFIX);
  if (idx < 0) return null;
  return url.slice(idx + PREFIX.length);
}

async function listAll(folder) {
  const out = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(folder, { limit, offset, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw new Error(`list(${folder}): ${error.message}`);
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

  const referenced = new Set();
  for (const v of versions || []) {
    for (const url of [v.cover_url, v.pdf_url]) {
      const p = extractStoragePath(url);
      if (p) referenced.add(p);
      else if (url) console.log(`  · ref externa/ignorada (${v.language}): ${String(url).slice(0, 80)}`);
    }
  }
  console.log(`referencias en edition_languages: ${referenced.size}`);

  // 2) Archivos reales en storage
  const storageFiles = [...(await listAll("covers")), ...(await listAll("pdfs"))];
  console.log(`archivos en storage: ${storageFiles.length} (covers+pdfs)`);

  // 3) Diferencia
  const orphans = storageFiles.filter((p) => !referenced.has(p));
  const missing = [...referenced].filter((p) => !storageFiles.includes(p));

  if (orphans.length === 0) {
    console.log("\n✓ Sin huérfanos. Storage limpio.");
  } else {
    console.log(`\nhuérfanos detectados: ${orphans.length}`);
    for (const p of orphans) console.log(`  ✗ ${p}`);
  }
  if (missing.length > 0) {
    console.log(`\n⚠ referencias rotas (en DB pero no en storage): ${missing.length}`);
    for (const p of missing) console.log(`  ! ${p}`);
  }

  if (!real || orphans.length === 0) {
    console.log("\nListo. Corré con --real para borrar los huérfanos.");
    return;
  }

  const { error: rmError } = await supabase.storage.from(BUCKET).remove(orphans);
  if (rmError) {
    console.error("\nError borrando:", rmError.message);
    process.exit(1);
  }
  console.log(`\n✓ Borrados ${orphans.length} huérfanos.`);
}

main().catch((err) => {
  console.error("\n💥 Error fatal:", err);
  process.exit(1);
});
