import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { current: null as any },
  verified: { current: { data: { user: null as any }, error: null as any } },
  getUser: vi.fn(),
  profile: { current: null as any },
  subscription: { current: null as any },
}));

vi.mock("astro/middleware", () => ({ defineMiddleware: (fn: unknown) => fn }));
vi.mock("../src/lib/supabase-server", () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: mocks.session.current } }),
      getUser: async () => {
        mocks.getUser();
        return mocks.verified.current;
      },
    },
  }),
}));
vi.mock("../src/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const q: Record<string, any> = {};
      for (const m of ["select", "eq"]) q[m] = vi.fn(() => q);
      q.single = vi.fn(async () => ({ data: table === "profiles" ? mocks.profile.current : mocks.subscription.current }));
      return q;
    },
  },
}));

import { onRequest } from "../src/middleware";

const future = new Date(Date.now() + 10 * 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

async function run(path: string, opts: { cookie?: string; next?: Response } = {}) {
  const locals: Record<string, any> = {};
  const redirect = (to: string, status: number) => new Response(null, { status, headers: { Location: to } });
  const next = vi.fn(async () => opts.next ?? new Response("<html></html>", { headers: { "content-type": "text/html" } }));
  const res = (await (onRequest as any)(
    {
      request: new Request(`http://x${path}`, { headers: opts.cookie ? { cookie: opts.cookie } : {} }),
      url: new URL(`http://x${path}`),
      locals,
      redirect,
    },
    next,
  )) as Response;
  return { res, locals, next };
}

const login = () => {
  mocks.session.current = { user: { id: "u1" } };
  mocks.verified.current = { data: { user: { id: "u1" } }, error: null };
};

describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.current = null;
    mocks.verified.current = { data: { user: null }, error: null };
    mocks.profile.current = null;
    mocks.subscription.current = null;
  });

  it("rutas admin sin sesión: API → 401, página → redirige al login con retorno", async () => {
    const api = await run("/api/admin/subscribers");
    expect(api.res.status).toBe(401);
    expect(api.next).not.toHaveBeenCalled();
    const page = await run("/admin/suscriptoras");
    expect(page.res.status).toBe(302);
    expect(page.res.headers.get("Location")).toBe(`/iniciar-sesion?redirect=${encodeURIComponent("/admin/suscriptoras")}`);
  });

  it("rutas admin con una usuaria que no es admin: API → 403, página → home", async () => {
    login();
    mocks.profile.current = { id: "u1", role: "subscriber", subscription_id: null };
    expect((await run("/api/admin/x")).res.status).toBe(403);
    const page = await run("/admin");
    expect(page.res.status).toBe(302);
    expect(page.res.headers.get("Location")).toBe("/");
  });

  it("una cookie de sesión armada a mano no pasa: se verifica contra Supabase Auth", async () => {
    mocks.session.current = { user: { id: "uuid-conocido" } };
    mocks.verified.current = { data: { user: null }, error: { message: "invalid JWT" } };
    const res = await run("/api/admin/subscribers");
    expect(mocks.getUser).toHaveBeenCalled();
    expect(res.res.status).toBe(401);
    expect(res.locals.user).toBeNull();
  });

  it("una admin verificada entra al panel", async () => {
    login();
    mocks.profile.current = { id: "u1", role: "admin", subscription_id: null };
    const { res, next } = await run("/api/admin/subscribers");
    expect(next).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("en páginas públicas no se verifica la sesión (solo se usa para el menú)", async () => {
    login();
    await run("/revista");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("Mi Cuenta sin sesión redirige al login (ES y EN) conservando el retorno", async () => {
    const es = await run("/mi-cuenta");
    expect(es.res.headers.get("Location")).toBe(`/iniciar-sesion?redirect=${encodeURIComponent("/mi-cuenta")}`);
    const en = await run("/en/mi-cuenta");
    expect(en.res.headers.get("Location")).toBe(`/en/iniciar-sesion?redirect=${encodeURIComponent("/en/mi-cuenta")}`);
  });

  it("gate de suscripción: vigente da acceso; período vencido no", async () => {
    login();
    mocks.profile.current = { id: "u1", role: "subscriber", subscription_id: "s1" };
    mocks.subscription.current = { id: "s1", status: "active", current_period_end: future };
    expect((await run("/revista")).locals.hasActiveSub).toBe(true);
    mocks.subscription.current = { id: "s1", status: "active", current_period_end: past };
    expect((await run("/revista")).locals.hasActiveSub).toBe(false);
    mocks.subscription.current = { id: "s1", status: "past_due", current_period_end: future };
    expect((await run("/revista")).locals.hasActiveSub).toBe(false);
  });

  it("idioma: la URL manda; la cookie solo desempata las rutas sin prefijo", async () => {
    expect((await run("/en/revista")).locals.locale).toBe("en");
    expect((await run("/en/revista", { cookie: "triba_locale=es" })).locals.locale).toBe("en");
    expect((await run("/404", { cookie: "triba_locale=en" })).locals.locale).toBe("en");
    expect((await run("/revista")).locals.locale).toBe("es");
  });

  it("páginas HTML llevan CSP y cabeceras de seguridad; los errores de la API en inglés se traducen", async () => {
    const html = await run("/");
    expect(html.res.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(html.res.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const apiRes = new Response(JSON.stringify({ error: "Ya estás en el Mail Club." }), {
      status: 409,
      headers: { "content-type": "application/json", referer: "" },
    });
    const withReferer = new Request("http://x/api/upgrade-checkout", { headers: { referer: "http://x/en/mi-cuenta" } });
    const res = (await (onRequest as any)(
      { request: withReferer, url: new URL("http://x/api/upgrade-checkout"), locals: {}, redirect: vi.fn() },
      async () => apiRes,
    )) as Response;
    expect((await res.json()).error).toBe("You're already in Mail Club.");
  });
});
