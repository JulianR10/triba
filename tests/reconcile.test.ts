import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  stripeRetrieve: vi.fn(),
  mpGet: vi.fn(),
  applyMpRenewal: vi.fn(),
  activateSubscription: vi.fn(),
  syncPaidSubscriber: vi.fn(),
  sendWelcomeEmail: vi.fn(),
  getPreferredLocale: vi.fn(),
  sendMailClubActivation: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  blockIfDuplicateCheckout: vi.fn(),
}));

vi.mock("../src/lib/supabase-admin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("../src/lib/stripe", () => ({ stripe: { subscriptions: { retrieve: mocks.stripeRetrieve } } }));
vi.mock("../src/lib/mercadopago-activation", () => ({
  activateSubscription: mocks.activateSubscription,
  applyMpRenewal: mocks.applyMpRenewal,
  mpGet: mocks.mpGet,
}));
vi.mock("../src/lib/duplicate-checkout", () => ({ blockIfDuplicateCheckout: mocks.blockIfDuplicateCheckout }));
vi.mock("../src/lib/sender", () => ({ syncPaidSubscriber: mocks.syncPaidSubscriber }));
vi.mock("../src/lib/email", () => ({ sendWelcomeEmail: mocks.sendWelcomeEmail }));
vi.mock("../src/lib/locale-pref", () => ({ getPreferredLocale: mocks.getPreferredLocale }));
vi.mock("../src/lib/mail-club-activation", () => ({ sendMailClubActivation: mocks.sendMailClubActivation }));
vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError, info: mocks.loggerInfo, warn: mocks.loggerWarn },
}));

import { applyReconcileCandidates, renewExpiredMpSubscriptions } from "../src/lib/reconcile";

describe("reconcile Stripe candidates", () => {
  const periodStart = Math.floor(Date.parse("2026-10-01T00:00:00Z") / 1000);
  const periodEnd = Math.floor(Date.parse("2026-11-01T00:00:00Z") / 1000);
  let localSubscriptionStatus: string;
  let updatePayloads: Record<string, unknown>[];
  let profileUpserts: Record<string, unknown>[];

  beforeEach(() => {
    vi.clearAllMocks();
    localSubscriptionStatus = "incomplete";
    mocks.blockIfDuplicateCheckout.mockResolvedValue(false);
    updatePayloads = [];
    profileUpserts = [];
    mocks.stripeRetrieve.mockResolvedValue({
      id: "stripe-sub-1",
      status: "active",
      created: periodStart,
      current_period_start: periodStart,
      current_period_end: periodEnd,
    });

    mocks.from.mockImplementation((table: string) => {
      let operation: "select" | "update" | "upsert" = "select";
      let payload: Record<string, unknown> | undefined;
      const filters: [string, unknown][] = [];
      const query: Record<string, any> = {};

      query.select = vi.fn(() => query);
      query.eq = vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      });
      query.neq = vi.fn((column: string, value: unknown) => {
        filters.push([`not:${column}`, value]);
        return query;
      });
      query.update = vi.fn((value: Record<string, unknown>) => {
        operation = "update";
        payload = value;
        updatePayloads.push(value);
        return query;
      });
      query.upsert = vi.fn((value: Record<string, unknown>) => {
        operation = "upsert";
        payload = value;
        profileUpserts.push(value);
        return query;
      });
      query.maybeSingle = vi.fn(async () => ({ data: table === "profiles" ? { email: "" } : null, error: null }));
      query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        if (operation === "upsert") {
          return Promise.resolve({ data: payload, error: null }).then(resolve, reject);
        }
        if (operation === "update") {
          const data = payload?.status === "active" && localSubscriptionStatus !== "active"
            ? [{ id: "sub-1" }]
            : null;
          if (data) localSubscriptionStatus = "active";
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        }
        if (table === "subscriptions") {
          const rows = [
            {
              id: "sub-1",
              user_id: "user-1",
              provider: "stripe",
              plan_type: "digital",
              plan_currency: "EUR",
              status: localSubscriptionStatus,
              provider_subscription_id: "stripe-sub-1",
            },
            {
              id: "sub-past-due",
              user_id: "user-2",
              provider: "stripe",
              plan_type: "digital",
              plan_currency: "EUR",
              status: "past_due",
              provider_subscription_id: "stripe-sub-2",
            },
          ];
          const statusFilter = filters.find(([column]) => column === "status")?.[1];
          const data = rows.filter((row) => !statusFilter || row.status === statusFilter);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      };
      return query;
    });
  });

  it("reconciles only incomplete rows and preserves Stripe's real period dates", async () => {
    const result = await applyReconcileCandidates();

    expect(result.failed).toEqual([]);
    expect(mocks.stripeRetrieve).toHaveBeenCalledTimes(2);
    expect(updatePayloads[0]).toMatchObject({
      status: "active",
      current_period_start: new Date(periodStart * 1000).toISOString(),
      current_period_end: new Date(periodEnd * 1000).toISOString(),
    });
    expect(profileUpserts).toHaveLength(1);
    expect(profileUpserts[0]).toMatchObject({ id: "user-1", subscription_id: "sub-1" });
    expect(mocks.mpGet).not.toHaveBeenCalled();
    expect(mocks.sendWelcomeEmail).not.toHaveBeenCalled();

    const repeated = await applyReconcileCandidates();
    expect(repeated.activated).toEqual([]);
    expect(mocks.stripeRetrieve).toHaveBeenCalledTimes(2);
    expect(profileUpserts).toHaveLength(1);
  });

  it("si ya había otra suscripción paga vigente, no repunta el perfil ni da la bienvenida", async () => {
    mocks.blockIfDuplicateCheckout.mockResolvedValue(true);
    const result = await applyReconcileCandidates();
    expect(result.failed).toEqual([]);
    expect(profileUpserts).toEqual([]);
    expect(mocks.sendWelcomeEmail).not.toHaveBeenCalled();
  });
});

