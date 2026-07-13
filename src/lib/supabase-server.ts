import { createServerClient } from "@supabase/ssr";

export function createSupabaseServerClient(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";

  return createServerClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieHeader.split(";").reduce<{ name: string; value: string }[]>(
            (acc, pair) => {
              const i = pair.indexOf("=");
              if (i > 0) {
                acc.push({
                  name: pair.slice(0, i).trim(),
                  value: pair.slice(i + 1).trim(),
                });
              }
              return acc;
            },
            []
          );
        },
        setAll(cookiesToSet) {
          // No-op: cookies are set via response headers in Astro
        },
      },
    }
  );
}
