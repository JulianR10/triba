import { supabase } from "./supabase";
import { supabaseAdmin } from "./supabase-admin";

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
}

export interface EditionPage {
  id: number;
  edition_id: number;
  page_number: number;
  image_url: string;
  alt_text: string;
}

export async function getEditions(): Promise<Edition[]> {
  const { data } = await supabase
    .from("editions")
    .select("*")
    .order("edition_number", { ascending: false });
  return (data as Edition[]) || [];
}

export async function getFeaturedEdition(): Promise<Edition | null> {
  const { data } = await supabase
    .from("editions")
    .select("*")
    .eq("featured", true)
    .single();
  return data as Edition | null;
}

export async function getEditionBySlug(slug: string): Promise<Edition | null> {
  const editionNumber = parseInt(slug.replace("edicion-", ""), 10);
  const { data } = await supabase
    .from("editions")
    .select("*")
    .eq("edition_number", editionNumber)
    .single();
  return data as Edition | null;
}

export async function getEditionPages(
  editionId: number
): Promise<EditionPage[]> {
  const { data } = await supabase
    .from("edition_pages")
    .select("*")
    .eq("edition_id", editionId)
    .order("page_number", { ascending: true });
  return (data as EditionPage[]) || [];
}
