import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createSupabaseServerClient(
  request: Request,
  responseHeaders?: Headers
) {
  const cookieHeader = request.headers.get("cookie") || "";

  return createServerClient<Database>(
    import.meta.env.PUBLIC_SUPABASE_URL!,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY!,
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
          if (!responseHeaders) return;
          cookiesToSet.forEach(({ name, value, options }) => {
            const secure = options?.secure ?? import.meta.env.PROD;
            const httpOnly = options?.httpOnly ?? true;
            const sameSite = options?.sameSite ?? "lax";
            const path = options?.path ?? "/";

            const parts = [`${name}=${value}`, `Path=${path}`];
            if (options?.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
            if (options?.expires) parts.push(`Expires=${new Date(options.expires).toUTCString()}`);
            if (httpOnly) parts.push("HttpOnly");
            if (secure) parts.push("Secure");
            if (sameSite) parts.push(`SameSite=${sameSite}`);

            responseHeaders.append("Set-Cookie", parts.join("; "));
          });
        },
      },
    }
  );
}
