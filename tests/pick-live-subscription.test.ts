import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pointer: { current: null as string | null }, rows: { current: [] as any[] } }));

vi.mock("../src/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const q: Record<string, any> = {};
      for (const m of ["select", "eq", "in"]) q[m] = vi.fn(() => q);
      q.maybeSingle = vi.fn(async () => ({ data: table === "profiles" ? { subscription_id: mocks.pointer.current } : null }));
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: mocks.rows.current, error: null }).then(resolve);
      return q;
    },
  },
}));

import { getActiveSubscriptionForUser, pickLiveSubscription } from "../src/lib/subscription-guard";

const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  provider: "mercadopago",
  status: "active",
  current_period_end: future(10),
  ...over,
});

describe("pickLiveSubscription", () => {
  it("ignora las vencidas y las que no están activas", () => {
    expect(pickLiveSubscription([row("a", { current_period_end: past }), row("b", { status: "canceled" })])).toBeNull();
  });

  it("prefiere la que apunta el perfil, luego una paga sobre una migrada, luego la que vence más tarde", () => {
    expect(pickLiveSubscription([row("a"), row("b")], "b")?.id).toBe("b");
    expect(pickLiveSubscription([row("m", { provider: "migrated" }), row("p")])?.id).toBe("p");
    expect(pickLiveSubscription([row("corta", { current_period_end: future(3) }), row("larga", { current_period_end: future(20) })])?.id).toBe("larga");
  });
});

describe("getActiveSubscriptionForUser (base del cambio de plan)", () => {
  beforeEach(() => {
    mocks.pointer.current = null;
    mocks.rows.current = [];
  });

  it("encuentra la suscripción vigente aunque el puntero del perfil apunte a una vencida", async () => {
    mocks.pointer.current = "viejo";
    mocks.rows.current = [row("viejo", { current_period_end: past }), row("vivo")];
    await expect(getActiveSubscriptionForUser("u1")).resolves.toMatchObject({ id: "vivo" });
  });

  it("encuentra la suscripción aunque el perfil no tenga puntero", async () => {
    mocks.rows.current = [row("vivo")];
    await expect(getActiveSubscriptionForUser("u1")).resolves.toMatchObject({ id: "vivo" });
  });

  it("sin suscripción vigente devuelve null (no habilita el cambio de plan)", async () => {
    mocks.pointer.current = "viejo";
    mocks.rows.current = [row("viejo", { current_period_end: past })];
    await expect(getActiveSubscriptionForUser("u1")).resolves.toBeNull();
  });
});
