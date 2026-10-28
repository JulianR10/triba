import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  cancelSubscription: vi.fn(),
  mine: null as any,
  others: [] as any[],
  updates: [] as any[],
}));

vi.mock("../src/lib/supabase-admin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("../src/lib/payment-provider", () => ({
  getPaymentProvider: () => ({ cancelSubscription: mocks.cancelSubscription }),
}));
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { blockIfDuplicateCheckout } from "../src/lib/duplicate-checkout";

const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
const sub = { id: "new", userId: "u1", provider: "stripe" as const, providerSubscriptionId: "sub_new" };

describe("blockIfDuplicateCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updates = [];
    mocks.cancelSubscription.mockResolvedValue(undefined);
    mocks.from.mockImplementation(() => {
      let isUpdate = false;
      const q: Record<string, any> = {};
      for (const m of ["select", "eq", "in", "neq"]) q[m] = vi.fn(() => q);
      q.update = vi.fn((payload: unknown) => {
        isUpdate = true;
        mocks.updates.push(payload);
        return q;
      });
      q.maybeSingle = vi.fn(async () => ({ data: mocks.mine }));
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(isUpdate ? { error: null } : { data: mocks.others, error: null }).then(resolve);
      return q;
    });
  });

  it("frena la suscripción más nueva si ya había otra vigente", async () => {
    mocks.mine = { status: "active", created_at: "2026-10-02T00:00:00Z" };
    mocks.others = [{ id: "old", status: "active", current_period_end: future, created_at: "2026-10-01T00:00:00Z" }];
    expect(await blockIfDuplicateCheckout(sub)).toBe(true);
    expect(mocks.cancelSubscription).toHaveBeenCalledWith("sub_new");
    expect(mocks.updates).toEqual([expect.objectContaining({ status: "canceled" })]);
  });

  it("no toca a la primera si la otra es posterior", async () => {
    mocks.mine = { status: "active", created_at: "2026-10-01T00:00:00Z" };
    mocks.others = [{ id: "later", status: "active", current_period_end: future, created_at: "2026-10-02T00:00:00Z" }];
    expect(await blockIfDuplicateCheckout(sub)).toBe(false);
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
  });

  it("un reintento sobre una fila ya cancelada sigue bloqueada sin volver al proveedor", async () => {
    mocks.mine = { status: "canceled", created_at: "2026-10-02T00:00:00Z" };
    mocks.others = [{ id: "old", status: "active", current_period_end: future, created_at: "2026-10-01T00:00:00Z" }];
    expect(await blockIfDuplicateCheckout(sub)).toBe(true);
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
  });

  it("si el proveedor falla de verdad, lanza para que el webhook reintente", async () => {
    mocks.mine = { status: "active", created_at: "2026-10-02T00:00:00Z" };
    mocks.others = [{ id: "old", status: "active", current_period_end: future, created_at: "2026-10-01T00:00:00Z" }];
    mocks.cancelSubscription.mockRejectedValue(new Error("Stripe API timeout"));
    await expect(blockIfDuplicateCheckout(sub)).rejects.toThrow("timeout");
    expect(mocks.updates).toEqual([]);
  });
});
