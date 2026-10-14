import { supabase } from "./supabase";

export type EditionKind = "magazine" | "free";
export type EditionLanguage = "es" | "en";

export const EDITION_LANGUAGES: EditionLanguage[] = ["es", "en"];
export const DEFAULT_LANGUAGE: EditionLanguage = "es";

export interface Edition {
  id: number;
  edition_number: number | null;
  featured: boolean;
  kind: EditionKind;
  published_at: string;
  created_at: string;
}

export interface EditionVersion {
  id: number;
  edition_id: number;
  language: EditionLanguage;
  title: string;
  description: string;
  cover_url: string | null;
  /** Nunca se expone al cliente anónimo: solo el servidor resuelve la URL vía /api/pdf. */
  pdf_url: string | null;
  badge: string | null;
  created_at: string;
}

interface CatalogRow {
  version_id: number;
  edition_id: number;
  language: EditionLanguage;
  edition_number: number | null;
  featured: boolean;
  kind: EditionKind;
  published_at: string;
  created_at: string;
  title: string;
  description: string;
  cover_url: string | null;
  badge: string | null;
  has_pdf: boolean;
}

/**
 * An issue resolved for a given language: the issue fields plus the picked
 * version's content. `isFallback` is true when the requested language version
 * does not exist yet and we fell back to another one (es). `hasEn` tells whether
 * the issue has an English version at all (drives the ES/EN toggle).
 */
export interface EditionView extends Edition {
  versionId: number | null;
  language: EditionLanguage;
  title: string;
  description: string;
  cover_url: string | null;
  /** Siempre null en el cliente público; usar hasPdf + /api/pdf/{versionId}. */
  pdf_url: string | null;
  hasPdf: boolean;
  badge: string | null;
  isFallback: boolean;
  hasEn: boolean;
}

interface VersionLike {
  id: number;
  language: EditionLanguage;
  title: string;
  description: string;
  cover_url: string | null;
  badge: string | null;
}

function defaultTitle(issue: Edition): string {
  if (issue.kind === "free") return "Artículo gratuito";
  return issue.edition_number ? `Edición ${issue.edition_number}` : "Edición";
}

function catalogRowToVersion(row: CatalogRow): VersionLike {
  return {
    id: row.version_id,
    language: row.language,
    title: row.title,
    description: row.description,
    cover_url: row.cover_url,
    badge: row.badge,
  };
}

export function resolveEditionView(
  issue: Edition,
  versions: VersionLike[],
  lang: EditionLanguage = DEFAULT_LANGUAGE,
  hasPdf = false
): EditionView {
  const requested = versions.find((v) => v.language === lang);
  const es = versions.find((v) => v.language === DEFAULT_LANGUAGE);
  const picked = requested ?? es ?? null;
  return {
    ...issue,
    versionId: picked?.id ?? null,
    language: picked?.language ?? lang,
    title: picked?.title ?? defaultTitle(issue),
    description: picked?.description ?? "",
    cover_url: picked?.cover_url ?? es?.cover_url ?? null,
    pdf_url: null,
    hasPdf,
    badge: picked?.badge ?? null,
    isFallback: !requested && !!picked,
    hasEn: versions.some((v) => v.language === "en"),
  };
}

