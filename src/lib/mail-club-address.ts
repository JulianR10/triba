import { MAIL_CLUB_TERMS_VERSION, normalizeCountryIso } from "./mail-club";
import { SUPPORTED_COUNTRY_ISO } from "./countries";

export interface MailClubAddressInput {
  recipient_name: string;
  country_iso: string;
  region: string;
  city: string;
  postal_code: string;
  street_address: string;
  address_extra: string;
}

// Los caracteres de control (saltos de línea, tabs) rompen las etiquetas y el CSV de envíos:
// se reemplazan por un espacio antes de recortar.
function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, max) : "";
}

// Formatos que conocemos con certeza (España 5 dígitos; Argentina 4 dígitos o CPA). Para el
// resto, una regla amplia: evita basura sin rechazar formatos reales de otros países.
export function isValidPostalCode(countryIso: string, postalCode: string): boolean {
  if (countryIso === "ES") return /^\d{5}$/.test(postalCode);
  if (countryIso === "AR") return /^(\d{4}|[A-Za-z]\d{4}[A-Za-z]{3})$/.test(postalCode);
  return /^[A-Za-z0-9][A-Za-z0-9 \-]{1,9}$/.test(postalCode);
}

// Valida dirección postal + aceptación de condiciones. Misma regla para
// altas nuevas y upgrades: el servidor nunca confía en el formulario.
export function validateMailClubAddress(
  body: any,
  opts?: { requireTerms?: boolean },
): (
  | { ok: true; address: MailClubAddressInput }
  | { ok: false; error: string }
) {
  const recipientName = str(body?.recipient_name, 120);
  const countryIso = normalizeCountryIso(body?.country_iso);
  const region = str(body?.region, 120);
  const city = str(body?.city, 120);
  const postalCode = str(body?.postal_code, 30);
  const streetAddress = str(body?.street_address, 240);
  const addressExtra = str(body?.address_extra, 240);
  const requireTerms = opts?.requireTerms ?? true;
  const termsAccepted = body?.terms_accepted === true;
  const termsVersion = str(body?.terms_version, 20) || MAIL_CLUB_TERMS_VERSION;

  if (!recipientName) return { ok: false, error: "Falta el nombre de la destinataria." };
  if (!countryIso || !SUPPORTED_COUNTRY_ISO.has(countryIso)) {
    return { ok: false, error: "País de envío inválido." };
  }
  // Provincia y código postal obligatorios: Correos los necesita para
  // entregar y cada devolución sale del margen. Solo el complemento
  // (piso/puerta) queda opcional porque no siempre existe.
  if (!region) return { ok: false, error: "Falta la provincia o estado." };
  if (!city) return { ok: false, error: "Falta la ciudad." };
  if (!postalCode) return { ok: false, error: "Falta el código postal." };
  if (!isValidPostalCode(countryIso, postalCode)) {
    return {
      ok: false,
      error:
        countryIso === "ES"
          ? "El código postal de España tiene 5 números (por ejemplo 28013)."
          : countryIso === "AR"
            ? "El código postal de Argentina tiene 4 números (por ejemplo 1425) o el formato nuevo (por ejemplo C1425ABC)."
            : "El código postal no parece válido. Revisalo (solo letras, números, espacios o guiones).",
    };
  }
  if (!streetAddress) return { ok: false, error: "Falta la dirección." };
  if (requireTerms && !termsAccepted) {
    return { ok: false, error: "Tenés que aceptar las condiciones del Mail Club." };
  }
  if (requireTerms && termsVersion !== MAIL_CLUB_TERMS_VERSION) {
    return { ok: false, error: "Versión de condiciones desactualizada. Recargá la página." };
  }

  return {
    ok: true,
    address: {
      recipient_name: recipientName,
      country_iso: countryIso,
      region,
      city,
      postal_code: postalCode,
      street_address: streetAddress,
      address_extra: addressExtra,
    },
  };
}

export async function saveMailClubAddress(
  admin: any,
  userId: string,
  address: MailClubAddressInput,
  opts?: { recordConsent?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const recordConsent = opts?.recordConsent ?? true;
  const now = new Date().toISOString();
  const { error: addrError } = await admin.from("mailing_addresses").upsert(
    { user_id: userId, ...address, updated_at: now },
    { onConflict: "user_id" },
  );
  if (addrError) return { ok: false, error: "address" };
  // La aceptación se registra solo en alta/upgrade; editar la dirección no
  // debe reescribir su fecha (evidencia de consentimiento).
  if (!recordConsent) return { ok: true };
  // ignoreDuplicates: la evidencia de aceptación no se reescribe (ver 024).
  const { error: consentError } = await admin.from("mail_club_consents").upsert(
    { user_id: userId, terms_version: MAIL_CLUB_TERMS_VERSION, accepted_at: now },
    { onConflict: "user_id, terms_version", ignoreDuplicates: true },
  );
  if (consentError) return { ok: false, error: "consent" };
  return { ok: true };
}
