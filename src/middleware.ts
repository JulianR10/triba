import { defineMiddleware } from "astro/middleware";
import { createSupabaseServerClient } from "./lib/supabase-server";
import { supabaseAdmin } from "./lib/supabase-admin";
import type { Profile } from "./lib/types";

const supabaseUrl =
  import.meta.env.PUBLIC_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL ||
  "";
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : "";
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createSupabaseServerClient(context.request);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const pathname = context.url.pathname;
  const isAdminRoute =
    pathname.startsWith("/admin") || pathname.startsWith("/api/admin");

  let profile: Profile | null = null;
  if (user && isAdminRoute) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = (data as Profile | null) ?? null;
  }

  context.locals.supabase = supabase;
  context.locals.user = user;
  context.locals.profile = profile;

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

  const response = await next();

  if (response.headers.get("content-type")?.startsWith("text/html")) {
    const ct = response.headers.get("content-type");
    if (ct && !ct.includes("charset=")) {
      response.headers.set("content-type", "text/html; charset=utf-8");
    }

    const connectDomains = [
      "'self'",
      "https://api.stripe.com",
      ...(supabaseOrigin
        ? [supabaseOrigin, `wss://${supabaseHost}`, `https://${supabaseHost}`]
        : []),
    ];

    const imgDomains = [
      "'self'",
      "data:",
      ...(supabaseOrigin
        ? [
            `${supabaseOrigin}/storage/v1/storage/file/`,
            `${supabaseOrigin}/storage/v1/object/public/`,
          ]
        : []),
    ];

    response.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        `img-src ${imgDomains.join(" ")}`,
        `connect-src ${connectDomains.join(" ")}`,
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ")
    );

    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  }

  return response;
});
