import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getPortalUrl: vi.fn(),
  sub: null as any,
  subError: null as any,
}));

vi.mock("../src/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../src/lib/rate-limit", () => ({ enforceRateLimit: async () => null }));
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("../src/lib/site-url", () => ({ getSiteOrigin: () => "https://x.test" }));
vi.mock("../src/lib/locale-pref", () => ({ getPreferredLocale: async () => "en" }));
vi.mock("../src/lib/payment-provider", () => ({
  getPaymentProvider: () => ({ getPortalUrl: mocks.getPortalUrl }),
}));
vi.mock("../src/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, any> = {};
      for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: mocks.sub, error: mocks.subError });
      return q;
    },
  },
}));

import { POST } from "../src/pages/api/portal";

const call = () => POST({ request: new Request("http://x/api/portal", { method: "POST" }) } as any);

describe("POST /api/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sub = { provider: "stripe", provider_subscription_id: "sub_1", status: "past_due" };
    mocks.subError = null;
    mocks.requireUser.mockResolvedValue({ user: { id: "u1" } });
    mocks.getPortalUrl.mockResolvedValue({ url: "https://portal.test", provider: "stripe" });
  });

  it("devuelve la respuesta de auth si no hay sesión", async () => {
    mocks.requireUser.mockResolvedValue(new Response("no", { status: 401 }));
    expect((await call()).status).toBe(401);
  });

  it("abre el portal con el idioma de la usuaria, también en past_due", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe("https://portal.test");
    expect(mocks.getPortalUrl).toHaveBeenCalledWith("sub_1", "https://x.test", "en");
  });

  it("404 si no hay suscripción para gestionar", async () => {
    mocks.sub = null;
    expect((await call()).status).toBe(404);
  });

  it("500 genérico si falla la lectura, sin filtrar el detalle de la base", async () => {
    mocks.sub = null;
    mocks.subError = { message: "relation secret_table does not exist" };
    const res = await call();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret_table");
  });

  it("las migradas se derivan a soporte sin tocar la pasarela", async () => {
    mocks.sub = { provider: "migrated", provider_subscription_id: null, status: "active" };
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).note).toContain("soporte");
    expect(mocks.getPortalUrl).not.toHaveBeenCalled();
  });

  it("409 si falta la referencia de pago", async () => {
    mocks.sub = { provider: "stripe", provider_subscription_id: null, status: "active" };
    expect((await call()).status).toBe(409);
  });

  it("error del proveedor: 500 sin texto técnico", async () => {
    mocks.getPortalUrl.mockRejectedValue(new Error("No such customer: cus_123"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("cus_123");
  });
});
