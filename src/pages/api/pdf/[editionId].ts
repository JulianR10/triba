import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase-server";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { error } from "../../../lib/response";
import { extractStoragePath } from "../../../lib/storage";
import { isActiveSubscription } from "../../../lib/subscription-status";
import { logger } from "../../../lib/logger";

const BUCKET = "editions";

export const prerender = false;

interface VersionWithIssue {
  id: number;
  edition_id: number;
  language: string;
  pdf_url: string | null;
  editions: {
    id: number;
    featured: boolean;
    kind: string;
    edition_number: number | null;
  } | null;
}

export const GET: APIRoute = async ({ params, request, url, locals }) => {
  const id = Number(params.editionId);
  if (!Number.isInteger(id)) {
    return error("ID inválido", 400);
  }

  // Resolve the localized version. `id` can be an edition_languages.id (new
  // links) OR a legacy editions.id (old emails/bookmarks). Keep both working.
  const { data: asVersion } = await supabaseAdmin
    .from("edition_languages")
    .select("id, edition_id, language, pdf_url, editions(id, featured, kind, edition_number)")
    .eq("id", id)
    .maybeSingle();

  let version = asVersion as VersionWithIssue | null;

  if (version && !version.pdf_url) {
    const { data: esFallback } = await supabaseAdmin
      .from("edition_languages")
      .select("id, edition_id, language, pdf_url, editions(id, featured, kind, edition_number)")
      .eq("edition_id", version.edition_id)
      .eq("language", "es")
      .maybeSingle();
    if (esFallback && (esFallback as VersionWithIssue).pdf_url) {
      version = { ...version, pdf_url: (esFallback as VersionWithIssue).pdf_url };
    }
  }

  if (!version) {
    const lang = url.searchParams.get("lang") === "en" ? "en" : "es";
    const { data: all } = await supabaseAdmin
      .from("edition_languages")
      .select("id, edition_id, language, pdf_url, editions(id, featured, kind, edition_number)")
      .eq("edition_id", id);
    const rows = (all ?? []) as VersionWithIssue[];
    version = rows.find((v) => v.language === lang) ?? rows.find((v) => v.language === "es") ?? null;
    if (version && !version.pdf_url) {
      const esFallback = rows.find((v) => v.language === "es" && v.pdf_url);
      if (esFallback) version = { ...version, pdf_url: esFallback.pdf_url };
    }
  }

  if (!version) {
    return error("Edición no encontrada", 404);
  }

  if (!version.pdf_url) {
    return error("Esta edición no tiene PDF", 404);
  }

  const storagePath = extractStoragePath(version.pdf_url);
  if (!storagePath) {
    return new Response(null, {
      status: 302,
      headers: { Location: version.pdf_url },
    });
  }

  const serverSupabase = createSupabaseServerClient(request);
  const { data: { session } } = await serverSupabase.auth.getSession();
  const user = session?.user ?? null;

  let allowed = false;

  // P7: preferir gate centralizado del middleware (locals) si está disponible
  const localsHasActive = (locals as any)?.hasActiveSub as boolean | undefined;
  const localsProfile = (locals as any)?.profile as import("../../../lib/types").Profile | null | undefined;
  const localsSub = (locals as any)?.subscription as import("../../../lib/types").Subscription | null | undefined;
  if (localsProfile !== undefined) {
    if (localsProfile?.role === "admin") allowed = true;
    else if (localsHasActive) allowed = true;
  } else if (user) {
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
        .select("status, current_period_end")
        .eq("id", profile.subscription_id)
        .single();
      if (isActiveSubscription(sub?.status, (sub as any)?.current_period_end ?? undefined)) {
        allowed = true;
      }
    }
  }

  if (!allowed && (version.editions?.featured || version.editions?.kind === "free")) {
    allowed = true;
  }

  if (!allowed) {
    if (!user) {
      const original = `${url.pathname}${url.search}`;
      return new Response(null, {
        status: 302,
        headers: { Location: `/iniciar-sesion?redirect=${encodeURIComponent(original)}` },
      });
    }
    return new Response(null, {
      status: 302,
      headers: { Location: "/suscribirme" },
    });
  }

  const isDownload = url.searchParams.get("download") === "1";

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 5, {
      download: isDownload,
    });

  if (signedError || !signed) {
    logger.error({ err: signedError, editionId: id }, "Error generating signed URL");
    return error("Error generando enlace de descarga", 500);
  }

  return new Response(null, {
    status: 302,
    headers: { Location: signed.signedUrl },
  });
};