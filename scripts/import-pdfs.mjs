/**
 * Importa los PDFs de los 3 tomos a Supabase:
 *  - Extrae portada (1er página) como PNG
 *  - Sube portada y PDF a Storage
 *  - Actualiza o crea registro en la tabla editions
 *  - Marca el último como destacado
 *
 * Usage:
 *   node --env-file=.env scripts/import-pdfs.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, unlinkSync } from "fs";
import { resolve } from "path";
import pdfPoppler from "pdf-poppler";

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}

const BUCKET = "editions";
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function fileExt(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

async function uploadFile(filePath, kind, editionNumber) {
  const ext = fileExt(filePath);
  const path = `${kind}s/edicion-${editionNumber}-${Date.now()}.${ext}`;
  const content = readFileSync(filePath);

  const { error } = await admin.storage.from(BUCKET).upload(path, content, {
    contentType: kind === "cover" ? "image/png" : "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(`Error subiendo ${kind}: ${error.message}`);

  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function extractCover(pdfPath, editionNumber) {
  const outDir = resolve(".");
  const prefix = `cover-tmp-${editionNumber}`;

  await pdfPoppler.convert(pdfPath, {
    format: "png",
    out_dir: outDir,
    out_prefix: prefix,
    page: 1,
    scale: 300,
  });

  return resolve(outDir, `${prefix}-01.png`);
}

const editions = [
  {
    file: "Tomo 1 - Triba.pdf",
    edition_number: 1,
    title: "Tomo 1",
    description: "Primera edición de Triba.",
    badge: null,
  },
  {
    file: "Tomo 2 - Triba.pdf",
    edition_number: 2,
    title: "Tomo 2",
    description: "Segunda edición de Triba.",
    badge: null,
  },
  {
    file: "Tomo 3 - Triba.pdf",
    edition_number: 3,
    title: "Tomo 3",
    description: "Tercera edición de Triba.",
    badge: "Última edición",
    featured: true,
  },
];

async function main() {
  console.log("=== Importando ediciones ===\n");

  // Demote all featured first to avoid constraint conflict
  await admin.from("editions").update({ featured: false }).eq("featured", true);

  for (const ed of editions) {
    console.log(`[${ed.edition_number}/3] Procesando "${ed.file}"...`);

    const pdfPath = resolve(ed.file);

    // 1. Extract cover (first page as PNG)
    console.log(`     Extrayendo portada...`);
    const coverPath = await extractCover(pdfPath, ed.edition_number);

    // 2. Upload cover
    console.log(`     Subiendo portada...`);
    const coverUrl = await uploadFile(coverPath, "cover", ed.edition_number);
    unlinkSync(coverPath);

    // 3. Upload PDF
    console.log(`     Subiendo PDF...`);
    const pdfUrl = await uploadFile(pdfPath, "pdf", ed.edition_number);

    // 4. Check if edition exists by edition_number
    const { data: existing } = await admin
      .from("editions")
      .select("id")
      .eq("edition_number", ed.edition_number)
      .maybeSingle();

    if (existing) {
      // Update existing record
      console.log(`     Actualizando edición existente (id=${existing.id})...`);
      const { error } = await admin
        .from("editions")
        .update({
          title: ed.title,
          description: ed.description,
          cover_url: coverUrl,
          pdf_url: pdfUrl,
          featured: ed.featured || false,
          badge: ed.badge || null,
        })
        .eq("id", existing.id);

      if (error) {
        console.error(`     ERROR: ${error.message}`);
        continue;
      }
      console.log(`     OK: actualizada`);
    } else {
      // Insert new record
      console.log(`     Creando nueva edición...`);
      const { data, error } = await admin
        .from("editions")
        .insert({
          edition_number: ed.edition_number,
          title: ed.title,
          description: ed.description,
          cover_url: coverUrl,
          pdf_url: pdfUrl,
          featured: ed.featured || false,
          badge: ed.badge || null,
        })
        .select("id")
        .single();

      if (error) {
        console.error(`     ERROR: ${error.message}`);
        continue;
      }
      console.log(`     OK: id=${data.id}`);
    }

    console.log(`     Cover: ${coverUrl}`);
    console.log(`     PDF:   ${pdfUrl}`);
    console.log();
  }

  // Ensure only edition 3 is featured
  await admin.from("editions").update({ featured: true }).eq("edition_number", 3);
  await admin.from("editions").update({ featured: false }).eq("featured", true).neq("edition_number", 3);

  console.log("=== Importación completada ===");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
