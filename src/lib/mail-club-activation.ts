import { supabaseAdmin } from "./supabase-admin";
import { getPreferredLocale } from "./locale-pref";
import { assignFounderNumber } from "./founders";
import { firstShipmentPeriod, shipmentMonthLabel } from "./mail-club";
import { sendMailClubWelcomeEmail } from "./email";
import type { Locale } from "../i18n/ui";

// Activación compartida (altas y upgrades): asigna fundadora y envía la
// bienvenida con dirección y mes del primer sobre. Solo llamar cuando el
// primer pago Mail Club está confirmado.
//
// At-most-once: el envío se reclama con `subscriptions.welcome_sent_at` de
// forma condicional, así dos webhooks concurrentes no duplican el email.
// Si Sender falla, el reclamo se revierte para permitir el reintento desde
// el próximo evento o desde administración.
export async function sendMailClubActivation(
  userId: string,
  email: string,
  locale?: Locale,
): Promise<number | null> {
  const loc = locale ?? (await getPreferredLocale(userId).catch(() => "es" as const));
  const ship = firstShipmentPeriod(new Date());
  const founder = await assignFounderNumber(userId);

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("id, welcome_sent_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const subId = (sub as any)?.id as string | undefined;

  // Ya enviada en un evento anterior: no repetir.
  if (subId && (sub as any).welcome_sent_at) return founder;

  // Reclamo condicional: solo el primer evento que pasa de null envía.
  if (subId) {
    const { data: claimed } = await supabaseAdmin
      .from("subscriptions")
      .update({ welcome_sent_at: new Date().toISOString() })
      .eq("id", subId)
      .is("welcome_sent_at", null)
      .select("id");
    if (!claimed || (claimed as any[]).length === 0) return founder;
  }

  try {
    const { data: addr } = await supabaseAdmin
      .from("mailing_addresses")
      .select("recipient_name, country_iso, region, city, postal_code, street_address, address_extra")
      .eq("user_id", userId)
      .maybeSingle();
    const lines = addr
      ? [
          (addr as any).recipient_name,
          [(addr as any).street_address, (addr as any).address_extra].filter(Boolean).join(" — "),
          [[(addr as any).postal_code, (addr as any).city].filter(Boolean).join(" "), (addr as any).region]
            .filter(Boolean)
            .join(", "),
          (addr as any).country_iso,
        ].filter(Boolean)
      : [];
    await sendMailClubWelcomeEmail(
      email,
      {
        recipientName: ((addr as any)?.recipient_name as string) || email.split("@")[0],
        addressLines: lines,
        shipmentMonth: shipmentMonthLabel(ship.year, ship.month, loc),
        founderNumber: founder,
      },
      loc,
    );
  } catch (err) {
    // Devolver el reclamo para que un reintento posterior pueda enviar.
    if (subId) {
      await supabaseAdmin
        .from("subscriptions")
        .update({ welcome_sent_at: null })
        .eq("id", subId);
    }
    throw err;
  }

  return founder;
}
