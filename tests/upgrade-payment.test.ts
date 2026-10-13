import { describe, expect, it } from "vitest";
import { getSubscriptionSavedCard } from "../src/lib/upgrade-payment";

function fakeStripe(sub: unknown, customer: unknown) {
  return {
    subscriptions: { retrieve: async () => sub },
    customers: { retrieve: async () => customer },
  } as any;
}

describe("getSubscriptionSavedCard", () => {
  it("usa el medio por defecto de la suscripción cuando existe", async () => {
    const stripe = fakeStripe(
      { id: "sub_1", customer: "cus_1", default_payment_method: "pm_sub" },
      { id: "cus_1" },
    );
    await expect(getSubscriptionSavedCard(stripe, "sub_1")).resolves.toEqual({
      customerId: "cus_1",
      paymentMethodId: "pm_sub",
    });
  });

  it("usa el customer expandido y cae al medio del customer", async () => {
    const stripe = fakeStripe(
      { id: "sub_1", customer: { id: "cus_9" }, default_payment_method: null },
      { id: "cus_9", invoice_settings: { default_payment_method: "pm_cus" } },
    );
    await expect(getSubscriptionSavedCard(stripe, "sub_1")).resolves.toEqual({
      customerId: "cus_9",
      paymentMethodId: "pm_cus",
    });
  });

  it("devuelve null si el customer fue eliminado", async () => {
    const stripe = fakeStripe(
      { id: "sub_1", customer: "cus_1", default_payment_method: null },
      { id: "cus_1", deleted: true },
    );
    await expect(getSubscriptionSavedCard(stripe, "sub_1")).resolves.toBeNull();
  });

  it("devuelve null sin tarjeta reutilizable y va a Checkout", async () => {
    const stripe = fakeStripe(
      { id: "sub_1", customer: "cus_1", default_payment_method: null },
      { id: "cus_1", invoice_settings: { default_payment_method: null } },
    );
    await expect(getSubscriptionSavedCard(stripe, "sub_1")).resolves.toBeNull();
  });

  it("devuelve null sin customer y va a Checkout", async () => {
    const stripe = fakeStripe(
      { id: "sub_1", customer: null, default_payment_method: null },
      null,
    );
    await expect(getSubscriptionSavedCard(stripe, "sub_1")).resolves.toBeNull();
  });
});
