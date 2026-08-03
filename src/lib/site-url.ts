const FALLBACK_SITE_URL = "https://www.comunidadtriba.com";

export function getSiteOrigin(request: Request): string {
  try {
    const origin = new URL(request.url).origin;
    if (origin && origin !== "null") return origin;
  } catch {
    // fall through to env / fallback
  }

  return (
    import.meta.env.PUBLIC_SITE_URL ||
    import.meta.env.SITE_URL ||
    FALLBACK_SITE_URL
  );
}
