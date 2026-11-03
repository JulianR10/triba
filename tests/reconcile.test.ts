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

import {
  applyReconcileCandidates,
  healProfileSubscriptions,
  renewExpiredMpSubscriptions,
  renewExpiredStripeSubscriptions,
} from "../src/lib/reconcile";

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

describe("renewExpiredStripeSubscriptions (respaldo del webhook Stripe)", () => {
  const oldEnd = "2026-10-22T21:29:41Z";
  const newEnd = Math.floor(Date.parse("2026-11-22T21:29:41Z") / 1000);
  let updates: Record<string, unknown>[];
  let updateError: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    updates = [];
    updateError = null;
    mocks.from.mockImplementation(() => {
      let op = "select";
      const q: Record<string, any> = {};
      for (const m of ["select", "eq", "in", "lt", "order", "limit"]) q[m] = vi.fn(() => q);
      q.update = vi.fn((value: Record<string, unknown>) => {
        op = "update";
        updates.push(value);
        return q;
      });
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(
          op === "update"
            ? { error: updateError }
            : { data: [{ id: "sub-1", provider_subscription_id: "stripe-1", current_period_end: oldEnd }], error: null },
        ).then(resolve);
      return q;
    });
  });

  const stripeSub = (status: string, end = newEnd) => ({
    id: "stripe-1",
    status,
    cancel_at_period_end: false,
    items: { data: [{ current_period_start: end - 2592000, current_period_end: end }] },
  });

  it("adelanta el período si Stripe ya renovó y el webhook no lo aplicó", async () => {
    mocks.stripeRetrieve.mockResolvedValue(stripeSub("active"));
    await expect(renewExpiredStripeSubscriptions()).resolves.toEqual({ renewed: 1, failed: 0 });
    expect(updates[0]).toMatchObject({ status: "active", current_period_end: new Date(newEnd * 1000).toISOString() });
  });

  it("también recupera past_due (Stripe sigue reintentando)", async () => {
    mocks.stripeRetrieve.mockResolvedValue(stripeSub("past_due"));
    await expect(renewExpiredStripeSubscriptions()).resolves.toEqual({ renewed: 1, failed: 0 });
    expect(updates[0]).toMatchObject({ status: "past_due" });
  });

  it.each([
    ["cancelada en Stripe", stripeSub("canceled")],
    ["impaga (Stripe se rindió)", stripeSub("unpaid")],
    ["sin período nuevo", stripeSub("active", Math.floor(Date.parse(oldEnd) / 1000))],
  ])("no toca nada si %s", async (_name, sub) => {
    mocks.stripeRetrieve.mockResolvedValue(sub);
    await expect(renewExpiredStripeSubscriptions()).resolves.toEqual({ renewed: 0, failed: 0 });
    expect(updates).toHaveLength(0);
  });

  it("cuenta el fallo si Stripe o el guardado fallan", async () => {
    mocks.stripeRetrieve.mockRejectedValueOnce(new Error("stripe down"));
    await expect(renewExpiredStripeSubscriptions()).resolves.toEqual({ renewed: 0, failed: 1 });
    mocks.stripeRetrieve.mockResolvedValue(stripeSub("active"));
    updateError = { message: "db down" };
    await expect(renewExpiredStripeSubscriptions()).resolves.toEqual({ renewed: 0, failed: 1 });
  });
});

describe("healProfileSubscriptions (puntero del perfil)", () => {
  const future = new Date(Date.now() + 10 * 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();
  let subs: any[];
  let profiles: any[];
  let updates: { payload: any; id: unknown }[];
  let updateError: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    updates = [];
    updateError = null;
    subs = [];
    profiles = [];
    mocks.from.mockImplementation((table: string) => {
      let op = "select";
      let payload: any;
      const q: Record<string, any> = {};
      for (const m of ["select", "in", "order", "limit"]) q[m] = vi.fn(() => q);
      q.eq = vi.fn((column: string, value: unknown) => {
        if (op === "update" && column === "id") updates.push({ payload, id: value });
        return q;
      });
      q.update = vi.fn((value: unknown) => {
        op = "update";
        payload = value;
        return q;
      });
      q.maybeSingle = vi.fn(async () => ({ data: table === "profiles" ? { role: "free" } : null }));
      q.then = (resolve: (v: unknown) => unknown) => {
        if (op === "update") return Promise.resolve({ error: updateError }).then(resolve);
        return Promise.resolve({ data: table === "subscriptions" ? subs : profiles, error: null }).then(resolve);
      };
      return q;
    });
  });

  it("reenlaza al perfil cuyo puntero quedó en una fila vencida y fija el rol", async () => {
    subs = [{ id: "vivo", user_id: "u1", provider: "mercadopago", status: "active", current_period_end: future }];
    profiles = [{ id: "u1", role: "free", subscription_id: "viejo" }];
    await expect(healProfileSubscriptions()).resolves.toEqual({ healed: 1, failed: 0 });
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({ subscription_id: "vivo", role: "subscriber" });
  });

  it("también cura al perfil sin puntero", async () => {
    subs = [{ id: "vivo", user_id: "u1", provider: "stripe", status: "active", current_period_end: future }];
    profiles = [{ id: "u1", role: "free", subscription_id: null }];
    await expect(healProfileSubscriptions()).resolves.toEqual({ healed: 1, failed: 0 });
  });

  it("no mueve un puntero que ya apunta a una fila viva (ni toca el rol de una admin)", async () => {
    subs = [
      { id: "a", user_id: "u1", provider: "stripe", status: "active", current_period_end: future },
      { id: "b", user_id: "u1", provider: "mercadopago", status: "active", current_period_end: future },
      { id: "c", user_id: "u2", provider: "stripe", status: "active", current_period_end: future },
    ];
    profiles = [
      { id: "u1", role: "subscriber", subscription_id: "b" },
      { id: "u2", role: "admin", subscription_id: "c" },
    ];
    await expect(healProfileSubscriptions()).resolves.toEqual({ healed: 0, failed: 0 });
    expect(updates).toHaveLength(0);
  });

  it("una fila vencida no cuenta como viva", async () => {
    subs = [{ id: "viejo", user_id: "u1", provider: "stripe", status: "active", current_period_end: past }];
    profiles = [{ id: "u1", role: "subscriber", subscription_id: "viejo" }];
    await expect(healProfileSubscriptions()).resolves.toEqual({ healed: 0, failed: 0 });
  });

  it("si no puede guardar lo cuenta como fallo", async () => {
    subs = [{ id: "vivo", user_id: "u1", provider: "stripe", status: "active", current_period_end: future }];
    profiles = [{ id: "u1", role: "free", subscription_id: null }];
    updateError = { message: "db down" };
    await expect(healProfileSubscriptions()).resolves.toEqual({ healed: 0, failed: 1 });
  });
});
