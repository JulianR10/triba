import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), batch: {} as Record<string, unknown> }));

vi.mock("../src/lib/supabase-admin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("../src/lib/locale-pref", () => ({ getPreferredLocale: vi.fn() }));
vi.mock("../src/lib/email", () => ({ sendDispatchNoticeEmail: vi.fn() }));

import { dispatchMailClubBatch } from "../src/lib/admin/mail-club";

describe("dispatchMailClubBatch: corte", () => {
  beforeEach(() => {
    mocks.from.mockImplementation(() => {
      const query: Record<string, any> = {};
      for (const method of ["select", "eq"]) query[method] = vi.fn(() => query);
      query.maybeSingle = vi.fn(async () => ({ data: mocks.batch }));
      return query;
    });
  });

  it("rechaza con 409 si el corte todavía no pasó", async () => {
    mocks.batch = {
      id: "b1",
      period_year: 2099,
      period_month: 1,
      status: "open",
      cutoff_at: new Date(Date.now() + 86_400_000).toISOString(),
    };
    await expect(dispatchMailClubBatch("b1")).rejects.toMatchObject({ status: 409 });
  });

  it("responde 404 si el lote no existe", async () => {
    mocks.batch = null as unknown as Record<string, unknown>;
    await expect(dispatchMailClubBatch("nope")).rejects.toMatchObject({ status: 404 });
  });
});
