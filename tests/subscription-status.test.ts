import { describe, expect, it } from "vitest";
import { isActiveSubscription } from "../src/lib/subscription-status";

describe("isActiveSubscription", () => {
  const future = "2999-01-01T00:00:00.000Z";
  const expired = "2000-01-01T00:00:00.000Z";

  it("grants active and migrated subscriptions only while their known period is current", () => {
    expect(isActiveSubscription("active", future)).toBe(true);
    expect(isActiveSubscription("active", expired)).toBe(false);
    expect(isActiveSubscription("migrated", future)).toBe(true);
    expect(isActiveSubscription("migrated", expired)).toBe(false);
  });

  it("keeps backward compatibility when the period end is unknown", () => {
    expect(isActiveSubscription("active", null)).toBe(true);
    expect(isActiveSubscription("migrated", null)).toBe(true);
  });

  it("does not grant access for payment-incomplete or terminal states", () => {
    for (const status of ["past_due", "incomplete", "trialing", "canceled", "cancelled", "unknown"]) {
      expect(isActiveSubscription(status, future), status).toBe(false);
    }
    expect(isActiveSubscription(null, future)).toBe(false);
  });

  it("denies an invalid active period date", () => {
    expect(isActiveSubscription("active", "not-a-date")).toBe(false);
  });
});
