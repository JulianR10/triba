import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  event: { current: null as any },
}));

vi.mock("../src/lib/supabase-admin", () => ({
  supabaseAdmin: { from: mocks.from, auth: { admin: { getUserById: vi.fn() } } },
}));
vi.mock("../src/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: () => mocks.event.current },
    subscriptions: {
      retrieve: async () => ({
        id: "sub_1",
        status: "active",
        created: 1790000000,
        items: { data: [{ current_period_start: 1790000000, current_period_end: 1792600000 }] },
      }),
    },
  },
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_IDS: {},
  MAIL_CLUB_STRIPE_PRICE_IDS: {},
}));
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../src/lib/sender", () => ({ syncPaidSubscriber: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/lib/email", () => ({ sendWelcomeEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/lib/locale-pref", () => ({ getPreferredLocale: vi.fn().mockResolvedValue("es") }));
vi.mock("../src/lib/mail-club-activation", () => ({ sendMailClubActivation: vi.fn() }));
vi.mock("../src/lib/upgrade-apply", () => ({ applyUpgrade: vi.fn() }));

import { POST } from "../src/pages/api/webhook/stripe";

// Cada tabla/operación devuelve lo que se le pida; el resto responde vacío sin error.
function fakeDb(overrides: { subscriptionsUpsert?: { data: unknown; error: unknown }; profilesUpsert?: { error: unknown } }) {
  mocks.from.mockImplementation((table: string) => {
    let op = "select";
    const q: Record<string, any> = {};
    for (const m of ["select", "eq", "neq", "in", "order", "limit", "update", "delete", "insert"]) q[m] = vi.fn(() => q);
    q.upsert = vi.fn(() => {
      op = "upsert";
      return q;
    });
    const result = () => {
      if (op === "upsert" && table === "subscriptions" && overrides.subscriptionsUpsert) return overrides.subscriptionsUpsert;
      if (op === "upsert" && table === "profiles" && overrides.profilesUpsert) return overrides.profilesUpsert;
      return { data: null, error: null };
    };
    q.single = vi.fn(async () => result());
    q.maybeSingle = vi.fn(async () => result());
    q.then = (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject);
    return q;
  });
}

const call = () =>
  POST({
    request: new Request("http://x/api/webhook/stripe", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "sig" },
    }),
  } as any);

const completedEvent = () => ({
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_1",
      mode: "subscription",
      subscription: "sub_1",
      client_reference_id: "u1",
      customer_email: "a@b.com",
      payment_status: "paid",
      metadata: { plan: "digital", currency: "EUR" },
    },
  },
});

describe("webhook Stripe — errores de base de datos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.event.current = completedEvent();
  });

  it("responde 500 (Stripe reintenta) si no se puede guardar la suscripción", async () => {
    fakeDb({ subscriptionsUpsert: { data: null, error: { message: "db down" } } });
    expect((await call()).status).toBe(500);
  });

  it("responde 500 si guarda la suscripción pero falla el vínculo con el perfil", async () => {
    fakeDb({
      subscriptionsUpsert: { data: { id: "s1" }, error: null },
      profilesUpsert: { error: { message: "db down" } },
    });
    expect((await call()).status).toBe(500);
  });

  it("responde 200 cuando todo se guarda", async () => {
    fakeDb({ subscriptionsUpsert: { data: { id: "s1" }, error: null }, profilesUpsert: { error: null } });
    expect((await call()).status).toBe(200);
  });

  it("responde 200 sin reintentos eternos si el evento no trae usuaria", async () => {
    mocks.event.current = {
      ...completedEvent(),
      data: { object: { ...completedEvent().data.object, client_reference_id: null, metadata: { plan: "digital" } } },
    };
    fakeDb({});
    expect((await call()).status).toBe(200);
  });
});
