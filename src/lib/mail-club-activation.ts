import { supabaseAdmin } from "./supabase-admin";
import { getPreferredLocale } from "./locale-pref";
import { assignFounderNumber } from "./founders";
import { firstShipmentPeriod, shipmentMonthLabel } from "./mail-club";
import { sendMailClubWelcomeEmail } from "./email";
import type { Locale } from "../i18n/ui";

// Activación compartida (altas y upgrades): asigna fundadora y envía la
// bienvenida con dirección y mes del primer sobre. Solo llamar cuando el
// primer pago Mail Club está confirmado; el caller evita duplicados.
export async function sendMailClubActivation(
  userId: string,
  email: string,
  locale?: Locale,
): Promise<number | null> {
  const loc = locale ?? (await getPreferredLocale(userId).catch(() => "es" as const));
  const { data: addr } = await supabaseAdmin
    .from("mailing_addresses")
    .select("recipient_name, country_iso, region, city, postal_code, street_address, address_extra")
    .eq("user_id", userId)
    .maybeSingle();
  const ship = firstShipmentPeriod(new Date());
  const founder = await assignFounderNumber(userId);
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
  return founder;
}
