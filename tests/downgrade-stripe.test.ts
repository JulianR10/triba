import { beforeEach, describe, expect, it, vi } from "vitest";

const stripe = vi.hoisted(() => ({
  subscriptions: { retrieve: vi.fn() },
  subscriptionSchedules: { create: vi.fn(), update: vi.fn(), retrieve: vi.fn(), release: vi.fn() },
}));

vi.mock("../src/lib/stripe", () => ({ stripe, STRIPE_PRICE_IDS: { EUR: "price_digital" } }));
vi.mock("../src/lib/supabase-admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { getPaymentProvider } from "../src/lib/payment-provider";

const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
const provider = getPaymentProvider("stripe");
const sub = (extra: object = {}) => ({ items: { data: [{ id: "si_1", price: { id: "price_club" } }] }, ...extra });

describe("StripePaymentProvider.downgradeToDigital", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stripe.subscriptions.retrieve.mockResolvedValue(sub());
    stripe.subscriptionSchedules.create.mockResolvedValue({ id: "sched_1", current_phase: { start_date: 1 } });
    stripe.subscriptionSchedules.update.mockResolvedValue({});
    stripe.subscriptionSchedules.release.mockResolvedValue({});
  });

  it("creates a schedule that ends on the digital price", async () => {
    const res = await provider.downgradeToDigital("sub_1", "EUR", future);
    expect(res.effectiveAt).toBe(new Date(Math.floor(new Date(future).getTime() / 1000) * 1000).toISOString());
    const phases = stripe.subscriptionSchedules.update.mock.calls[0][1].phases;
    expect(phases[1].items[0].price).toBe("price_digital");
  });

  it("releases the new schedule when the update fails", async () => {
    stripe.subscriptionSchedules.update.mockRejectedValue(new Error("boom"));
    await expect(provider.downgradeToDigital("sub_1", "EUR", future)).rejects.toThrow("boom");
    expect(stripe.subscriptionSchedules.release).toHaveBeenCalledWith("sched_1");
  });

  it("is idempotent when a schedule to digital already exists", async () => {
    stripe.subscriptions.retrieve.mockResolvedValue(sub({ schedule: "sched_old" }));
    stripe.subscriptionSchedules.retrieve.mockResolvedValue({
      phases: [{ items: [{ price: "price_club" }], start_date: 1 }, { items: [{ price: "price_digital" }], start_date: 1_800_000_000 }],
    });
    const res = await provider.downgradeToDigital("sub_1", "EUR", future);
    expect(res.effectiveAt).toBe(new Date(1_800_000_000 * 1000).toISOString());
    expect(stripe.subscriptionSchedules.create).not.toHaveBeenCalled();
  });
});
