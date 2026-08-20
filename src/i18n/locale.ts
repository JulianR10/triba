import { DEFAULT_LOCALE, type Locale } from "./ui";

/**
 * Routes that currently ship an English version. Add the canonical ES path of
 * each translated page here; Navbar/Footer/switcher will then point them to
 * `/en/...` instead of falling back to the ES page. A route covers its
 * sub-paths too (`"/revista"` covers `/revista/edicion-3`).
 */
export const EN_ROUTES: ReadonlySet<string> = new Set([
  "/",
  "/revista",
  "/suscribirme",
  "/triba-creators",
  "/iniciar-sesion",
]);

export function isEnPath(pathname: string): boolean {
  return pathname === "/en" || pathname.startsWith("/en/");
}

/**
 * Whether the given ES canonical path (or any of its sub-paths) has an EN
 * version. Used by `localizePath`/`switchPath` instead of a bare Set lookup so
 * dynamic routes like `/revista/[slug]` resolve too.
 */
export function isEnRoute(path: string): boolean {
  if (path === "/") return true;
  if (EN_ROUTES.has(path)) return true;
  for (const route of EN_ROUTES) {
    if (route !== "/" && path.startsWith(`${route}/`)) return true;
  }
  return false;
}

export function getLocaleFromUrl(url: URL | string): Locale {
  const pathname = typeof url === "string" ? url : url.pathname;
  return isEnPath(pathname) ? "en" : DEFAULT_LOCALE;
}

/**
 * The pathname without any `/en` prefix (the canonical ES path).
 */
export function toEsPath(pathname: string): string {
  if (!isEnPath(pathname)) return pathname;
  const rest = pathname.replace(/^\/en/, "");
  return rest === "" ? "/" : rest;
}

/**
 * Returns the href for `path` (an ES canonical path) in the target locale.
 * Falls back to the ES path when the route has no EN version yet.
 */
export function localizePath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path === "" ? "/" : path;
  if (path === "/") return "/en/";
  return isEnRoute(path) ? `/en${path}` : path;
}

/**
 * The href to switch the *current* URL to `target`. For the ES locale it always
 * resolves (strip the /en prefix). For EN it points to the translated version
 * when available, otherwise to the EN home (English-first entry point).
 */
export function switchPath(currentPathname: string, target: Locale): string {
  const esPath = toEsPath(currentPathname);
  if (target === DEFAULT_LOCALE) return esPath;
  if (isEnRoute(esPath)) return esPath === "/" ? "/en/" : `/en${esPath}`;
  return "/en/";
}