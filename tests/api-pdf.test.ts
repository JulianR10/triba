import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: { current: [] as any[] },
  session: { current: null as any },
  createSignedUrl: vi.fn(),
  limited: { current: null as Response | null },
}));

vi.mock("../src/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, any> = {};
      for (const m of ["select", "eq"]) q[m] = vi.fn(() => q);
      q.maybeSingle = vi.fn(async () => ({ data: mocks.rows.current[0] ?? null }));
      q.single = vi.fn(async () => ({ data: null }));
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: mocks.rows.current }).then(resolve);
      return q;
    },
    storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
  },
}));
vi.mock("../src/lib/supabase-server", () => ({
  createSupabaseServerClient: () => ({ auth: { getSession: async () => ({ data: { session: mocks.session.current } }) } }),
}));
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../src/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => mocks.limited.current) }));

import { GET } from "../src/pages/api/pdf/[editionId]";

const version = (over: Record<string, unknown> = {}, edition: Record<string, unknown> = {}) => ({
  id: 5,
  edition_id: 2,
  language: "es",
  pdf_url: "storage://editions-pdfs/edicion-2.pdf",
  editions: { id: 2, featured: false, kind: "paid", edition_number: 2, ...edition },
  ...over,
});

const call = (opts: { locals?: any; headers?: Record<string, string>; search?: string; id?: string } = {}) =>
  GET({
    params: { editionId: opts.id ?? "5" },
    request: new Request(`http://x/api/pdf/5${opts.search ?? ""}`, { headers: opts.headers }),
    url: new URL(`http://x/api/pdf/5${opts.search ?? ""}`),
    locals: opts.locals ?? { profile: null, hasActiveSub: false },
  } as any);

const fetchHeaders = { "sec-fetch-mode": "cors" };
const subscriber = { profile: { role: "subscriber" }, hasActiveSub: true };

describe("GET /api/pdf/[editionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows.current = [version()];
    mocks.session.current = null;
    mocks.limited.current = null;
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed/url" }, error: null });
  });

  it("id no numérico → 400; edición inexistente → 404; sin PDF → 404", async () => {
    expect((await call({ id: "abc" })).status).toBe(400);
    mocks.rows.current = [];
    expect((await call()).status).toBe(404);
    mocks.rows.current = [version({ pdf_url: null })];
    expect((await call()).status).toBe(404);
  });

  it("corta si el rate limit lo pide", async () => {
    mocks.limited.current = new Response("{}", { status: 429 });
    expect((await call({ locals: subscriber })).status).toBe(429);
  });

  it("suscriptora vigente → 302 a la URL firmada de 5 minutos", async () => {
    const res = await call({ locals: subscriber });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://signed/url");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("edicion-2.pdf", 300, { download: false });
  });

  it("?download=1 pide la URL firmada como descarga", async () => {
    await call({ locals: subscriber, search: "?download=1" });
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("edicion-2.pdf", 300, { download: true });
  });

  it("admin entra aunque no tenga suscripción", async () => {
    const res = await call({ locals: { profile: { role: "admin" }, hasActiveSub: false } });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://signed/url");
  });

  it("sin sesión, pedido de datos → 401 login_required y no firma nada", async () => {
    const res = await call({ headers: fetchHeaders });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("login_required");
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it("con sesión pero sin suscripción vigente, pedido de datos → 403 subscription_required", async () => {
    mocks.session.current = { user: { id: "u1" } };
    const res = await call({ headers: fetchHeaders, locals: { profile: { role: "subscriber" }, hasActiveSub: false } });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("subscription_required");
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it("navegación sin sesión → redirige al login con el retorno; en inglés al login EN", async () => {
    const es = await call({ headers: { "sec-fetch-mode": "navigate" } });
    expect(es.status).toBe(302);
    expect(es.headers.get("Location")).toBe(`/iniciar-sesion?redirect=${encodeURIComponent("/api/pdf/5")}`);
    const en = await call({ headers: { "sec-fetch-mode": "navigate" }, search: "?lang=en" });
    expect(en.headers.get("Location")).toMatch(/^\/en\/iniciar-sesion\?redirect=/);
  });

  it("navegación con sesión pero sin suscripción → redirige a suscribirme", async () => {
    mocks.session.current = { user: { id: "u1" } };
    const res = await call({ headers: { "sec-fetch-mode": "navigate" }, locals: { profile: { role: "subscriber" }, hasActiveSub: false } });
    expect(res.headers.get("Location")).toBe("/suscribirme");
  });

  it("la edición destacada y las gratuitas se leen sin sesión", async () => {
    mocks.rows.current = [version({}, { featured: true })];
    expect((await call()).headers.get("Location")).toBe("https://signed/url");
    mocks.rows.current = [version({}, { kind: "free" })];
    expect((await call()).headers.get("Location")).toBe("https://signed/url");
  });

  it("si Storage no puede firmar → 500 sin filtrar el detalle", async () => {
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: { message: "bucket secret detail" } });
    const res = await call({ locals: subscriber });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret");
  });

  it("una URL externa también pasa por el control de acceso", async () => {
    mocks.rows.current = [version({ pdf_url: "https://otro-sitio.com/revista.pdf" })];
    const denied = await call({ headers: fetchHeaders });
    expect(denied.status).toBe(401);
    const allowed = await call({ locals: subscriber });
    expect(allowed.status).toBe(302);
    expect(allowed.headers.get("Location")).toBe("https://otro-sitio.com/revista.pdf");
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });
});
