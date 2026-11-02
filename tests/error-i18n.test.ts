import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isEnglishApiCall, localizeApiError, translateErrorToEn } from "../src/lib/error-i18n";

const jsonRes = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("errores de la API en inglés", () => {
  it("traduce una frase exacta y una con datos", () => {
    expect(translateErrorToEn("Ya estás en el Mail Club.")).toBe("You're already in Mail Club.");
    expect(
      translateErrorToEn("Tu suscripción sigue activa hasta el 5 de noviembre de 2026, porque ya programaste la baja. Desde ese día podés volver a suscribirte."),
    ).toContain("until November 5, 2026");
    expect(
      translateErrorToEn("Tu suscripción actual no admite upgrade directo. Escribinos a a@b.com y lo resolvemos."),
    ).toContain("a@b.com");
  });

  it("deja igual lo que no conoce", () => {
    expect(translateErrorToEn("Algo nuevo sin traducir")).toBe("Algo nuevo sin traducir");
  });

  it("traduce el cuerpo conservando status y el resto de los campos", async () => {
    const res = await localizeApiError(jsonRes({ error: "Ya estás en el Mail Club.", code: "x" }, 409));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "You're already in Mail Club.", code: "x" });
  });

  it("no toca éxitos ni respuestas que no son JSON", async () => {
    const okRes = jsonRes({ error: "Ya estás en el Mail Club." }, 200);
    expect(await localizeApiError(okRes)).toBe(okRes);
    const html = new Response("hola", { status: 500, headers: { "Content-Type": "text/html" } });
    expect(await localizeApiError(html)).toBe(html);
  });

  it("detecta el inglés por la página de origen y, sin ella, por la cookie", () => {
    const req = (headers: Record<string, string>) => new Request("http://x/api/a", { headers });
    expect(isEnglishApiCall(req({ referer: "http://x/en/mi-cuenta" }))).toBe(true);
    expect(isEnglishApiCall(req({ referer: "http://x/mi-cuenta", cookie: "triba_locale=en" }))).toBe(false);
    expect(isEnglishApiCall(req({ cookie: "triba_locale=en" }))).toBe(true);
    expect(isEnglishApiCall(req({}))).toBe(false);
  });

  // Guardia: un mensaje en español nuevo en un endpoint público debe tener su traducción.
  it("todo error en español de los endpoints públicos tiene traducción", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          if (!["admin", "webhook", "cron"].includes(name)) walk(full);
        } else if (full.endsWith(".ts")) files.push(full);
      }
    };
    walk("src/pages/api");
    files.push("src/lib/rate-limit.ts");

    const looksSpanish = (m: string) => /[áéíóúñ¿¡]|\b(el|la|los|las|tu|para|una|que|ya)\b/i.test(m);
    const missing: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const match of src.matchAll(/(?:error\(\s*|error:\s*)"([^"]+)"/g)) {
        const message = match[1];
        if (looksSpanish(message) && translateErrorToEn(message) === message) missing.push(`${file}: ${message}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
