import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  updateUserById: vi.fn(),
  logAdminAction: vi.fn(),
}));

vi.mock("../src/lib/supabase-admin", () => ({
  supabaseAdmin: { from: mocks.from, auth: { admin: { updateUserById: mocks.updateUserById } } },
}));
vi.mock("../src/lib/admin/audit", () => ({ logAdminAction: mocks.logAdminAction }));
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { POST } from "../src/pages/api/admin/subscribers/[id]/password";

function queryReturning(data: unknown) {
  const query: Record<string, any> = {};
  for (const method of ["select", "eq", "gte"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  // Rate limiter: contador en 0 (permitido) e insert OK.
  query.insert = vi.fn(() => Promise.resolve({ error: null }));
  query.then = (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) =>
    Promise.resolve({ count: 0, error: null }).then(resolve, reject);
  return query;
}

const adminLocals = { user: { id: "admin-1" }, profile: { role: "admin", email: "a@triba.com" } };

function call(password: unknown, locals: any = adminLocals) {
  return POST({
    params: { id: "user-1" },
    locals,
    request: new Request("http://x/api", { method: "POST", body: JSON.stringify({ password }) }),
  } as any);
}

describe("POST /api/admin/subscribers/[id]/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateUserById.mockResolvedValue({ error: null });
  });

  it("rejects non-admins", async () => {
    const res = await call("12345678", { user: { id: "u" }, profile: { role: "free" } });
    expect(res.status).toBe(403);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it("rejects short passwords", async () => {
    mocks.from.mockReturnValue(queryReturning({ id: "user-1", email: "x@y.com", role: "free" }));
    const res = await call("1234567");
    expect(res.status).toBe(400);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it("does not touch another admin's password", async () => {
    mocks.from.mockReturnValue(queryReturning({ id: "user-1", email: "x@y.com", role: "admin" }));
    const res = await call("12345678");
    expect(res.status).toBe(403);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it("updates the password and audits without storing it", async () => {
    mocks.from.mockReturnValue(queryReturning({ id: "user-1", email: "x@y.com", role: "free" }));
    const res = await call("12345678");
    expect(res.status).toBe(200);
    expect(mocks.updateUserById).toHaveBeenCalledWith("user-1", { password: "12345678" });
    expect(JSON.stringify(mocks.logAdminAction.mock.calls)).not.toContain("12345678");
  });
});
