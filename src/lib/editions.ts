import { supabase } from "./supabase";

export type EditionKind = "magazine" | "free";

export interface Edition {
  id: number;
  edition_number: number | null;
  title: string;
  description: string;
  cover_url: string | null;
  pdf_url: string | null;
  featured: boolean;
  badge: string | null;
  kind: EditionKind;
  published_at: string;
  created_at: string;
}

export async function getEditions(): Promise<Edition[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("editions")
    .select("*")
    .eq("kind", "magazine")
    .order("edition_number", { ascending: false });
  return (data as Edition[]) || [];
}

export async function getFeaturedEdition(): Promise<Edition | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("editions")
    .select("*")
    .eq("kind", "magazine")
    .eq("featured", true)
    .single();
  return data as Edition | null;
}

export async function getFreeArticle(): Promise<Edition | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("editions")
    .select("*")
    .eq("kind", "free")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Edition | null;
}

export async function getEditionBySlug(slug: string): Promise<Edition | null> {
  if (!supabase) return null;
  const editionNumber = parseInt(slug.replace("edicion-", ""), 10);
  const { data } = await supabase
    .from("editions")
    .select("*")
    .eq("kind", "magazine")
    .eq("edition_number", editionNumber)
    .single();
  return data as Edition | null;
}


