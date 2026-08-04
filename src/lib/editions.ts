import { supabase } from "./supabase";

export interface Edition {
  id: number;
  edition_number: number;
  title: string;
  description: string;
  cover_url: string;
  pdf_url: string | null;
  featured: boolean;
  badge: string | null;
  published_at: string;
  created_at: string;
}

export async function getEditions(): Promise<Edition[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("editions")
    .select("*")
    .order("edition_number", { ascending: false });
  return (data as Edition[]) || [];
}

export async function getFeaturedEdition(): Promise<Edition | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("editions")
    .select("*")
    .eq("featured", true)
    .single();
  return data as Edition | null;
}

export async function getEditionBySlug(slug: string): Promise<Edition | null> {
  if (!supabase) return null;
  const editionNumber = parseInt(slug.replace("edicion-", ""), 10);
  const { data } = await supabase
    .from("editions")
    .select("*")
    .eq("edition_number", editionNumber)
    .single();
  return data as Edition | null;
}


