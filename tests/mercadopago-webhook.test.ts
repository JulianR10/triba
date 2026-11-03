import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  validate: vi.fn(),
  mpGet: vi.fn(),
  resolveAuthorizedPayment: vi.fn(),
  activateSubscription: vi.fn(),
  applyMpRenewal: vi.fn(),
  sub: { current: null as any },
  updates: [] as any[],
}));

vi.mock("mercadopago", () => ({ WebhookSignatureValidator: { validate: mocks.validate } }));
vi.mock("../src/lib/supabase-admin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../src/lib/upgrade-apply", () => ({ applyUpgrade: vi.fn() }));
vi.mock("../src/lib/mercadopago-activation", () => ({
  mpGet: mocks.mpGet,
  resolveAuthorizedPayment: mocks.resolveAuthorizedPayment,
  activateSubscription: mocks.activateSubscription,
  applyMpRenewal: mocks.applyMpRenewal,
}));

let POST: (ctx: any) => Promise<Response>;

beforeAll(async () => {
  vi.stubEnv("MP_WEBHOOK_SECRET", "secret");
  ({ POST } = (await import("../src/pages/api/webhook/mercadopago")) as any);
});

const call = (body: unknown) =>
  POST({
    request: new Request("http://x/api/webhook/mercadopago", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "x-signature": "s", "x-request-id": "r" },
    }),
  });

const authorizedPayment = { type: "subscription_authorized_payment", data: { id: "7033189394" } };

describe("webhook Mercado Pago", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updates = [];
    mocks.sub.current = { id: "sub-1", status: "active" };
    mocks.validate.mockReturnValue(undefined);
    mocks.resolveAuthorizedPayment.mockResolvedValue({ preapprovalId: "pre-1", paymentId: "55", payerEmail: null, userId: "u1" });
    mocks.applyMpRenewal.mockResolvedValue(true);
    mocks.mpGet.mockResolvedValue({ status: "authorized", external_reference: "u1" });
    mocks.from.mockImplementation(() => {
      const q: Record<string, any> = {};
      for (const m of ["select", "eq"]) q[m] = vi.fn(() => q);
      q.update = vi.fn((payload: unknown) => {
        mocks.updates.push(payload);
        return q;
      });
      q.maybeSingle = vi.fn(async () => ({ data: mocks.sub.current, error: null }));
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve);
      return q;
    });
  });

  it("firma inválida → 401 y no procesa nada", async () => {
    mocks.validate.mockImplementation(() => {
      throw new Error("bad signature");
    });
    expect((await call(authorizedPayment)).status).toBe(401);
    expect(mocks.resolveAuthorizedPayment).not.toHaveBeenCalled();
  });

  it("cobro aprobado de una sub activa → extiende el período", async () => {
    expect((await call(authorizedPayment)).status).toBe(200);
    expect(mocks.applyMpRenewal).toHaveBeenCalledWith("sub-1", "pre-1");
    expect(mocks.activateSubscription).not.toHaveBeenCalled();
  });

  it("si no puede guardar la renovación → 500 (MP reintenta)", async () => {
    mocks.applyMpRenewal.mockRejectedValue(new Error("renewal update failed"));
    expect((await call(authorizedPayment)).status).toBe(500);
  });

  it("cobro no resoluble → 500 (MP reintenta) sin tocar la suscripción", async () => {
    mocks.resolveAuthorizedPayment.mockResolvedValue(null);
    expect((await call(authorizedPayment)).status).toBe(500);
    expect(mocks.applyMpRenewal).not.toHaveBeenCalled();
    expect(mocks.activateSubscription).not.toHaveBeenCalled();
  });

  it("cobro que se vuelve legible en el reintento → renueva en la misma llamada", async () => {
    mocks.resolveAuthorizedPayment
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ preapprovalId: "pre-1", paymentId: "pay-1", payerEmail: null, userId: null });
    expect((await call(authorizedPayment)).status).toBe(200);
    expect(mocks.applyMpRenewal).toHaveBeenCalledWith("sub-1", "pre-1");
  });

  it("primer cobro aprobado de una sub incomplete → activa con pago confirmado", async () => {
    mocks.sub.current = { id: "sub-1", status: "incomplete" };
    expect((await call(authorizedPayment)).status).toBe(200);
    expect(mocks.applyMpRenewal).not.toHaveBeenCalled();
    expect(mocks.activateSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", providerSubscriptionId: "pre-1", confirmedPayment: true }),
    );
  });

  it.each(["cancelled", "paused", "expired"])("preapproval %s → frena la recurrencia y conserva el acceso", async (status) => {
    mocks.mpGet.mockResolvedValue({ status });
    expect((await call({ type: "subscription_preapproval", data: { id: "pre-1" } })).status).toBe(200);
    expect(mocks.updates[0]).toMatchObject({ cancel_at_period_end: true });
    expect(mocks.updates[0]).not.toHaveProperty("status");
  });

  it("preapproval autorizado sin usuaria resoluble → 200 sin activar", async () => {
    mocks.mpGet.mockImplementation(async (path: string) =>
      path.startsWith("/preapproval/") ? { status: "authorized" } : { results: [] },
    );
    expect((await call({ type: "subscription_preapproval", data: { id: "pre-1" } })).status).toBe(200);
    expect(mocks.activateSubscription).not.toHaveBeenCalled();
  });
});
