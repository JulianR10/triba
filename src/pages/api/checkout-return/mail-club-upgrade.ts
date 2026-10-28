import type { APIRoute } from "astro";
import { getSiteOrigin } from "../../../lib/site-url";
import { localizePath } from "../../../i18n/locale";

export const prerender = false;

// Retorno del upgrade por Mercado Pago. auto_return="approved" hace que este
// back_url reciba solo pagos aprobados, pero si MP adjunta un status distinto
// (o alguien entra manualmente) no se debe mostrar éxito sin confirmación.
export const GET: APIRoute = ({ request }) => {
  const url = new URL(request.url);
  const status = (url.searchParams.get("status") || "").toLowerCase();

  const outcome =
    status === "rejected" || status === "cancelled" || status === "canceled"
      ? "canceled"
      : status === "pending" || status === "in_process" || status === "authorized"
        ? "pending"
        : "success";

  // MP vuelve sin sesión: el idioma sale de la cookie que setea el selector.
  const locale = /(?:^|;\s*)triba_locale=en(?:;|$)/.test(request.headers.get("cookie") || "") ? "en" : "es";
  const destination = new URL(localizePath("/mi-cuenta", locale), getSiteOrigin());
  destination.searchParams.set("checkout", outcome);
  destination.searchParams.set("flow", "mail_club_upgrade");

  return new Response(null, {
    status: 303,
    headers: {
      Location: destination.toString(),
      "Cache-Control": "no-store",
    },
  });
};
