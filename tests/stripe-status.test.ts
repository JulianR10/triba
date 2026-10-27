import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase-admin", () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock("../src/lib/stripe", () => ({
  stripe: null,
  STRIPE_WEBHOOK_SECRET: "",
  STRIPE_PRICE_IDS: {},
  MAIL_CLUB_STRIPE_PRICE_IDS: {},
}));

import { mapStripeSubscriptionStatus, periodRange } from "../src/pages/api/webhook/stripe";

describe("mapStripeSubscriptionStatus", () => {
  it("pasa los estados con equivalente local", () => {
    expect(mapStripeSubscriptionStatus("active")).toBe("active");
    expect(mapStripeSubscriptionStatus("trialing")).toBe("trialing");
    expect(mapStripeSubscriptionStatus("past_due")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("incomplete")).toBe("incomplete");
    expect(mapStripeSubscriptionStatus("canceled")).toBe("canceled");
  });

  it("mapea unpaid a dunning e incomplete_expired a cancelada", () => {
    expect(mapStripeSubscriptionStatus("unpaid")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("incomplete_expired")).toBe("canceled");
  });

  it("marca unknown los estados sin equivalente para omitirlos sin reintento", () => {
    expect(mapStripeSubscriptionStatus("paused")).toBe("unknown");
    expect(mapStripeSubscriptionStatus("some_future_state")).toBe("unknown");
  });
});

describe("periodRange", () => {
  it("usa los períodos reales cuando Stripe los expone", () => {
    const start = 1790000000;
    const end = 1792600000;
    const range = periodRange({ current_period_start: start, current_period_end: end } as any);
    expect(range).toEqual({
      start: new Date(start * 1000).toISOString(),
      end: new Date(end * 1000).toISOString(),
    });
  });

  it("prefiere el período del item (API dahlia) sobre el fallback", () => {
    const range = periodRange({
      created: 1000,
      items: { data: [{ current_period_start: 1790000000, current_period_end: 1792678400 }] },
    } as any);
    expect(range.end).toBe(new Date(1792678400 * 1000).toISOString());
  });

  it("aplica el fallback +30d solo sin períodos reales", () => {
    const created = 1790000000;
    const range = periodRange({ created } as any);
    expect(range.start).toBe(new Date(created * 1000).toISOString());
    expect(range.end).toBe(new Date((created + 30 * 24 * 60 * 60) * 1000).toISOString());
  });
});
