import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { logger } from "../../lib/logger";
import { validateMailClubAddress, saveMailClubAddress } from "../../lib/mail-club-address";
import { getActiveSubscriptionForUser } from "../../lib/subscription-guard";
import { getPlanType, isBeforeCutoffThisMonth } from "../../lib/mail-club";

// Lee (GET) y actualiza (PUT) la dirección postal de una suscriptora Mail Club.
// Los cambios rigen hasta el corte del 15 inclusive; después, al mes siguiente.
export const GET: APIRoute = async ({ request }) => {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  const { data } = await supabaseAdmin
    .from("mailing_addresses")
    .select("recipient_name, country_iso, region, city, postal_code, street_address, address_extra")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  return ok({ address: data ?? null });
};

export const PUT: APIRoute = async ({ request }) => {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const user = auth.user;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return error("Invalid body", 400);
  }

  const current = await getActiveSubscriptionForUser(user.id);
  if (!current || getPlanType(current as any) !== "mail_club") {
    return error("Necesitás una suscripción Mail Club activa para gestionar tu dirección.", 409);
  }

  const validated = validateMailClubAddress(body, { requireTerms: false });
  if (!validated.ok) return error(validated.error, 400);

  const saved = await saveMailClubAddress(supabaseAdmin, user.id, validated.address, {
    recordConsent: false,
  });
  if (!saved.ok) {
    logger.error({ userId: user.id, step: saved.error }, "address update error");
    return error("No pudimos guardar tu dirección. Intentá de nuevo.", 500);
  }
  // El corte del 15 (Madrid) define a qué envío aplica el cambio. Se informa
  // a la UI para que no prometa el mes en curso cuando ya pasó el corte.
  const appliesThisMonth = isBeforeCutoffThisMonth(new Date());
  return ok({
    message: appliesThisMonth
      ? "Dirección actualizada. Aplica al sobre de este mes."
      : "Dirección actualizada. Aplica al sobre del mes que viene.",
    appliesThisMonth,
  });
};
