import type { APIRoute } from "astro";
import { getEditions } from "../lib/editions";
import { SITE_URL } from "../lib/site-url";

const publicPages = [
  { es: "/", en: "/en/" },
  { es: "/revista", en: "/en/revista" },
  { es: "/suscribirme", en: "/en/suscribirme" },
  { es: "/mail-club", en: "/en/mail-club" },
  { es: "/triba-creators", en: "/en/triba-creators" },
  { es: "/privacidad", en: "/en/privacidad" },
  { es: "/terminos", en: "/en/terminos" },
];

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function absoluteUrl(path: string): string {
  return xmlEscape(`${SITE_URL}${path}`);
}

function sitemapEntry(path: string, alternatives: { es: string; en?: string }): string {
  const localized = [
    { lang: "es", path: alternatives.es },
    ...(alternatives.en ? [{ lang: "en", path: alternatives.en }] : []),
  ];
  const links = localized
    .map(({ lang, path: alternatePath }) =>
      `<xhtml:link rel="alternate" hreflang="${lang}" href="${absoluteUrl(alternatePath)}"/>`
    )
    .join("");
  const defaultLink = `<xhtml:link rel="alternate" hreflang="x-default" href="${absoluteUrl(alternatives.es)}"/>`;

  return `<url><loc>${absoluteUrl(path)}</loc>${links}${defaultLink}</url>`;
}

export const GET: APIRoute = async () => {
  let editions: Awaited<ReturnType<typeof getEditions>> = [];
  try {
    editions = await getEditions("es");
  } catch {
    // Keep the public page URLs available even if the edition catalog is temporarily unavailable.
  }

  const entries = publicPages.flatMap(({ es, en }) => [
    sitemapEntry(es, { es, en }),
    sitemapEntry(en, { es, en }),
  ]);

  for (const edition of editions) {
    if (!edition.edition_number) continue;
    const es = `/revista/edicion-${edition.edition_number}`;
    const en = edition.hasEn ? `/en${es}` : undefined;
    entries.push(sitemapEntry(es, { es, en }));
    if (en) entries.push(sitemapEntry(en, { es, en }));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.join("")}</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
};
