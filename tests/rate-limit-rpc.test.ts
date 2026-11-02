import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("../src/lib/supabase-admin", () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

const config = { maxRequests: 5, windowMs: 60_000 };
const key = { ip: "1.2.3.4", endpoint: "pdf" };

// El módulo recuerda si la función existe: cada test arranca con un módulo nuevo.
async function load() {
  vi.resetModules();
  return (await import("../src/lib/rate-limit")).checkRateLimit;
}

describe("rate limit con la función rate_limit_hit (una sola consulta)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("permite y no usa las consultas sueltas", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_ms: 0 }], error: null });
    const checkRateLimit = await load();
    await expect(checkRateLimit(key, config)).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
    expect(mocks.rpc).toHaveBeenCalledWith("rate_limit_hit", { p_ip: "1.2.3.4", p_endpoint: "pdf", p_window_ms: 60_000, p_max: 5 });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("bloquea y devuelve cuánto falta", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ allowed: false, retry_after_ms: 12_000 }], error: null });
    const checkRateLimit = await load();
    await expect(checkRateLimit(key, config)).resolves.toEqual({ allowed: false, retryAfterMs: 12_000 });
  });

  it("falla cerrado ante un error real de la función", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const checkRateLimit = await load();
    await expect(checkRateLimit(key, config)).resolves.toMatchObject({ allowed: false, unavailable: true });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("falla cerrado si la función no devuelve resultado", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const checkRateLimit = await load();
    await expect(checkRateLimit(key, config)).resolves.toMatchObject({ allowed: false, unavailable: true });
  });

  it("sin la migración sigue con las dos consultas y no vuelve a probar la función", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" } });
    const q: Record<string, any> = {};
    for (const m of ["select", "eq", "gte", "order", "limit"]) q[m] = vi.fn(() => q);
    q.insert = vi.fn(() => Promise.resolve({ error: null }));
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ count: 0, error: null }).then(resolve);
    mocks.from.mockReturnValue(q);
    const checkRateLimit = await load();
    await expect(checkRateLimit(key, config)).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
    await checkRateLimit(key, config);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("pasados 5 minutos vuelve a probar la función (la migración pudo aplicarse mientras tanto)", async () => {
    vi.useFakeTimers();
    try {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "not found" } });
      const q: Record<string, any> = {};
      for (const m of ["select", "eq", "gte", "order", "limit"]) q[m] = vi.fn(() => q);
      q.insert = vi.fn(() => Promise.resolve({ error: null }));
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ count: 0, error: null }).then(resolve);
      mocks.from.mockReturnValue(q);
      const checkRateLimit = await load();
      await checkRateLimit(key, config);
      mocks.rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_ms: 0 }], error: null });
      vi.advanceTimersByTime(5 * 60_000 + 1);
      await expect(checkRateLimit(key, config)).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
      expect(mocks.rpc).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
