import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  limited: { current: null as Response | null },
}));

vi.mock("../src/lib/supabase-admin", () => ({
  supabaseAdmin: { from: () => ({ insert: mocks.insert }) },
}));
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../src/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => mocks.limited.current) }));

import { POST } from "../src/pages/api/creators";

const valid = {
  nombre: "  Ana  ",
  email: " ANA@Mail.com ",
  pais: "Argentina",
  areas: ["Escritura", "Arte"],
  propuesta: "Quiero escribir sobre X",
  trabajo_url: "",
};

const call = (body: unknown, raw = false) =>
  POST({ request: new Request("http://x/api/creators", { method: "POST", body: raw ? (body as string) : JSON.stringify(body) }) } as any);

describe("POST /api/creators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limited.current = null;
    mocks.insert.mockResolvedValue({ error: null });
  });

  it("guarda la postulación normalizada (trim, email en minúsculas, url vacía → null)", async () => {
    const res = await call(valid);
    expect(res.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith({
      nombre: "Ana",
      email: "ana@mail.com",
      pais: "Argentina",
      areas: ["Escritura", "Arte"],
      propuesta: "Quiero escribir sobre X",
      trabajo_url: null,
    });
  });

  it("corta si el rate limit lo pide, sin tocar la base", async () => {
    mocks.limited.current = new Response("{}", { status: 429 });
    expect((await call(valid)).status).toBe(429);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rechaza cuerpo ilegible, campos faltantes y email inválido", async () => {
    expect((await call("no es json", true)).status).toBe(400);
    expect((await call({ ...valid, nombre: "   " })).status).toBe(400);
    expect((await call({ ...valid, email: "sin-arroba" })).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rechaza textos demasiado largos", async () => {
    expect((await call({ ...valid, nombre: "a".repeat(121) })).status).toBe(400);
    expect((await call({ ...valid, propuesta: "a".repeat(4001) })).status).toBe(400);
    expect((await call({ ...valid, trabajo_url: "h".repeat(501) })).status).toBe(400);
  });

  it("descarta áreas inventadas y exige al menos una válida", async () => {
    await call({ ...valid, areas: ["Escritura", "Hackeo"] });
    expect(mocks.insert.mock.calls[0][0].areas).toEqual(["Escritura"]);
    expect((await call({ ...valid, areas: ["Hackeo"] })).status).toBe(400);
    expect((await call({ ...valid, areas: "Escritura" })).status).toBe(400);
  });

  it("postulación repetida → 429; otro fallo de base → 500", async () => {
    mocks.insert.mockResolvedValueOnce({ error: { code: "23505", message: "dup" } });
    expect((await call(valid)).status).toBe(429);
    mocks.insert.mockResolvedValueOnce({ error: { code: "XX000", message: "boom" } });
    expect((await call(valid)).status).toBe(500);
  });
});
