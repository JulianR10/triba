import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  loggerError: vi.fn(),
  syncPaidSubscriber: vi.fn(),
  sendMailClubActivation: vi.fn(),
}));

vi.mock("../src/lib/supabase-admin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("../src/lib/logger", () => ({ logger: { error: mocks.loggerError } }));
vi.mock("../src/lib/sender", () => ({ syncPaidSubscriber: mocks.syncPaidSubscriber }));
vi.mock("../src/lib/mail-club-activation", () => ({ sendMailClubActivation: mocks.sendMailClubActivation }));

import { applyUpgrade } from "../src/lib/upgrade-apply";

function mockRow(row: unknown) {
  const update = vi.fn(() => query);
  const query: Record<string, any> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  query.update = update;
  (query as any)._update = update;
  mocks.from.mockReturnValue(query);
  return query;
}

describe("applyUpgrade", () => {
  beforeEach(() => vi.clearAllMocks());

  it("no repite un upgrade ya aplicado ni toca el proveedor", async () => {
    const query = mockRow({ id: "upg-1", status: "recurrence_updated", user_id: "u-1" });

    await expect(applyUpgrade("upg-1")).resolves.toEqual({ applied: false });
    expect((query as any)._update).not.toHaveBeenCalled();
    expect(mocks.sendMailClubActivation).not.toHaveBeenCalled();
  });

  it("rechaza upgrades que no están confirmados ni fallidos", async () => {
    mockRow({ id: "upg-1", status: "pending", user_id: "u-1" });

    await expect(applyUpgrade("upg-1")).rejects.toThrow("not payable");
  });

  it("rechaza upgrades inexistentes", async () => {
    mockRow(null);

    await expect(applyUpgrade("upg-1")).rejects.toThrow("not found");
  });
});
