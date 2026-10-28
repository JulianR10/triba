import { describe, expect, it } from "vitest";
import { localizePath, switchPath, toEsPath } from "../src/i18n/locale";

describe("localizePath", () => {
  it("deja el español igual y antepone /en en rutas traducidas", () => {
    expect(localizePath("/mi-cuenta", "es")).toBe("/mi-cuenta");
    expect(localizePath("/mi-cuenta", "en")).toBe("/en/mi-cuenta");
    expect(localizePath("/suscribirme", "en")).toBe("/en/suscribirme");
    expect(localizePath("/", "en")).toBe("/en/");
  });

  it("cubre subrutas y cae al español si no hay versión EN", () => {
    expect(localizePath("/revista/edicion-3", "en")).toBe("/en/revista/edicion-3");
    expect(localizePath("/sin-version", "en")).toBe("/sin-version");
  });
});

describe("switchPath", () => {
  it("vuelve al español quitando /en", () => {
    expect(switchPath("/en/mi-cuenta", "es")).toBe("/mi-cuenta");
    expect(switchPath("/en", "es")).toBe("/");
  });

  it("lleva a la versión EN o, si no existe, al home EN", () => {
    expect(switchPath("/terminos", "en")).toBe("/en/terminos");
    expect(switchPath("/sin-version", "en")).toBe("/en/");
  });

  it("toEsPath es idempotente", () => {
    expect(toEsPath(toEsPath("/en/privacidad"))).toBe("/privacidad");
  });
});
