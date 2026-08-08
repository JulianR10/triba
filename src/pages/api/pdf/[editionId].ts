import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase-server";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { error } from "../../../lib/response";
import { extractStoragePath } from "../../../lib/storage";
import { isActiveSubscription } from "../../../lib/subscription-status";
import { logger } from "../../../lib/logger";

const BUCKET = "editions";

export const prerender = false;

export const GET: APIRoute = async ({ params, request, url }) => {
  const editionId = Number(params.editionId);
  if (!Number.isInteger(editionId)) {
    return error("ID inválido", 400);
  }

  const { data: edition, error: fetchError } = await supabaseAdmin
    .from("editions")
    .select("id, pdf_url, featured, kind, edition_number, title")
    .eq("id", editionId)
    .single();

  if (fetchError || !edition) {
    return error("Edición no encontrada", 404);
  }

  if (!edition.pdf_url) {
    return error("Esta edición no tiene PDF", 404);
  }

  const storagePath = extractStoragePath(edition.pdf_url);
  if (!storagePath) {
    return new Response(null, {
      status: 302,
      headers: { Location: edition.pdf_url },
    });
  }

  const serverSupabase = createSupabaseServerClient(request);
  const { data: { session } } = await serverSupabase.auth.getSession();
  const user = session?.user ?? null;

  let allowed = false;

  if (user) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, subscription_id")
      .eq("id", user.id)
      .single();

    if (profile?.role === "admin") {
      allowed = true;
    } else if (profile?.role === "subscriber" && profile?.subscription_id) {
      const { data: sub } = await supabaseAdmin
        .from("subscriptions")
        .select("status")
        .eq("id", profile.subscription_id)
        .single();
      if (isActiveSubscription(sub?.status)) {
        allowed = true;
      }
    }
  }

  if (!allowed && (edition.featured || edition.kind === "free")) {
    allowed = true;
  }

  if (!allowed) {
    return error("No autorizada. Suscribite para acceder al PDF completo.", 401);
  }

  const isDownload = url.searchParams.get("download") === "1";

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 5, {
      download: isDownload,
    });

  if (signedError || !signed) {
    logger.error({ err: signedError, editionId }, "Error generating signed URL");
    return error("Error generando enlace de descarga", 500);
  }

  return new Response(null, {
    status: 302,
    headers: { Location: signed.signedUrl },
  });
};
