// Triba Mail Club — configuración central (servidor como fuente de verdad).
// Precios y zonas 100% definidos; la cotización postal (margen) queda como
// condición de lanzamiento y se ajusta aquí sin reescribir flujos.

export const MAIL_CLUB_ORIGIN = {
  city: "Madrid",
  countryIso: "ES",
  countryName: "España",
} as const;

export const MAIL_CLUB_TIME_ZONE = "Europe/Madrid";
export const MAIL_CLUB_CUTOFF_DAY = 15;
export const MAIL_CLUB_DISPATCH_DAY = 20;
export const MAIL_CLUB_TERMS_VERSION = "v1";
export const MAIL_CLUB_FOUNDER_LIMIT = 100;
export const MAIL_CLUB_ADDRESS_RETENTION_DAYS = 60;

export type MailClubZone = "europe" | "rest" | "argentina";
export type MailClubCurrency = "EUR" | "USD" | "ARS";
export type MailClubProvider = "stripe" | "mercadopago";

// Precio mensual completo del Mail Club (céntimos, salvo ARS en pesos).
export const MAIL_CLUB_PRICE_CENTS: Record<MailClubCurrency, number> = {
  EUR: 1050,
  USD: 1250,
  ARS: 16000,
};

// Diferencia a cobrar en el upgrade digital -> Mail Club dentro del mes en curso.
export const MAIL_CLUB_UPGRADE_DIFF_CENTS: Record<MailClubCurrency, number> = {
  EUR: 350,
  USD: 550,
  ARS: 9000,
};

// Lista explícita y revisable de países europeos (ISO 3166-1 alpha-2).
// Incluye UE + Reino Unido, Suiza, Noruega, Islandia y microestados acordados.
// Todo país no listado va a USD, salvo AR que va a ARS/Mercado Pago.
export const MAIL_CLUB_EUROPE_ISO: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE",
  "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT",
  "RO", "SK", "SI", "ES", "SE",
  "GB", "NO", "CH", "IS",
  "AD", "MC", "SM", "VA", "LI",
]);

export function getPlanType(sub?: { plan_type?: string | null } | null): "digital" | "mail_club" {
  return sub?.plan_type === "mail_club" ? "mail_club" : "digital";
}

export function normalizeCountryIso(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return code;
}

export function resolveMailClubZone(countryIsoInput: unknown): {
  zone: MailClubZone;
  currency: MailClubCurrency;
  provider: MailClubProvider;
  countryIso: string;
} {
  const countryIso = normalizeCountryIso(countryIsoInput) ?? "";
  if (countryIso === "AR") {
    return { zone: "argentina", currency: "ARS", provider: "mercadopago", countryIso };
  }
  if (countryIso && MAIL_CLUB_EUROPE_ISO.has(countryIso)) {
    return { zone: "europe", currency: "EUR", provider: "stripe", countryIso };
  }
  return { zone: "rest", currency: "USD", provider: "stripe", countryIso };
}

// El upgrade conserva moneda y proveedor de la suscripción digital vigente.
// La dirección debe pertenecer a la misma zona; cambiar de zona implica
// cambiar de proveedor y requiere alta nueva, no upgrade.
export function isUpgradeZoneCompatible(
  planCurrency: string,
  provider: string,
  countryIsoInput: unknown,
): boolean {
  const resolved = resolveMailClubZone(countryIsoInput);
  return resolved.currency === planCurrency && resolved.provider === provider;
}

function madridParts(date: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: MAIL_CLUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// Corte inclusivo: pago confirmado hasta el día 15 23:59:59 Madrid entra
// en el envío del mes en curso. Compara fecha Madrid (evita DST manual).
export function isOnOrBeforeCutoff(
  confirmedAt: Date,
  periodYear: number,
  periodMonth: number,
): boolean {
  const p = madridParts(confirmedAt);
  if (p.year !== periodYear || p.month !== periodMonth) {
    return confirmedAt.getTime() < Date.UTC(periodYear, periodMonth - 1, 1);
  }
  return p.day <= MAIL_CLUB_CUTOFF_DAY;
}

// ¿La fecha cae en o antes del corte del mes en curso (Madrid)? Se usa para
// avisar si un cambio de dirección aplica al envío de este mes o al siguiente.
export function isBeforeCutoffThisMonth(date: Date): boolean {
  return madridParts(date).day <= MAIL_CLUB_CUTOFF_DAY;
}

export function shipmentMonthLabel(
  year: number,
  month: number,
  locale: "es" | "en" = "es",
): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const name = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-ES", {
    month: "long",
    timeZone: "UTC",
  }).format(d);
  return `${name} ${year}`;
}

export function firstShipmentPeriod(
  confirmedAt: Date,
): { year: number; month: number } {
  const p = madridParts(confirmedAt);
  if (p.day <= MAIL_CLUB_CUTOFF_DAY) return { year: p.year, month: p.month };
  const next = new Date(Date.UTC(p.year, p.month, 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
}
