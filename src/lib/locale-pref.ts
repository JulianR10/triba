import { supabaseAdmin } from "./supabase-admin";
import type { Locale } from "../i18n/ui";

export async function getPreferredLocale(userId?: string | null): Promise<Locale> {
  if (!userId) return "es";
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("preferred_locale")
    .eq("id", userId)
    .maybeSingle();
  return data?.preferred_locale === "en" ? "en" : "es";
}