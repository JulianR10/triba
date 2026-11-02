import { describe, expect, it } from "vitest";
import { isActivationBlocked, planFromPreapproval, preapprovalReason } from "../src/lib/mercadopago-status";

describe("plan de una preaprobación MP", () => {
  it.each(["ARS", "USD", "EUR"])("el reason que escribimos se lee de vuelta (%s)", (currency) => {
    expect(planFromPreapproval({ reason: preapprovalReason("mail_club", currency) })).toBe("mail_club");
    expect(planFromPreapproval({ reason: preapprovalReason("digital", currency) })).toBe("digital");
  });

  it("las preaprobaciones ya creadas siguen leyéndose igual", () => {
    expect(planFromPreapproval({ reason: "Suscripción Triba Mail Club (ARS)" })).toBe("mail_club");
    expect(planFromPreapproval({ reason: "Suscripción Triba (ARS)" })).toBe("digital");
  });

  it("sin reason es digital", () => {
    expect(planFromPreapproval({})).toBe("digital");
  });
});

describe("activación MP", () => {
  it("un pago aprobado activa aunque la preaprobación aún figure pending; el evento preapproval no", () => {
    expect(isActivationBlocked(true, "pending")).toBe(false);
    expect(isActivationBlocked(false, "pending")).toBe(true);
    expect(isActivationBlocked(false, "authorized")).toBe(false);
  });
});
