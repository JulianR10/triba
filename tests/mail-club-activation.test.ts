import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  assignFounderNumber: vi.fn(),
  getPreferredLocale: vi.fn(),
  sendMailClubWelcomeEmail: vi.fn(),
}));

vi.mock("../src/lib/supabase-admin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("../src/lib/founders", () => ({ assignFounderNumber: mocks.assignFounderNumber }));
vi.mock("../src/lib/locale-pref", () => ({ getPreferredLocale: mocks.getPreferredLocale }));
vi.mock("../src/lib/email", () => ({ sendMailClubWelcomeEmail: mocks.sendMailClubWelcomeEmail }));

import { sendMailClubActivation } from "../src/lib/mail-club-activation";

describe("sendMailClubActivation", () => {
  let welcomeClaimed: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    welcomeClaimed = false;
    mocks.assignFounderNumber.mockResolvedValue(101);
    mocks.sendMailClubWelcomeEmail.mockResolvedValue(undefined);
    mocks.from.mockImplementation((table: string) => {
      let operation: "select" | "update" = "select";
      let updatePayload: Record<string, unknown> | undefined;
      const query: Record<string, any> = {};

      for (const method of ["select", "eq", "order", "limit", "is"]) {
        query[method] = vi.fn(() => query);
      }
      query.update = vi.fn((payload: Record<string, unknown>) => {
        operation = "update";
        updatePayload = payload;
        return query;
      });
      query.maybeSingle = vi.fn(async () => {
        if (table === "subscriptions") {
          return {
            data: {
              id: "sub-1",
              welcome_sent_at: welcomeClaimed ? "2026-10-13T12:00:00.000Z" : null,
            },
          };
        }
        return { data: null };
      });
      query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        if (operation === "update" && updatePayload?.welcome_sent_at && !welcomeClaimed) {
          welcomeClaimed = true;
          return Promise.resolve({ data: [{ id: "sub-1" }], error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      };
      return query;
    });
  });

  it("claims and sends the welcome at most once across repeated activations", async () => {
    const first = await sendMailClubActivation("user-1", "subscriber@example.com", "es");
    const retry = await sendMailClubActivation("user-1", "subscriber@example.com", "es");

    expect(first).toBe(101);
    expect(retry).toBe(101);
    expect(mocks.sendMailClubWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMailClubWelcomeEmail).toHaveBeenCalledWith(
      "subscriber@example.com",
      expect.objectContaining({ founderNumber: 101 }),
      "es",
    );
  });
});
