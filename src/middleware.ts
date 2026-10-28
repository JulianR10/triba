import { defineMiddleware } from "astro/middleware";
import { createSupabaseServerClient } from "./lib/supabase-server";
import { supabaseAdmin } from "./lib/supabase-admin";
import type { Profile, Subscription } from "./lib/types";
import { isActiveSubscription } from "./lib/subscription-status";
import { getLocaleFromUrl } from "./i18n/locale";
import { DEFAULT_LOCALE, type Locale } from "./i18n/ui";

const supabaseUrl =
  import.meta.env.PUBLIC_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL ||
  "";
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : "";
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";

const CSP_CONNECT_SRC = [
  "'self'",
  "https://api.stripe.com",
  ...(supabaseOrigin ? [supabaseOrigin, `wss://${supabaseHost}`, `https://${supabaseHost}`] : []),
].join(" ");

const CSP_IMG_SRC = [
  "'self'",
  "data:",
  ...(supabaseOrigin
    ? [`${supabaseOrigin}/storage/v1/storage/file/`, `${supabaseOrigin}/storage/v1/object/public/`]
    : []),
].join(" ");

const CSP_BASE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function parseLocaleCookie(cookieHeader: string | null): Locale | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)triba_locale=(es|en)(?:;|$)/);
  return match ? (match[1] as Locale) : null;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createSupabaseServerClient(context.request);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  let user = session?.user ?? null;

  const pathname = context.url.pathname;

  // getSession() lee la cookie SIN verificar su firma: con una cookie armada a mano alcanzaba
  // conocer un UUID para pasar por esa persona. En las rutas donde la identidad decide acceso
  // (panel admin, PDF, Mi Cuenta) se verifica contra Supabase Auth; si falla, se trata como
  // sin sesión (falla cerrada). El resto de las páginas solo la usa para mostrar el menú.
  const needsVerifiedUser =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/pdf/") ||
    pathname === "/mi-cuenta" ||
    pathname === "/en/mi-cuenta";
  if (user && needsVerifiedUser) {
    const { data: verified, error: verifyError } = await supabase.auth.getUser();
    user = verifyError ? null : (verified.user ?? null);
  }
  const isAdminRoute =
    pathname.startsWith("/admin") || pathname.startsWith("/api/admin");

  // P7: gate centralizado — fetch profile+subscription once per request for any authenticated user
  let profile: Profile | null = null;
  let subscription: Subscription | null = null;
  let hasActiveSub = false;
  if (user) {
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = (p as Profile | null) ?? null;
    if (profile?.subscription_id) {
      const { data: s } = await supabaseAdmin
        .from("subscriptions")
        .select("*")
        .eq("id", profile.subscription_id)
        .single();
      subscription = (s as Subscription | null) ?? null;
      hasActiveSub = isActiveSubscription(subscription?.status, subscription?.current_period_end ?? undefined);
    }
  }

  context.locals.supabase = supabase;
  context.locals.user = user;
  context.locals.profile = profile;
  context.locals.subscription = subscription;
  context.locals.hasActiveSub = hasActiveSub;

  // The URL is authoritative for existing routes; the `triba_locale` cookie is
  // only a fallback (e.g. locale-neutral 404s) and the seed for Fase E
  // (emails by preferred_locale). Physical routes decide the rendered locale.
  const urlLocale = getLocaleFromUrl(context.url);
  const cookieLocale = parseLocaleCookie(context.request.headers.get("cookie"));
  context.locals.locale =
    urlLocale !== DEFAULT_LOCALE ? urlLocale : (cookieLocale ?? urlLocale);

  if (isAdminRoute) {
    if (!user) {
      if (pathname.startsWith("/api/")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return context.redirect(
        `/iniciar-sesion?redirect=${encodeURIComponent(pathname)}`,
        302
      );
    }
    if (!profile || profile.role !== "admin") {
      if (pathname.startsWith("/api/")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      return context.redirect("/", 302);
    }
  }

  // Mi Cuenta sin sesión (vencida, marcador): antes mostraba "Aún no estás suscripta" y un botón
  // de suscribirse, como si hubiera perdido la suscripción. Se pide iniciar sesión y se vuelve acá.
  if ((pathname === "/mi-cuenta" || pathname === "/en/mi-cuenta") && !user) {
    const loginPath = pathname.startsWith("/en/") ? "/en/iniciar-sesion" : "/iniciar-sesion";
    return context.redirect(
      `${loginPath}?redirect=${encodeURIComponent(pathname + context.url.search)}`,
      302,
    );
  }

  const response = await next();

  if (response.headers.get("content-type")?.startsWith("text/html")) {
    const ct = response.headers.get("content-type");
    if (ct && !ct.includes("charset=")) {
      response.headers.set("content-type", "text/html; charset=utf-8");
    }

    response.headers.set(
      "Content-Security-Policy",
      `${CSP_BASE}; img-src ${CSP_IMG_SRC}; connect-src ${CSP_CONNECT_SRC}`
    );

    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  }

  return response;
});
