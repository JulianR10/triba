import { supabaseAdmin } from "../supabase-admin";
import type { Edition, EditionKind, EditionLanguage } from "../editions";
import type { Database } from "../database.types";

type EditionLanguageRow = Database["public"]["Tables"]["edition_languages"]["Row"];

export interface AdminEditionRow extends Edition {
  versions: EditionLanguageRow[];
}

function orderIssues<T extends { edition_number: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.edition_number === null && b.edition_number === null) return 0;
    if (a.edition_number === null) return 1;
    if (b.edition_number === null) return -1;
    return b.edition_number - a.edition_number;
  });
}

export async function listEditionsForAdmin(): Promise<AdminEditionRow[]> {
  const { data: issues, error } = await supabaseAdmin
    .from("editions")
    .select("id, edition_number, featured, kind, published_at, created_at")
    .order("edition_number", { ascending: false });
  if (error || !issues) return [];

  const ids = issues.map((i) => i.id);
  const { data: languages } = await supabaseAdmin
    .from("edition_languages")
    .select("*")
    .in("edition_id", ids);

  const byEdition = new Map<number, EditionLanguageRow[]>();
  for (const v of (languages ?? []) as EditionLanguageRow[]) {
    const arr = byEdition.get(v.edition_id) ?? [];
    arr.push(v);
    byEdition.set(v.edition_id, arr);
  }

  return orderIssues(
    issues.map((issue) => ({ ...issue, versions: byEdition.get(issue.id) ?? [] }))
  );
}

export async function getEditionForAdmin(id: number): Promise<AdminEditionRow | null> {
  const { data: issue, error } = await supabaseAdmin
    .from("editions")
    .select("id, edition_number, featured, kind, published_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !issue) return null;

  const { data: languages } = await supabaseAdmin
    .from("edition_languages")
    .select("*")
    .eq("edition_id", id);

  return {
    ...issue,
    versions: (languages ?? []) as EditionLanguageRow[],
  };
}

export interface EditionVersionInput {
  title: string;
  description: string;
  cover_url: string | null;
  pdf_url: string | null;
  badge: string | null;
}

export interface EditionInput {
  edition_number: number | null;
  featured: boolean;
  kind: EditionKind;
  versions: Partial<Record<EditionLanguage, EditionVersionInput>>;
}

export function isEmptyVersion(v?: EditionVersionInput): boolean {
  if (!v) return true;
  return !(
    v.title ||
    v.description ||
    v.cover_url ||
    v.pdf_url ||
    v.badge
  );
}

/**
 * Reads the multilingual edition form (multipart) into an EditionInput.
 * `current` provides fallbacks for fields not present on PATCH (edit) submits.
 * English is optional: if its whole section is empty it is dropped.
 */
export function editionFormToInput(
  fd: FormData,
  current?: { kind?: EditionKind; edition_number?: number | null; featured?: boolean }
): EditionInput {
  const kind: EditionKind =
    fd.get("kind") === "free"
      ? "free"
      : fd.get("kind") === "magazine"
        ? "magazine"
        : (current?.kind ?? "magazine");

  const edition_number =
    kind === "free"
      ? null
      : fd.get("edition_number")
        ? Number(fd.get("edition_number"))
        : (current?.edition_number ?? null);

  const featured =
    kind === "free"
      ? false
      : fd.has("featured")
        ? fd.get("featured") === "true" || fd.get("featured") === "on"
        : (current?.featured ?? false);

  const read = (lang: EditionLanguage): EditionVersionInput => ({
    title: (fd.get(`${lang}_title`) as string) ?? "",
    description: (fd.get(`${lang}_description`) as string) ?? "",
    cover_url: (fd.get(`${lang}_cover_url`) as string) || null,
    pdf_url: (fd.get(`${lang}_pdf_url`) as string) || null,
    badge: (fd.get(`${lang}_badge`) as string) || null,
  });

  const es = read("es");
  const en = read("en");

  return {
    kind,
    edition_number,
    featured,
    versions: {
      es,
      ...(isEmptyVersion(en) ? {} : { en }),
    },
  };
}

export function validateEditionInput(
  input: EditionInput,
): { ok: true; data: EditionInput } | { ok: false; error: string } {
  const kind = input.kind === "free" ? "free" : "magazine";

  if (kind === "magazine") {
    if (
      typeof input.edition_number !== "number" ||
      !Number.isInteger(input.edition_number) ||
      input.edition_number < 1
    ) {
      return { ok: false, error: "edition_number debe ser un entero positivo" };
    }
  }

  const es = input.versions.es;
  if (!es) {
    return { ok: false, error: "La versión en español es obligatoria" };
  }
  if (!es.title?.trim()) {
    return { ok: false, error: "El título en español es obligatorio" };
  }
  if (kind === "magazine") {
    if (!es.description?.trim()) {
      return { ok: false, error: "La descripción en español es obligatoria" };
    }
    if (!es.cover_url?.trim()) {
      return { ok: false, error: "La portada en español es obligatoria" };
    }
  }
  if (kind === "free" && !es.pdf_url?.trim()) {
    return { ok: false, error: "Subí el PDF del artículo gratis (español)" };
  }

  const en = input.versions.en;
  if (en) {
    if (!en.title?.trim()) {
      return { ok: false, error: "El título en inglés es obligatorio (o vaciá toda la sección EN)" };
    }
    if (kind === "magazine") {
      if (!en.description?.trim()) {
        return { ok: false, error: "La descripción en inglés es obligatoria (o vaciá toda la sección EN)" };
      }
      if (!en.cover_url?.trim()) {
        return { ok: false, error: "La portada en inglés es obligatoria (o vaciá toda la sección EN)" };
      }
    }
    if (kind === "free" && !en.pdf_url?.trim()) {
      return { ok: false, error: "Subí el PDF del artículo gratis en inglés (o vaciá toda la sección EN)" };
    }
  }

  const normalize = (v: EditionVersionInput): EditionVersionInput => ({
    title: v.title.trim(),
    description: kind === "free" ? v.title.trim() : v.description.trim(),
    cover_url: v.cover_url?.trim() || null,
    pdf_url: v.pdf_url?.trim() || null,
    badge: v.badge?.trim() || null,
  });

  return {
    ok: true,
    data: {
      kind,
      edition_number: kind === "free" ? null : input.edition_number,
      featured: kind === "free" ? false : !!input.featured,
      versions: {
        es: normalize(es),
        ...(en ? { en: normalize(en) } : {}),
      },
    },
  };
}