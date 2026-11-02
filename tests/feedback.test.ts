import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  last: { current: null as { created_at: string } | null },
  authFails: { current: false },
  limited: { current: null as Response | null },
}));

vi.mock("../src/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, any> = {};
      for (const m of ["select", "eq", "order", "limit"]) q[m] = vi.fn(() => q);
      q.maybeSingle = vi.fn(async () => ({ data: mocks.last.current }));
      q.insert = mocks.insert;
      return q;
    },
  },
}));
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../src/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => mocks.limited.current) }));
vi.mock("../src/lib/auth", () => ({
  requireUser: vi.fn(async () =>
    mocks.authFails.current ? new Response("{}", { status: 401 }) : { user: { id: "u1" }, token: "t" },
  ),
}));

import { POST } from "../src/pages/api/feedback";

const call = (body: unknown, raw = false) =>
  POST({ request: new Request("http://x/api/feedback", { method: "POST", body: raw ? (body as string) : JSON.stringify(body) }) } as any);

describe("POST /api/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.last.current = null;
    mocks.authFails.current = false;
    mocks.limited.current = null;
    mocks.insert.mockResolvedValue({ error: null });
  });

  it("guarda el mensaje (con trim) de la usuaria autenticada", async () => {
    expect((await call({ mensaje: "  me encantó  " })).status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith({ user_id: "u1", mensaje: "me encantó" });
  });

  it("sin sesión → 401 y no guarda", async () => {
    mocks.authFails.current = true;
    expect((await call({ mensaje: "hola" })).status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("corta si el rate limit lo pide", async () => {
    mocks.limited.current = new Response("{}", { status: 429 });
    expect((await call({ mensaje: "hola" })).status).toBe(429);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rechaza cuerpo ilegible, mensaje vacío o de más de 2000 caracteres", async () => {
    expect((await call("no es json", true)).status).toBe(400);
    expect((await call({ mensaje: "   " })).status).toBe(400);
    expect((await call({ mensaje: 42 })).status).toBe(400);
    expect((await call({ mensaje: "a".repeat(2001) })).status).toBe(400);
    expect((await call({ mensaje: "a".repeat(2000) })).status).toBe(200);
  });

  it("un segundo mensaje dentro del minuto → 429; pasado el minuto se acepta", async () => {
    mocks.last.current = { created_at: new Date(Date.now() - 10_000).toISOString() };
    expect((await call({ mensaje: "otro" })).status).toBe(429);
    expect(mocks.insert).not.toHaveBeenCalled();
    mocks.last.current = { created_at: new Date(Date.now() - 120_000).toISOString() };
    expect((await call({ mensaje: "otro" })).status).toBe(200);
  });

  it("mensaje duplicado → 429; otro fallo de base → 500", async () => {
    mocks.insert.mockResolvedValueOnce({ error: { code: "23505", message: "dup" } });
    expect((await call({ mensaje: "igual" })).status).toBe(429);
    mocks.insert.mockResolvedValueOnce({ error: { code: "XX000", message: "boom" } });
    expect((await call({ mensaje: "x" })).status).toBe(500);
  });
});
