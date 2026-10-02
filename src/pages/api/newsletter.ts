import type { APIRoute } from "astro";
import { error } from "../../lib/response";

// El newsletter gratuito se retiró con el lanzamiento del Mail Club.
// La tabla `newsletters` se conserva hasta exportar y borrar sus contactos;
// este endpoint ya no acepta altas nuevas.
export const POST: APIRoute = async () => {
  return error("El newsletter gratuito ya no está disponible.", 410);
};
