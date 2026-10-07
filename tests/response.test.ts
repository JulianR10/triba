import { describe, expect, it } from "vitest";
import { error, json, ok } from "../src/lib/response";

async function body(res: Response) {
  return JSON.parse(await res.text());
}

describe("contrato de respuesta API", () => {
  it("ok() sin args devuelve { ok: true }", async () => {
    const res = ok();
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true });
  });

  it("ok(obj) inyecta ok:true sin perder el payload (defensa en profundidad)", async () => {
    const res = ok({ message: "Suscripción cancelada" });
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true, message: "Suscripción cancelada" });
  });

  it("ok(obj) respeta un ok explícito del caller si lo trae", async () => {
    const res = ok({ ok: true, message: "x" });
    expect(await body(res)).toEqual({ ok: true, message: "x" });
  });

  it("ok(array) no envuelve ni rompe listas (compatibilidad)", async () => {
    const res = ok([1, 2, 3]);
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual([1, 2, 3]);
  });

  it("error() usa siempre { error } con su status", async () => {
    const res = error("No encontramos una suscripción cancelable.", 404);
    expect(res.status).toBe(404);
    expect(await body(res)).toEqual({ error: "No encontramos una suscripción cancelable." });
  });

  it("json() preserva el status dado", () => {
    expect(json({ a: 1 }, 201).status).toBe(201);
  });
});
