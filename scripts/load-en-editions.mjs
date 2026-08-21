#!/usr/bin/env node
// Upsert EN versions of the 4 magazine editions.
// Usage: node --env-file=.env scripts/load-en-editions.mjs [--real]
// Dry-run by default (no writes). Mirrors convention in repo scripts.
import { createClient } from "@supabase/supabase-js";

const DRY = !process.argv.includes("--real");

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key);

/** Drafts approved 2026-08-21. Covers/PDFs inherited via resolveEditionView fallback. */
const EN_VERSIONS = [
  {
    edition_id: 1,
    edition_number: 1,
    language: "en",
    title: "Life starts many times",
    description:
      "We\u2019re thrilled to launch our very first issue with you \u2014 and to bring to life a dream we\u2019ve been working toward for so many months! The Triba universe is opening its doors and can\u2019t wait to welcome you all. We hope you enjoy the read!",
    cover_url: null,
    pdf_url: null,
    badge: null,
  },
  {
    edition_id: 2,
    edition_number: 2,
    language: "en",
    title: "We create because we believe",
    description:
      "Our second issue is here, bringing with it the joy of sharing the 16 articles waiting for you inside. For the first time, some of you join in as Triba Creators, writing and designing some of the columns. \u201CWe create because we believe\u201D reinforces the challenge we started on Instagram and reminds us to trust our own art and voice. We hope you enjoy this issue as much as we enjoyed making it.",
    cover_url: null,
    pdf_url: null,
    badge: null,
  },
  {
    edition_id: 3,
    edition_number: 3,
    language: "en",
    title: "The show must go on",
    description:
      "We\u2019re so happy to share our third issue with you! Featuring our founding contributors and a few Triba Creators joining us this month. \u201CThe show must go on\u201D reminds us who we were and who we are today, across 15 different but equally inspiring articles. We hope you enjoy the read \u2014 see you next month!",
    cover_url: null,
    pdf_url: null,
    badge: "Latest issue",
  },
  {
    edition_id: 11,
    edition_number: 4,
    language: "en",
    title: "SLOW AND STEADY",
    description:
      "Our fourth issue reminds us how important it is to slow down and enjoy the process \u2014 while keeping ourselves in motion toward our goal. We hope you enjoy reading it as much as we enjoyed sharing it with you. See you in the next one :)",
    cover_url: null,
    pdf_url: null,
    badge: "Latest issue",
  },
];

console.log(DRY ? "[dry-run] Would upsert EN versions:" : "[real] Upserting EN versions:");
for (const v of EN_VERSIONS) console.log(`  #${v.edition_number} (edition_id=${v.edition_id}) title=${JSON.stringify(v.title)} badge=${JSON.stringify(v.badge)}`);

if (DRY) {
  console.log("\nAdd --real to apply.");
  process.exit(0);
}

for (const v of EN_VERSIONS) {
  const { edition_number: _n, ...row } = v;
  const { error } = await supabase
    .from("edition_languages")
    .upsert(row, { onConflict: "edition_id,language" });
  if (error) {
    console.error(`  #${v.edition_number} failed:`, error.message);
    process.exit(1);
  }
  console.log(`  #${v.edition_number} upserted`);
}

const { data: check } = await supabase
  .from("edition_languages")
  .select("edition_id,language,title,cover_url,pdf_url,badge")
  .in("edition_id", EN_VERSIONS.map((v) => v.edition_id))
  .order("edition_id");
console.log("\nCurrent edition_languages:");
for (const r of check ?? []) console.log(`  edition_id=${r.edition_id} lang=${r.language} title=${JSON.stringify(r.title)} badge=${JSON.stringify(r.badge)} cover=${r.cover_url ? "✓" : "null"} pdf=${r.pdf_url ? "✓" : "null"}`);
console.log("\nDone.");
