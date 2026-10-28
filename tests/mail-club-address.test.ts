import { describe, expect, it } from "vitest";
import { isValidPostalCode, validateMailClubAddress } from "../src/lib/mail-club-address";

const base = {
  recipient_name: "Ana Pérez",
  country_iso: "ES",
  region: "Madrid",
  city: "Madrid",
  postal_code: "28013",
  street_address: "Calle Mayor 1",
  address_extra: "",
  terms_accepted: true,
};

describe("isValidPostalCode", () => {
  it("exige el formato conocido de España y Argentina", () => {
    expect(isValidPostalCode("ES", "28013")).toBe(true);
    expect(isValidPostalCode("ES", "2801")).toBe(false);
    expect(isValidPostalCode("AR", "1425")).toBe(true);
    expect(isValidPostalCode("AR", "C1425ABC")).toBe(true);
    expect(isValidPostalCode("AR", "14")).toBe(false);
  });

  it("acepta formatos razonables de otros países y rechaza basura", () => {
    expect(isValidPostalCode("GB", "SW1A 1AA")).toBe(true);
    expect(isValidPostalCode("US", "90210-1234")).toBe(true);
    expect(isValidPostalCode("FR", "<script>")).toBe(false);
  });
});

describe("validateMailClubAddress", () => {
  it("acepta una dirección completa", () => {
    expect(validateMailClubAddress(base).ok).toBe(true);
  });

  it("rechaza un código postal inválido con un mensaje que explica el formato", () => {
    const res = validateMailClubAddress({ ...base, postal_code: "ABC" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("5 números");
  });

  it("convierte saltos de línea en espacios para no romper etiquetas ni el CSV", () => {
    const res = validateMailClubAddress({ ...base, street_address: "Calle Mayor 1\nPiso 2\r\n=cmd" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.address.street_address).toBe("Calle Mayor 1 Piso 2 =cmd");
  });
});
