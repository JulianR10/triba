import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase-server";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { error } from "../../../lib/response";
import { parseStoredFileRef } from "../../../lib/storage";
import { isActiveSubscription } from "../../../lib/subscription-status";
import { logger } from "../../../lib/logger";
import { enforceRateLimit } from "../../../lib/rate-limit";

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
  const limited = await enforceRateLimit(request, "pdf", {
    maxRequests: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

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

  // storage://editions-pdfs/... (nuevo) o URL pública legacy del bucket
  // editions (pre-backfill): en ambos casos se firma desde el bucket real.
  const ref = parseStoredFileRef(version.pdf_url);
  if (!ref) {
    return new Response(null, {
      status: 302,
      headers: { Location: version.pdf_url },
    });
  }
  const storagePath = ref.path;

  const serverSupabase = createSupabaseServerClient(request);
  const { data: { session } } = await serverSupabase.auth.getSession();
  const user = session?.user ?? null;

  let allowed = false;

  // P7: preferir gate centralizado del middleware (locals) si está disponible
  const localsHasActive = (locals as any)?.hasActiveSub as boolean | undefined;
  const localsProfile = (locals as any)?.profile as import("../../../lib/types").Profile | null | undefined;
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
    const lang = url.searchParams.get("lang") === "en" ? "en" : "es";
    // El visor pide el PDF por fetch (no navega): un 302 a una página HTML terminaba en
    // "Invalid PDF structure". Para pedidos de datos se responde un error con código; la
    // navegación directa (botón "Descargar") sigue redirigiendo al login / a suscribirse.
    const isNavigation =
      request.headers.get("sec-fetch-mode") === "navigate" || request.headers.get("sec-fetch-dest") === "document";
    if (!isNavigation && request.headers.has("sec-fetch-mode")) {
      return new Response(
        JSON.stringify(
          user
            ? { error: "Necesitás una suscripción activa para leer este archivo.", code: "subscription_required" }
            : { error: "Iniciá sesión para leer este archivo.", code: "login_required" },
        ),
        { status: user ? 403 : 401, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
      );
    }
    if (!user) {
      const original = `${url.pathname}${url.search}`;
      const loginPath = lang === "en" ? "/en/iniciar-sesion" : "/iniciar-sesion";
      return new Response(null, {
        status: 302,
        headers: { Location: `${loginPath}?redirect=${encodeURIComponent(original)}` },
      });
    }
    return new Response(null, {
      status: 302,
      headers: { Location: lang === "en" ? "/en/suscribirme" : "/suscribirme" },
    });
  }

  const isDownload = url.searchParams.get("download") === "1";

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from(ref.bucket)
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