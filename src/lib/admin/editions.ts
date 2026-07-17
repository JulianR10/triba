import { supabaseAdmin } from "../supabase-admin";
import type { Edition, EditionPage } from "../editions";

export interface AdminEditionRow extends Edition {
  pages_count: number;
  pdf_size_hint?: string | null;
}

export async function listEditionsForAdmin(): Promise<AdminEditionRow[]> {
  const { data: editions, error } = await supabaseAdmin
    .from("editions")
    .select("*")
    .order("edition_number", { ascending: false });
  if (error || !editions) return [];

  const { data: pages } = await supabaseAdmin
    .from("edition_pages")
    .select("edition_id");

  const counts = new Map<number, number>();
  for (const p of pages || []) {
    counts.set(p.edition_id, (counts.get(p.edition_id) || 0) + 1);
  }

  return (editions as Edition[]).map((e) => ({
    ...e,
    pages_count: counts.get(e.id) || 0,
  }));
}

export async function getEditionForAdmin(id: number): Promise<{
  edition: Edition;
  pages: EditionPage[];
} | null> {
  const { data: edition, error } = await supabaseAdmin
    .from("editions")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !edition) return null;

  const { data: pages } = await supabaseAdmin
    .from("edition_pages")
    .select("*")
    .eq("edition_id", id)
    .order("page_number", { ascending: true });

  return {
    edition: edition as Edition,
    pages: (pages as EditionPage[]) || [],
  };
}

export interface EditionInput {
  edition_number: number;
  title: string;
  description: string;
  cover_url: string;
  pdf_url: string | null;
  featured: boolean;
  badge: string | null;
}

export function validateEditionInput(
  input: Partial<EditionInput>,
): { ok: true; data: EditionInput } | { ok: false; error: string } {
  if (
    typeof input.edition_number !== "number" ||
    !Number.isInteger(input.edition_number) ||
    input.edition_number < 1
  ) {
    return { ok: false, error: "edition_number debe ser un entero positivo" };
  }
  if (typeof input.title !== "string" || !input.title.trim()) {
    return { ok: false, error: "title es obligatorio" };
  }
  if (typeof input.description !== "string" || !input.description.trim()) {
    return { ok: false, error: "description es obligatoria" };
  }
  if (typeof input.cover_url !== "string" || !input.cover_url.trim()) {
    return { ok: false, error: "cover_url es obligatorio" };
  }
  if (
    input.pdf_url !== null &&
    input.pdf_url !== undefined &&
    typeof input.pdf_url !== "string"
  ) {
    return { ok: false, error: "pdf_url debe ser string o null" };
  }

  return {
    ok: true,
    data: {
      edition_number: input.edition_number,
      title: input.title.trim(),
      description: input.description.trim(),
      cover_url: input.cover_url.trim(),
      pdf_url: input.pdf_url?.trim() || null,
      featured: !!input.featured,
      badge: input.badge?.trim() || null,
    },
  };
}
