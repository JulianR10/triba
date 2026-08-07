const FALLBACK_SITE_URL = "https://universotriba.com";

export const SITE_URL = import.meta.env.SITE || FALLBACK_SITE_URL;

export function getSiteOrigin(): string {
  return SITE_URL;
}
