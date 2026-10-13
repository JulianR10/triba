import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  stripeRetrieve: vi.fn(),
  mpGet: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("../src/lib/supabase-admin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("../src/lib/stripe", () => ({ stripe: { subscriptions: { retrieve: mocks.stripeRetrieve } } }));
vi.mock("../src/lib/mercadopago-activation", () => ({
  activateSubscription: vi.fn(),
  mpGet: mocks.mpGet,
}));
vi.mock("../src/lib/sender", () => ({ syncPaidSubscriber: vi.fn() }));
vi.mock("../src/lib/email", () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock("../src/lib/locale-pref", () => ({ getPreferredLocale: vi.fn() }));
vi.mock("../src/lib/mail-club-activation", () => ({ sendMailClubActivation: vi.fn() }));
vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError, info: mocks.loggerInfo, warn: mocks.loggerWarn },
}));

import { findReconcileCandidates } from "../src/lib/reconcile";

function mockDb(subs: any[], emails: Record<string, string>) {
  mocks.from.mockImplementation((table: string) => {
    const filters: [string, unknown][] = [];
    const query: Record<string, any> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    });
    query.maybeSingle = vi.fn(async () => {
      if (table === "profiles") {
        const id = filters.find(([c]) => c === "id")?.[1] as string;
        return { data: emails[id] ? { email: emails[id] } : null, error: null };
      }
      return { data: null, error: null };
    });
    query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      if (table === "subscriptions") {
        const status = filters.find(([c]) => c === "status")?.[1];
        const data = subs.filter((row) => !status || row.status === status);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      }
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    };
    return query;
  });
}

const baseSub = {
  id: "sub-1",
  user_id: "user-1",
  provider: "mercadopago",
  plan_type: "mail_club",
  plan_currency: "ARS",
  status: "incomplete",
  provider_subscription_id: "mp-1",
};

describe("findReconcileCandidates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("propone MP con pago aprobado y omite el resto", async () => {
    mockDb(
      [
        { ...baseSub, id: "sub-mp-ok" },
        { ...baseSub, id: "sub-mp-pending", provider_subscription_id: "mp-pending" },
        { ...baseSub, id: "sub-past-due", status: "past_due" },
        { ...baseSub, id: "sub-other", provider: "migrated", provider_subscription_id: "mig-1" },
      ],
      { "user-1": "a@example.com" },
    );
    mocks.mpGet.mockImplementation(async (path: string) => {
      if (path.includes("mp-pending")) return { results: [{ payment: { status: "pending" } }] };
      return { results: [{ payment: { status: "approved" } }] };
    });

    const { candidates, skipped } = await findReconcileCandidates();

    expect(candidates.map((c) => c.subscription_id)).toEqual(["sub-mp-ok"]);
    expect(candidates[0]).toMatchObject({ evidence: "authorized_payment approved" });
    expect(skipped.map((s) => s.subscription_id).sort()).toEqual(["sub-mp-pending", "sub-other"]);
    // past_due nunca llega a evaluarse: el filtro es status = incomplete.
    expect(mocks.mpGet).toHaveBeenCalledTimes(2);
  });

  it("propone Stripe trialing con evidencia y omite estados no pagables", async () => {
    mockDb(
      [
        { ...baseSub, id: "sub-trial", provider: "stripe", provider_subscription_id: "stripe-trial" },
        { ...baseSub, id: "sub-unpaid", provider: "stripe", provider_subscription_id: "stripe-unpaid" },
      ],
      { "user-1": "a@example.com" },
    );
    mocks.stripeRetrieve.mockImplementation(async (id: string) => ({
      id,
      status: id === "stripe-trial" ? "trialing" : "past_due",
    }));

    const { candidates, skipped } = await findReconcileCandidates();

    expect(candidates.map((c) => c.subscription_id)).toEqual(["sub-trial"]);
    expect(candidates[0].evidence).toBe("stripe status=trialing");
    expect(skipped.map((s) => s.subscription_id)).toEqual(["sub-unpaid"]);
  });

  it("sin filas incomplete no consulta a los proveedores", async () => {
    mockDb([], {});

    const { candidates, skipped } = await findReconcileCandidates();

    expect(candidates).toEqual([]);
    expect(skipped).toEqual([]);
    expect(mocks.mpGet).not.toHaveBeenCalled();
    expect(mocks.stripeRetrieve).not.toHaveBeenCalled();
  });
});
