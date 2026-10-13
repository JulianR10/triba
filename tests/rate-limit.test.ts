import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("../src/lib/supabase-admin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("../src/lib/logger", () => ({ logger: { error: mocks.loggerError, warn: mocks.loggerWarn } }));

import { checkRateLimit, clientIpFromRequest, enforceRateLimit, rateLimitKey } from "../src/lib/rate-limit";

function queryResult(result: unknown) {
  const filters: unknown[][] = [];
  const query: Record<string, any> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn((...args: unknown[]) => {
    filters.push(args);
    return query;
  });
  query.gte = vi.fn((...args: unknown[]) => {
    filters.push(args);
    return query;
  });
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.insert = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { query, filters };
}

describe("rate limit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the complete IPv6 address separate from the endpoint", () => {
    expect(rateLimitKey(" 2001:DB8::ABCD ", "checkout")).toEqual({
      ip: "2001:db8::abcd",
      endpoint: "checkout",
    });
  });

  it("uses the complete IPv6 value in the database lookup", async () => {
    const lookup = queryResult({ count: 0, error: null });
    const insert = queryResult({ error: null });
    mocks.from.mockReturnValueOnce(lookup.query).mockReturnValueOnce(insert.query);

    const result = await checkRateLimit(rateLimitKey("2001:db8::abcd", "checkout"), {
      maxRequests: 5,
      windowMs: 60_000,
    });

    expect(result.allowed).toBe(true);
    expect(lookup.filters).toContainEqual(["ip", "2001:db8::abcd"]);
    expect(lookup.filters).toContainEqual(["endpoint", "checkout"]);
  });

  it("fails closed when the counter lookup fails", async () => {
    mocks.from.mockReturnValue(queryResult({ count: null, error: { code: "DB_DOWN" } }).query);

    const result = await checkRateLimit(rateLimitKey("192.0.2.1", "creators"), {
      maxRequests: 3,
      windowMs: 60_000,
    });

    expect(result).toMatchObject({ allowed: false, unavailable: true });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { endpoint: "creators", code: "DB_DOWN" },
      "rate limit counter unavailable",
    );
  });

  it("fails closed when recording an allowed attempt fails", async () => {
    const lookup = queryResult({ count: 0, error: null });
    const insert = queryResult({ error: { code: "WRITE_DENIED" } });
    mocks.from.mockReturnValueOnce(lookup.query).mockReturnValueOnce(insert.query);

    const result = await checkRateLimit(rateLimitKey("192.0.2.1", "upgrade-checkout"), {
      maxRequests: 3,
      windowMs: 60_000,
    });

    expect(result).toMatchObject({ allowed: false, unavailable: true });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { endpoint: "upgrade-checkout", code: "WRITE_DENIED" },
      "rate limit counter insert failed",
    );
  });
});

describe("clientIpFromRequest", () => {
  it("prefiere el primer valor de x-forwarded-for", () => {
    const req = new Request("https://triba.test/api/pdf/1", {
      headers: { "x-forwarded-for": " 203.0.113.7, 70.41.3.18 " },
    });
    expect(clientIpFromRequest(req)).toBe("203.0.113.7");
  });

  it("conserva IPv6 completas y usa cf-connecting-ip como fallback", () => {
    const v6 = new Request("https://triba.test/api/pdf/1", {
      headers: { "x-forwarded-for": "2001:DB8::ABCD" },
    });
    expect(clientIpFromRequest(v6)).toBe("2001:DB8::ABCD");
    const cf = new Request("https://triba.test/api/pdf/1", {
      headers: { "cf-connecting-ip": "198.51.100.9" },
    });
    expect(clientIpFromRequest(cf)).toBe("198.51.100.9");
    expect(clientIpFromRequest(new Request("https://triba.test/api/pdf/1"))).toBe("unknown");
  });
});

describe("enforceRateLimit", () => {
  const req = () => new Request("https://triba.test/api/pdf/1");

  it("devuelve null cuando el intento está permitido", async () => {
    const lookup = queryResult({ count: 0, error: null });
    const insert = queryResult({ error: null });
    mocks.from.mockReturnValueOnce(lookup.query).mockReturnValueOnce(insert.query);

    await expect(enforceRateLimit(req(), "pdf", { maxRequests: 120, windowMs: 60_000 })).resolves.toBeNull();
  });

  it("devuelve 429 con el mensaje público cuando se supera el límite", async () => {
    const lookup = queryResult({ count: 120, error: null });
    const oldest = queryResult({ created_at: new Date().toISOString(), error: null });
    mocks.from.mockReturnValueOnce(lookup.query).mockReturnValueOnce(oldest.query);

    const res = await enforceRateLimit(req(), "pdf", { maxRequests: 120, windowMs: 60_000 });
    expect(res?.status).toBe(429);
    expect(await res?.json()).toMatchObject({ error: expect.any(String) });
  });

  it("devuelve 503 cuando el contador no está disponible", async () => {
    mocks.from.mockReturnValue(queryResult({ count: null, error: { code: "DB_DOWN" } }).query);

    const res = await enforceRateLimit(req(), "portal", { maxRequests: 20, windowMs: 60_000 });
    expect(res?.status).toBe(503);
  });
});
