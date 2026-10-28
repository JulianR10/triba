import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getActiveSubscriptionForUser: vi.fn(),
  applyUpgrade: vi.fn(),
  getSubscriptionSavedCard: vi.fn(),
  piCreate: vi.fn(),
  updates: [] as any[],
  forceCountryEnabled: false,
}));

vi.mock("../src/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../src/lib/rate-limit", () => ({ enforceRateLimit: async () => null }));
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../src/lib/site-url", () => ({ getSiteOrigin: () => "https://x.test" }));
vi.mock("../src/lib/locale-pref", () => ({ getPreferredLocale: async () => "es" }));
vi.mock("../src/lib/subscription-guard", () => ({ getActiveSubscriptionForUser: mocks.getActiveSubscriptionForUser }));
vi.mock("../src/lib/upgrade-apply", () => ({ applyUpgrade: mocks.applyUpgrade }));
vi.mock("../src/lib/upgrade-recovery", () => ({ expireStalePendingUpgrades: async () => {} }));
vi.mock("../src/lib/stripe", () => ({ stripe: { paymentIntents: { create: mocks.piCreate } } }));
vi.mock("../src/lib/mail-club-address", () => ({
  validateMailClubAddress: (b: any) => ({ ok: true, address: { country_iso: b.country_iso } }),
  saveMailClubAddress: async () => ({ ok: true }),
}));
vi.mock("../src/lib/upgrade-payment", async (orig) => ({
  ...(await orig<typeof import("../src/lib/upgrade-payment")>()),
  getSubscriptionSavedCard: mocks.getSubscriptionSavedCard,
}));
vi.mock("../src/lib/mail-club", async (orig) => {
  const orig_ = await orig<typeof import("../src/lib/mail-club")>();
  return {
  ...orig_,
  MAIL_CLUB_PAUSED: false,
  isMailClubCountryEnabled: (c: unknown) =>
    mocks.forceCountryEnabled || orig_.isMailClubCountryEnabled(c),
  };
});
vi.mock("../src/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, any> = {};
      for (const m of ["select", "eq", "insert"]) q[m] = () => q;
      q.update = (payload: unknown) => {
        mocks.updates.push(payload);
        return q;
      };
      q.single = async () => ({ data: { id: "up1" }, error: null });
      q.maybeSingle = async () => ({ data: { provider_subscription_id: "sub_1" } });
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve);
      return q;
    },
  },
}));

import { POST } from "../src/pages/api/upgrade-checkout";

const call = (body: object = { country_iso: "AR" }) =>
  POST({
    request: new Request("http://x/api/upgrade-checkout", { method: "POST", body: JSON.stringify(body) }),
  } as any);

const digitalArs = { id: "s1", provider: "mercadopago", plan_currency: "ARS", plan_type: "digital" };
const digitalEur = { id: "s2", provider: "stripe", plan_currency: "EUR", plan_type: "digital" };

describe("POST /api/upgrade-checkout: bloqueos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.forceCountryEnabled = false;
    mocks.updates = [];
    mocks.requireUser.mockResolvedValue({ user: { id: "u1", email: "a@b.com" } });
    mocks.getActiveSubscriptionForUser.mockResolvedValue(digitalArs);
  });

  it("409 sin suscripción activa", async () => {
    mocks.getActiveSubscriptionForUser.mockResolvedValue(null);
    expect((await call()).status).toBe(409);
  });

  it("409 si ya está en el Mail Club", async () => {
    mocks.getActiveSubscriptionForUser.mockResolvedValue({ ...digitalArs, plan_type: "mail_club" });
    expect((await call()).status).toBe(409);
  });

  it("409 con una suscripción migrada (sin pasarela)", async () => {
    mocks.getActiveSubscriptionForUser.mockResolvedValue({ ...digitalArs, provider: "migrated" });
    expect((await call()).status).toBe(409);
  });

  it("400 si el país de envío no está habilitado", async () => {
    expect((await call({ country_iso: "ES" })).status).toBe(400);
  });

  it("400 ZONE_MISMATCH si la moneda de la suscripción no es la de la zona", async () => {
    mocks.getActiveSubscriptionForUser.mockResolvedValue(digitalEur);
    const res = await call({ country_iso: "AR" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("ZONE_MISMATCH");
  });
});

describe("POST /api/upgrade-checkout: cobro con tarjeta guardada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updates = [];
    // Hoy solo Argentina está habilitada (ARS/MP, sin tarjeta guardada): se fuerza una zona EUR
    // para ejercitar el cobro, que es la invariante a proteger cuando se amplíe.
    mocks.forceCountryEnabled = true;
    mocks.requireUser.mockResolvedValue({ user: { id: "u1", email: "a@b.com" } });
    mocks.getActiveSubscriptionForUser.mockResolvedValue(digitalEur);
    mocks.getSubscriptionSavedCard.mockResolvedValue({ customerId: "cus_1", paymentMethodId: "pm_1" });
  });

  it("cobro hecho y el plan no se aplicó: responde pending (no error) y no marca failed", async () => {
    mocks.piCreate.mockResolvedValue({ id: "pi_1", status: "succeeded" });
    mocks.applyUpgrade.mockRejectedValue(new Error("boom"));
    const res = await call({ country_iso: "ES" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ applied: false, pending: true });
    expect(mocks.updates.some((u) => u.status === "failed")).toBe(false);
  });

  it("cobro hecho y plan aplicado: applied", async () => {
    mocks.piCreate.mockResolvedValue({ id: "pi_1", status: "succeeded" });
    mocks.applyUpgrade.mockResolvedValue(undefined);
    expect(await (await call({ country_iso: "ES" })).json()).toMatchObject({ applied: true });
  });

  it("tarjeta rechazada: 402 PAYMENT_FAILED y el upgrade queda failed", async () => {
    mocks.piCreate.mockRejectedValue(Object.assign(new Error("Your card was declined"), { type: "StripeCardError" }));
    const res = await call({ country_iso: "ES" });
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("PAYMENT_FAILED");
    expect(mocks.updates.some((u) => u.status === "failed")).toBe(true);
  });
});
