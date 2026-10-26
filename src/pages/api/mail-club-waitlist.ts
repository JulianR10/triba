import type { APIRoute } from "astro";
import { ok, error } from "../../lib/response";
import { logger } from "../../lib/logger";
import { enforceRateLimit } from "../../lib/rate-limit";
import { addToMailClubWaitlist } from "../../lib/sender";

// Lista de espera del Mail Club mientras está pausado: el contacto queda en el
// grupo de Sender `mail-club-lista-espera` para avisar la reapertura por campaña.
export const POST: APIRoute = async ({ request }) => {
  const limited = await enforceRateLimit(request, "mail-club-waitlist", {
    maxRequests: 5,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("Invalid body", 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return error("Email inválido", 400);
  }

  try {
    if (!(await addToMailClubWaitlist(email))) {
      logger.error("mail club waitlist: Sender not configured");
      return error("No pudimos anotarte. Intentalo más tarde.", 503);
    }
  } catch (err) {
    logger.error({ err }, "mail club waitlist: Sender error");
    return error("No pudimos anotarte. Intentalo más tarde.", 502);
  }

  return ok();
};
