import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { ok, error } from "../../lib/response";
import { logger } from "../../lib/logger";
import { checkRateLimit, rateLimitKey } from "../../lib/rate-limit";

const MAX_LENGTH = {
  nombre: 120,
  pais: 120,
  propuesta: 4000,
  trabajo_url: 500,
};

const AREAS = ["Escritura", "Producción", "Fotografía", "Diseño gráfico", "Arte", "Otros"];

export const POST: APIRoute = async ({ request }) => {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";
  const rl = await checkRateLimit(rateLimitKey(ip, "creators"), {
    maxRequests: 3,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return error("Demasiados intentos. Esperá un momento.", 429);
  }

  let body: {
    nombre?: unknown;
    email?: unknown;
    pais?: unknown;
    areas?: unknown;
    propuesta?: unknown;
    trabajo_url?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return error("Invalid body", 400);
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const nombre = str(body.nombre);
  const email = str(body.email).toLowerCase();
  const pais = str(body.pais);
  const propuesta = str(body.propuesta);
  const trabajo = str(body.trabajo_url);

  if (!nombre || !email || !pais || !propuesta) {
    return error("Completá todos los campos obligatorios", 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return error("Email inválido", 400);
  }
  if (nombre.length > MAX_LENGTH.nombre || pais.length > MAX_LENGTH.pais || propuesta.length > MAX_LENGTH.propuesta) {
    return error("Alguno de los campos es demasiado largo", 400);
  }
  if (trabajo && trabajo.length > MAX_LENGTH.trabajo_url) {
    return error("El enlace a tu trabajo es demasiado largo", 400);
  }
  const areas = Array.isArray(body.areas)
    ? (body.areas.filter((a): a is string => typeof a === "string" && AREAS.includes(a)))
    : [];
  if (areas.length === 0) {
    return error("Elegí al menos un área", 400);
  }

  const { error: insertError } = await supabaseAdmin.from("creator_applications").insert({
    nombre,
    email,
    pais,
    areas,
    propuesta,
    trabajo_url: trabajo || null,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return error("Ya te postulaste recientemente. Esperá 24 horas para volver a intentar.", 429);
    }
    logger.error({ err: insertError, email }, "creator application insert error");
    return error("No se pudo enviar la postulación. Intentalo de nuevo.", 500);
  }

  return ok();
};
