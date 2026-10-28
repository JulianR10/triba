import { describe, expect, it } from "vitest";
import { isActiveSubscription, subscriptionStatusInfo } from "../src/lib/subscription-status";

describe("subscriptionStatusInfo", () => {
  it("etiqueta las canceladas en vez de mostrar el estado crudo", () => {
    expect(subscriptionStatusInfo("canceled", "es").label).toBe("Suscripción cancelada");
    expect(subscriptionStatusInfo("canceled", "en").label).toBe("Subscription canceled");
  });

  it("no dice 'activa' cuando el período ya venció", () => {
    const info = subscriptionStatusInfo("active", "es", "2000-01-01T00:00:00.000Z");
    expect(info.label).toBe("Tu suscripción venció");
    expect(info.active).toBe(false);
    expect(subscriptionStatusInfo("active", "es", "2999-01-01T00:00:00.000Z").label).toBe("Suscripción activa");
  });

  it("nunca muestra un estado desconocido en inglés técnico", () => {
    expect(subscriptionStatusInfo("some_new_state", "es").label).not.toContain("some_new_state");
  });
});

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