async function attachVersions(
  issues: Edition[],
  lang: EditionLanguage
): Promise<EditionView[]> {
  if (!issues.length) return [];
  const ids = issues.map((i) => i.id);
  // Catálogo público sin pdf_url (migración 030): la URL real solo vive en
  // edition_languages y la resuelve el servidor vía /api/pdf.
  // Fallback a edition_languages si la vista aún no existe (030 sin aplicar):
  // corre solo en el servidor (frontmatter) y nunca expone pdf_url al HTML.
  const { data, error } = await supabase!
    .from("public_edition_catalog")
    .select("version_id, edition_id, language, title, description, cover_url, badge, has_pdf")
    .in("edition_id", ids);

  if (!error) {
    const rows = (data ?? []) as Pick<CatalogRow, "version_id" | "edition_id" | "language" | "title" | "description" | "cover_url" | "badge" | "has_pdf">[];
    const byEdition = new Map<number, CatalogRow[]>();
    for (const r of rows) {
      const arr = byEdition.get(r.edition_id) ?? [];
      arr.push(r as CatalogRow);
      byEdition.set(r.edition_id, arr);
    }
    return issues.map((issue) => {
      const versions = byEdition.get(issue.id) ?? [];
      const hasPdf = versions.some((v) => v.has_pdf);
      return resolveEditionView(issue, versions.map(catalogRowToVersion), lang, hasPdf);
    });
  }

  const { data: legacy } = await supabase!
    .from("edition_languages")
    .select("id, edition_id, language, title, description, cover_url, badge, pdf_url")
    .in("edition_id", ids);
  const legacyRows = (legacy ?? []) as (VersionLike & { edition_id: number; pdf_url: string | null })[];
  const byEdition = new Map<number, (VersionLike & { pdf_url: string | null })[]>();
  for (const v of legacyRows) {
    const arr = byEdition.get(v.edition_id) ?? [];
    arr.push(v);
    byEdition.set(v.edition_id, arr);
  }
  return issues.map((issue) => {
    const versions = byEdition.get(issue.id) ?? [];
    const hasPdf = versions.some((v) => !!v.pdf_url);
    return resolveEditionView(issue, versions, lang, hasPdf);
  });
}

export async function getEditions(lang: EditionLanguage = DEFAULT_LANGUAGE): Promise<EditionView[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("editions")
    .select("id, edition_number, featured, kind, published_at, created_at")
    .eq("kind", "magazine")
    .order("edition_number", { ascending: false });
  return attachVersions((data as Edition[] | null) ?? [], lang);
}

export async function getFeaturedEdition(lang: EditionLanguage = DEFAULT_LANGUAGE): Promise<EditionView | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("editions")
    .select("id, edition_number, featured, kind, published_at, created_at")
    .eq("kind", "magazine")
    .eq("featured", true)
    .single();
  if (!data) return null;
  const [view] = await attachVersions([data as Edition], lang);
  return view ?? null;
}

export async function getFreeArticle(lang: EditionLanguage = DEFAULT_LANGUAGE): Promise<EditionView | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("editions")
    .select("id, edition_number, featured, kind, published_at, created_at")
    .eq("kind", "free")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const [view] = await attachVersions([data as Edition], lang);
  return view ?? null;
}

export async function getEditionBySlug(slug: string, lang: EditionLanguage = DEFAULT_LANGUAGE): Promise<EditionView | null> {
  if (!supabase) return null;
  const editionNumber = parseInt(slug.replace("edicion-", ""), 10);
  const { data } = await supabase
    .from("editions")
    .select("id, edition_number, featured, kind, published_at, created_at")
    .eq("kind", "magazine")
    .eq("edition_number", editionNumber)
    .maybeSingle();
  if (!data) return null;
  const [view] = await attachVersions([data as Edition], lang);
  return view ?? null;
}

export async function getEditionLanguages(editionId: number): Promise<EditionVersion[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("public_edition_catalog")
    .select("version_id, edition_id, language, title, description, cover_url, badge")
    .eq("edition_id", editionId)
    .order("language", { ascending: true });
  if (!error) {
    return ((data ?? []) as { version_id: number; edition_id: number; language: EditionLanguage; title: string; description: string; cover_url: string | null; badge: string | null }[]).map((r) => ({
      id: r.version_id,
      edition_id: r.edition_id,
      language: r.language,
      title: r.title,
      description: r.description,
      cover_url: r.cover_url,
      pdf_url: null,
      badge: r.badge,
      created_at: "",
    }));
  }
  // Fallback pre-030 (solo servidor, sin exponer pdf_url).
  const { data: legacy } = await supabase
    .from("edition_languages")
    .select("id, edition_id, language, title, description, cover_url, badge, pdf_url")
    .eq("edition_id", editionId)
    .order("language", { ascending: true });
  return ((legacy ?? []) as { id: number; edition_id: number; language: EditionLanguage; title: string; description: string; cover_url: string | null; badge: string | null }[]).map((r) => ({
    id: r.id,
    edition_id: r.edition_id,
    language: r.language,
    title: r.title,
    description: r.description,
    cover_url: r.cover_url,
    pdf_url: null,
    badge: r.badge,
    created_at: "",
  }));
}