describe("renewExpiredMpSubscriptions (red de seguridad del webhook MP)", () => {
  const end = "2026-10-22T21:29:41Z";
  const rows = [{ id: "sub-1", provider_subscription_id: "pre-1", current_period_end: end }];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyMpRenewal.mockResolvedValue(true);
    mocks.from.mockImplementation(() => {
      const q: Record<string, any> = {};
      for (const m of ["select", "eq", "lt", "order", "limit"]) q[m] = vi.fn(() => q);
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
      return q;
    });
  });

  it("renueva si MP sigue authorized y cobró después del vencimiento", async () => {
    mocks.mpGet.mockResolvedValue({ status: "authorized", summarized: { last_charged_date: "2026-10-22T22:19:03Z" } });
    await expect(renewExpiredMpSubscriptions()).resolves.toEqual({ renewed: 1, failed: 0 });
    expect(mocks.applyMpRenewal).toHaveBeenCalledWith("sub-1", "pre-1");
  });

  it.each([
    ["cancelada", { status: "cancelled", summarized: { last_charged_date: "2026-10-22T22:19:03Z" } }],
    ["pausada", { status: "paused", summarized: { last_charged_date: "2026-10-22T22:19:03Z" } }],
    ["sin cobro posterior (solo el primero)", { status: "authorized", summarized: { last_charged_date: "2026-09-22T21:29:41Z" } }],
    ["MP no responde", null],
  ])("no renueva si %s", async (_name, preapproval) => {
    mocks.mpGet.mockResolvedValue(preapproval);
    await expect(renewExpiredMpSubscriptions()).resolves.toEqual({ renewed: 0, failed: 0 });
    expect(mocks.applyMpRenewal).not.toHaveBeenCalled();
  });

  it("cuenta el fallo al guardar y sigue con las demás", async () => {
    mocks.mpGet.mockResolvedValue({ status: "authorized", summarized: { last_charged_date: "2026-10-22T22:19:03Z" } });
    mocks.applyMpRenewal.mockRejectedValue(new Error("renewal update failed"));
    await expect(renewExpiredMpSubscriptions()).resolves.toEqual({ renewed: 0, failed: 1 });
  });
});
