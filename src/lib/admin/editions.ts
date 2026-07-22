import { supabaseAdmin } from "../supabase-admin";
import type { Edition } from "../editions";

export async function listEditionsForAdmin(): Promise<Edition[]> {
  const { data: editions, error } = await supabaseAdmin
    .from("editions")
    .select("*")
    .order("edition_number", { ascending: false });
  if (error || !editions) return [];
  return editions as Edition[];
}

export async function getEditionForAdmin(id: number): Promise<Edition | null> {
  const { data: edition, error } = await supabaseAdmin
    .from("editions")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !edition) return null;
  return edition as Edition;
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
