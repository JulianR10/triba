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

const STATUS_LABELS: Record<string, { es: string; en: string }> = {
  active: { es: "Suscripción activa", en: "Active subscription" },
  migrated: { es: "Suscripción migrada (7 días)", en: "Migrated subscription (7 days)" },
  past_due: { es: "Tu último cobro falló", en: "Your last payment failed" },
  incomplete: { es: "Pago en proceso", en: "Payment processing" },
  trialing: { es: "Período de prueba", en: "Trial period" },
};

const STATUS_ACTIONS: Record<string, { es: string; en: string }> = {
  past_due: { es: "Actualizar medio de pago", en: "Update payment method" },
};

export function subscriptionStatusInfo(
  status?: string | null,
  locale: "es" | "en" = "es"
): SubscriptionStatusInfo {
  if (!status) {
    return {
      active: false,
      label: locale === "en" ? "You're not subscribed yet" : "Aún no estás suscripta",
      action: null,
    };
  }

  const label = STATUS_LABELS[status]?.[locale] ?? status;
  const action = STATUS_ACTIONS[status]?.[locale] ?? null;
  // P7: active coherente con isActiveSubscription para migrated (requiere no expirada); callers con fecha usan hasActiveSub aparte
  const active = isActiveSubscription(status);

  return { active, label, action };
}