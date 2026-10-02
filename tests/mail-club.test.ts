import { describe, expect, it } from "vitest";
import {
  MAIL_CLUB_EUROPE_ISO,
  MAIL_CLUB_UPGRADE_DIFF_CENTS,
  MAIL_CLUB_PRICE_CENTS,
  firstShipmentPeriod,
  getPlanType,
  isOnOrBeforeCutoff,
  normalizeCountryIso,
  resolveMailClubZone,
  shipmentMonthLabel,
} from "../src/lib/mail-club";
import { COUNTRIES, SUPPORTED_COUNTRY_ISO } from "../src/lib/countries";
import { csvCell } from "../src/lib/csv";
import { validateMailClubAddress } from "../src/lib/mail-club-address";

describe("zonas y monedas", () => {
  it("Argentina va a ARS/Mercado Pago", () => {
    expect(resolveMailClubZone("AR")).toEqual({
      zone: "argentina",
      currency: "ARS",
      provider: "mercadopago",
      countryIso: "AR",
    });
    expect(resolveMailClubZone("ar").zone).toBe("argentina");
  });

  it("Europa va a EUR/Stripe", () => {
    expect(resolveMailClubZone("ES").currency).toBe("EUR");
    expect(resolveMailClubZone("GB").currency).toBe("EUR");
    expect(resolveMailClubZone("CH").provider).toBe("stripe");
  });

  it("resto del mundo va a USD/Stripe", () => {
    expect(resolveMailClubZone("US")).toMatchObject({ zone: "rest", currency: "USD", provider: "stripe" });
    expect(resolveMailClubZone("MX").currency).toBe("USD");
    expect(resolveMailClubZone("JP").currency).toBe("USD");
  });

  it("normaliza y rechaza códigos inválidos", () => {
    expect(normalizeCountryIso(" es ")).toBe("ES");
    expect(normalizeCountryIso("ZZZ")).toBeNull();
    expect(normalizeCountryIso("")).toBeNull();
    expect(normalizeCountryIso(undefined)).toBeNull();
  });

  it("precios y diferencias cuadran", () => {
    expect(MAIL_CLUB_PRICE_CENTS.EUR - 700).toBe(MAIL_CLUB_UPGRADE_DIFF_CENTS.EUR);
    expect(MAIL_CLUB_PRICE_CENTS.USD - 700).toBe(MAIL_CLUB_UPGRADE_DIFF_CENTS.USD);
    expect(MAIL_CLUB_PRICE_CENTS.ARS - 7000).toBe(MAIL_CLUB_UPGRADE_DIFF_CENTS.ARS);
  });
});

describe("corte día 15 Europe/Madrid", () => {
  it("incluye hasta el 15 23:59 Madrid", () => {
    // 15 oct 22:00 UTC = 16 oct 00:00 Madrid -> fuera
    expect(isOnOrBeforeCutoff(new Date("2026-10-15T22:00:00Z"), 2026, 10)).toBe(false);
    // 15 oct 20:00 UTC = 15 oct 22:00 Madrid -> dentro
    expect(isOnOrBeforeCutoff(new Date("2026-10-15T20:00:00Z"), 2026, 10)).toBe(true);
  });

  it("primer envío: hasta el 15 ese mes, después el siguiente", () => {
    expect(firstShipmentPeriod(new Date("2026-10-15T20:00:00Z"))).toEqual({ year: 2026, month: 10 });
    expect(firstShipmentPeriod(new Date("2026-10-16T00:30:00+02:00"))).toEqual({ year: 2026, month: 11 });
    expect(firstShipmentPeriod(new Date("2026-12-20T12:00:00Z"))).toEqual({ year: 2027, month: 1 });
  });

  it("etiqueta de mes por locale", () => {
    expect(shipmentMonthLabel(2026, 10, "es")).toBe("octubre 2026");
    expect(shipmentMonthLabel(2026, 10, "en")).toBe("October 2026");
  });
});

describe("plan por defecto", () => {
  it("sin plan es digital", () => {
    expect(getPlanType(null)).toBe("digital");
    expect(getPlanType({})).toBe("digital");
    expect(getPlanType({ plan_type: "mail_club" })).toBe("mail_club");
  });
});

describe("países soportados", () => {
  it("sin duplicados y cobertura mundial", () => {
    const isos = COUNTRIES.map((c) => c.iso);
    expect(new Set(isos).size).toBe(isos.length);
    expect(isos.length).toBeGreaterThan(230);
    expect(SUPPORTED_COUNTRY_ISO.has("ES")).toBe(true);
    expect(SUPPORTED_COUNTRY_ISO.has("AX")).toBe(true);
    expect(SUPPORTED_COUNTRY_ISO.has("ZZ")).toBe(false);
  });

  it("Europa acordada dentro de soportados", () => {
    for (const iso of MAIL_CLUB_EUROPE_ISO) {
      expect(SUPPORTED_COUNTRY_ISO.has(iso)).toBe(true);
    }
  });
});

describe("csvCell", () => {
  it("neutraliza fórmulas y escapa comillas", () => {
    expect(csvCell("=1+1")).toBe("\"'=1+1\"");
    expect(csvCell("@hola")).toBe("\"'@hola\"");
    expect(csvCell("-5")).toBe("\"'-5\"");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('di "hola"')).toBe('"di ""hola"""');
    expect(csvCell("normal")).toBe("normal");
    expect(csvCell(null)).toBe("");
  });
});

describe("validateMailClubAddress", () => {
  const base = {
    recipient_name: "Lucía",
    country_iso: "ES",
    region: "Madrid",
    city: "Madrid",
    postal_code: "28001",
    street_address: "Calle Mayor 1",
    address_extra: "",
    terms_accepted: true,
    terms_version: "v1",
  };

  it("acepta dirección válida", () => {
    const r = validateMailClubAddress(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.address.country_iso).toBe("ES");
  });

  it("rechaza país fuera de lista, ciudad/calle vacías y términos", () => {
    expect(validateMailClubAddress({ ...base, country_iso: "ZZ" }).ok).toBe(false);
    expect(validateMailClubAddress({ ...base, city: " " }).ok).toBe(false);
    expect(validateMailClubAddress({ ...base, street_address: "" }).ok).toBe(false);
    expect(validateMailClubAddress({ ...base, terms_accepted: false }).ok).toBe(false);
    expect(validateMailClubAddress({ ...base, terms_version: "v0" }).ok).toBe(false);
  });

  it("edición sin términos no los exige", () => {
    const { terms_accepted: _t, terms_version: _v, ...rest } = base;
    expect(validateMailClubAddress(rest, { requireTerms: false }).ok).toBe(true);
  });
});
