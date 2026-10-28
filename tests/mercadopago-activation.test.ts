import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  blockIfDuplicateCheckout: vi.fn(),
  existing: null as any,
  upserts: [] as any[],
}));

vi.mock("../src/lib/supabase-admin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../src/lib/sender", () => ({ syncPaidSubscriber: vi.fn(async () => {}) }));
vi.mock("../src/lib/email", () => ({ sendWelcomeEmail: vi.fn(async () => {}) }));
vi.mock("../src/lib/locale-pref", () => ({ getPreferredLocale: vi.fn(async () => "es") }));
vi.mock("../src/lib/mail-club-activation", () => ({ sendMailClubActivation: vi.fn(async () => {}) }));
vi.mock("../src/lib/profile-role", () => ({ roleAfterPayment: vi.fn(async () => "subscriber") }));
vi.mock("../src/lib/duplicate-checkout", () => ({ blockIfDuplicateCheckout: mocks.blockIfDuplicateCheckout }));

import { activateSubscription } from "../src/lib/mercadopago-activation";

const digitalPreapproval = {
  status: "authorized",
  reason: "Suscripción Triba (ARS)",
  next_payment_date: "2099-01-01T00:00:00Z",
  auto_recurring: { currency_id: "ARS" },
};

const run = () =>
  activateSubscription({
    preapproval: digitalPreapproval,
    userId: "u1",
    providerSubscriptionId: "pre_1",
    confirmedPayment: false,
  });

describe("activateSubscription (MP): eventos repetidos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upserts = [];
    mocks.blockIfDuplicateCheckout.mockResolvedValue(false);
    mocks.from.mockImplementation(() => {
      let isUpsert = false;
      const q: Record<string, any> = {};
      for (const m of ["select", "eq", "is", "update"]) q[m] = vi.fn(() => q);
      q.upsert = vi.fn((payload: unknown) => {
        isUpsert = true;
        mocks.upserts.push(payload);
        return q;
      });
      q.single = vi.fn(async () => ({ data: { id: "sub-1" }, error: null }));
      q.maybeSingle = vi.fn(async () => ({ data: mocks.existing }));
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null, isUpsert }).then(resolve);
      return q;
    });
  });

  it("un upgrade ya aplicado no se revierte a digital por un evento posterior", async () => {
    mocks.existing = { id: "sub-1", status: "active", plan_type: "mail_club" };
    await run();
    expect(mocks.upserts[0]).toMatchObject({ plan_type: "mail_club" });
  });

  it("una fila ya activa no vuelve a revisar duplicadas", async () => {
    mocks.existing = { id: "sub-1", status: "active", plan_type: "digital" };
    await run();
    expect(mocks.blockIfDuplicateCheckout).not.toHaveBeenCalled();
  });

  it("un alta nueva toma el plan del preapproval y revisa duplicadas", async () => {
    mocks.existing = null;
    await run();
    expect(mocks.upserts[0]).toMatchObject({ plan_type: "digital" });
    expect(mocks.blockIfDuplicateCheckout).toHaveBeenCalledTimes(1);
  });
});
