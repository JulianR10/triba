import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getPaymentProvider: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("../src/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../src/lib/supabase-admin", () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock("../src/lib/payment-provider", () => ({ getPaymentProvider: mocks.getPaymentProvider }));
vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: mocks.loggerWarn },
}));

import { POST } from "../src/pages/api/cancel-subscription";

function queryReturning(data: unknown) {
  const query: Record<string, any> = {};
  for (const method of ["select", "eq", "in", "order", "limit", "gte"]) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  // Rate limiter: contador en 0 (permitido) e insert OK.
  query.insert = vi.fn(() => Promise.resolve({ error: null }));
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve({ count: 0, error: null }).then(resolve, reject);
  return query;
}

const subscription = {
  id: "sub-1",
  provider: "stripe",
  provider_subscription_id: "stripe-sub-1",
  status: "active",
  cancel_at_period_end: false,
};

describe("POST /api/cancel-subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("does not mark cancellation locally when the provider fails", async () => {
    const query = queryReturning(subscription);
    const scheduleCancel = vi.fn().mockRejectedValue(new Error("Stripe unavailable"));
    mocks.from.mockReturnValue(query);
    mocks.getPaymentProvider.mockReturnValue({ scheduleCancel });

    const response = await POST({
      request: new Request("https://triba.test/api/cancel-subscription", { method: "POST" }),
    } as any);

    expect(response.status).toBe(502);
    expect(scheduleCancel).toHaveBeenCalledWith("stripe-sub-1");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not return success when the cancellation RPC marks zero rows and state is unchanged", async () => {
    const initialQuery = queryReturning(subscription);
    const rereadQuery = queryReturning({ cancel_at_period_end: false, status: "active" });
    const pending = [initialQuery, rereadQuery];
    mocks.from.mockImplementation((table: string) =>
      table === "rate_limits" ? queryReturning(null) : pending.shift() ?? queryReturning(null),
    );
    mocks.getPaymentProvider.mockReturnValue({ scheduleCancel: vi.fn().mockResolvedValue(undefined) });
    mocks.rpc.mockResolvedValue({ data: 0, error: null });

    const response = await POST({
      request: new Request("https://triba.test/api/cancel-subscription", { method: "POST" }),
    } as any);

    expect(response.status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledWith("cancel_subscription", { p_user_id: "user-1" });
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("cambió de estado") });
  });
});
