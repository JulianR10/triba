import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { supabaseAdmin } from "../../lib/supabase-admin";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const user = auth.user;

  let locale: unknown;
  try {
    const body = await request.json();
    locale = body?.locale;
  } catch {
    return error("Body inválido", 400);
  }

  if (locale !== "es" && locale !== "en") {
    return error("Locale inválido", 400);
  }

  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ preferred_locale: locale })
    .eq("id", user.id);

  if (updateError) {
    console.error(`[locale] update error for ${user.id}:`, updateError);
    return error(updateError.message, 500);
  }

  return ok();
};