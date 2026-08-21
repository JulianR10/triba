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
  pdf_url: string | null;
  badge: string | null;
  created_at: string;
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
  pdf_url: string | null;
  badge: string | null;
  isFallback: boolean;
  hasEn: boolean;
}

function defaultTitle(issue: Edition): string {
  if (issue.kind === "free") return "Artículo gratuito";
  return issue.edition_number ? `Edición ${issue.edition_number}` : "Edición";
}

export function resolveEditionView(
  issue: Edition,
  versions: EditionVersion[],
  lang: EditionLanguage = DEFAULT_LANGUAGE
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
    pdf_url: picked?.pdf_url ?? es?.pdf_url ?? null,
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
  const { data } = await supabase!
    .from("edition_languages")
    .select("id, edition_id, language, title, description, cover_url, pdf_url, badge, created_at")
    .in("edition_id", ids);

  const byEdition = new Map<number, EditionVersion[]>();
  for (const v of (data as EditionVersion[] | null) ?? []) {
    const arr = byEdition.get(v.edition_id) ?? [];
    arr.push(v);
    byEdition.set(v.edition_id, arr);
  }
  return issues.map((issue) =>
    resolveEditionView(issue, byEdition.get(issue.id) ?? [], lang)
  );
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
  const { data } = await supabase
    .from("edition_languages")
    .select("*")
    .eq("edition_id", editionId)
    .order("language", { ascending: true });
  return (data as EditionVersion[] | null) ?? [];
}