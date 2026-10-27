import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getPaymentProvider: vi.fn(),
  from: vi.fn(),
  createCheckout: vi.fn(),
}));

vi.mock("../src/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../src/lib/supabase-admin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("../src/lib/payment-provider", () => ({ getPaymentProvider: mocks.getPaymentProvider }));
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("../src/lib/site-url", () => ({ getSiteOrigin: () => "https://x.test" }));

import { POST } from "../src/pages/api/create-checkout";

// Un solo query thenable: sirve para el rate limiter (count 0) y para la lectura de subscriptions.
function query(rows: unknown[]) {
  const q: Record<string, any> = {};
  for (const m of ["select", "eq", "in", "gte"]) q[m] = vi.fn(() => q);
  q.insert = vi.fn(() => Promise.resolve({ error: null }));
  q.then = (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) =>
    Promise.resolve({ data: rows, count: 0, error: null }).then(resolve, reject);
  return q;
}

const call = () =>
  POST({
    request: new Request("http://x/api/create-checkout", {
      method: "POST",
      body: JSON.stringify({ provider: "stripe", currency: "EUR" }),
    }),
  } as any);

const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
const past = new Date(Date.now() - 10 * 86_400_000).toISOString();

describe("POST /api/create-checkout (digital) — sin dobles suscripciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ user: { id: "u1", email: "a@b.com" } });
    mocks.getPaymentProvider.mockReturnValue({ createCheckout: mocks.createCheckout });
    mocks.createCheckout.mockResolvedValue({ url: "https://checkout.test" });
  });

  it("bloquea con 409 si ya hay una suscripción paga vigente", async () => {
    mocks.from.mockReturnValue(query([{ status: "active", current_period_end: future }]));
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("already_subscribed");
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("deja pasar si la suscripción está vencida o no hay ninguna", async () => {
    mocks.from.mockReturnValue(query([{ status: "active", current_period_end: past }]));
    expect((await call()).status).toBe(200);
    mocks.from.mockReturnValue(query([]));
    expect((await call()).status).toBe(200);
    expect(mocks.createCheckout).toHaveBeenCalledTimes(2);
  });
});
