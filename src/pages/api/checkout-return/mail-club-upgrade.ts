import type { APIRoute } from "astro";
import { getSiteOrigin } from "../../../lib/site-url";

export const prerender = false;

export const GET: APIRoute = () => {
  const destination = new URL("/mi-cuenta", getSiteOrigin());
  destination.searchParams.set("checkout", "success");
  destination.searchParams.set("flow", "mail_club_upgrade");

  return new Response(null, {
    status: 303,
    headers: {
      Location: destination.toString(),
      "Cache-Control": "no-store",
    },
  });
};
