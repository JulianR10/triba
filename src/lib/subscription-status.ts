export function isActiveSubscription(
  status?: string | null,
  currentPeriodEnd?: string | null,
): boolean {
  if (!status) return false;
  if (status === "active") return true;
  if (status === "migrated") {
    if (currentPeriodEnd) {
      const periodEnd = new Date(currentPeriodEnd);
      const now = new Date();
      return periodEnd > now; // vigente si la fecha aún no pasa
    }
    // Sin fecha conocida: considerar activo (backward compat, los callers ahora
    // siempre pasan la fecha desde SSR/locals)
    return true;
  }
  return false;
}

// Estados de suscripción con mensajes contextuales para la UI
export interface SubscriptionStatusInfo {
  active: boolean;
  label: string;
  action?: string | null;
}

export function subscriptionStatusInfo(status?: string | null): SubscriptionStatusInfo {
  if (!status) return { active: false, label: "Aún no estás suscripta", action: null };

  switch (status) {
    case "active":
      return { active: true, label: "Suscripción activa", action: null };
    case "migrated":
      return { active: true, label: "Suscripción migrada (7 días)", action: null };
    case "past_due":
      return {
        active: false,
        label: "Tu último cobro falló",
        action: "Actualizar medio de pago",
      };
    case "incomplete":
      return {
        active: false,
        label: "Pago en proceso",
        action: null,
      };
    case "trialing":
      return {
        active: false,
        label: "Período de prueba",
        action: null,
      };
    default:
      return { active: false, label: status || "Desconocido", action: null };
  }
}