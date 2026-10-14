/**
 * Migra los PDFs del bucket público `editions` al privado `editions-pdfs`.
 *
 * - Por defecto DRY-RUN: lista qué haría sin cambiar nada.
 * - Con --real: copia bytes (vía URL pública actual) a editions-pdfs con el
 *   mismo path, verifica tamaño y reescribe pdf_url a
 *   `storage://editions-pdfs/<path>`.
 * - Con --real --delete-old: tras verificar que no quedan referencias legacy,
 *   borra pdfs/* del bucket público `editions`. Paso destructivo separado a
 *   propósito: ejecutarlo solo cuando /api/pdf ya sirve todo desde el privado.
 *
 * Requires in .env: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const real = process.argv.includes("--real");
const deleteOld = process.argv.includes("--delete-old");
const LEGACY_PREFIX = "/storage/v1/object/public/editions/";
const PDF_BUCKET = "editions-pdfs";
const PUBLIC_BUCKET = "editions";

function legacyPath(url) {
  if (typeof url !== "string") return null;
  const idx = url.indexOf(LEGACY_PREFIX);
  if (idx < 0) return null;
  return url.slice(idx + LEGACY_PREFIX.length);
}

async function listAll(bucket, folder) {
  const out = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, { limit, offset, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw new Error(`list(${bucket}/${folder}): ${error.message}`);
    if (!data || data.length === 0) break;
    for (const f of data) {
      if (f.id !== null) out.push(`${folder}/${f.name}`);
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

async function main() {
  console.log(`modo: ${real ? "REAL" : "DRY-RUN"}${deleteOld ? " + delete-old" : ""}`);

  const { data: versions, error } = await supabase
    .from("edition_languages")
    .select("id, edition_id, language, pdf_url");
  if (error) {
    console.error("select edition_languages:", error.message);
    process.exit(1);
  }

  const pending = (versions || [])
    .map((v) => ({ ...v, path: legacyPath(v.pdf_url) }))
    .filter((v) => v.path);
  const already = (versions || []).length - pending.length;
  console.log(`filas con pdf_url legacy: ${pending.length} (ya migradas u otras: ${already})`);

  if (deleteOld) {
    if (pending.length > 0) {
      console.error("✗ quedan referencias legacy: corré primero sin --delete-old.");
      process.exit(1);
    }
    const oldPdfs = await listAll(PUBLIC_BUCKET, "pdfs");
    console.log(`pdfs en bucket público: ${oldPdfs.length}`);
    if (oldPdfs.length === 0) {
      console.log("✓ Nada que borrar.");
      return;
    }
    if (!real) {
      for (const p of oldPdfs) console.log(`  ✗ borraría ${p}`);
      console.log("\nListo. Agregá --real para borrar.");
      return;
    }
    const { error: rmError } = await supabase.storage.from(PUBLIC_BUCKET).remove(oldPdfs);
    if (rmError) {
      console.error("Error borrando:", rmError.message);
      process.exit(1);
    }
    console.log(`✓ Borrados ${oldPdfs.length} PDFs del bucket público.`);
    return;
  }

  let migrated = 0;
  for (const v of pending) {
    const label = `edition_id=${v.edition_id} lang=${v.language} ${v.path}`;
    if (!real) {
      console.log(`  · migraría ${label}`);
      continue;
    }
    // 1) bajar bytes por URL pública actual
    const dl = await fetch(v.pdf_url);
    if (!dl.ok) {
      console.error(`  ✗ ${label}: descarga HTTP ${dl.status}`);
      continue;
    }
    const bytes = new Uint8Array(await dl.arrayBuffer());
    if (bytes.length === 0) {
      console.error(`  ✗ ${label}: descarga vacía`);
      continue;
    }
    // 2) subir al privado (mismo path)
    const { error: upError } = await supabase.storage
      .from(PDF_BUCKET)
      .upload(v.path, bytes, { contentType: "application/pdf", upsert: true });
    if (upError) {
      console.error(`  ✗ ${label}: upload: ${upError.message}`);
      continue;
    }
    // 3) verificar tamaño en destino
    const { data: info, error: infoError } = await supabase.storage.from(PDF_BUCKET).info(v.path);
    const size = info?.size ?? info?.metadata?.size;
    if (infoError || size !== bytes.length) {
      console.error(`  ✗ ${label}: tamaño destino ${size} != origen ${bytes.length}`);
      continue;
    }
    // 4) reescribir referencia
    const { error: updError } = await supabase
      .from("edition_languages")
      .update({ pdf_url: `storage://${PDF_BUCKET}/${v.path}` })
      .eq("id", v.id);
    if (updError) {
      console.error(`  ✗ ${label}: update DB: ${updError.message}`);
      continue;
    }
    migrated += 1;
    console.log(`  ✓ ${label} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
  }

  console.log(real ? `\n✓ Migradas ${migrated}/${pending.length}.` : `\nListo. Corré con --real para migrar.`);
}

main().catch((err) => {
  console.error("\n💥 Error fatal:", err);
  process.exit(1);
});
