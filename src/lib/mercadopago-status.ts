// Decisiones puras de estado Mercado Pago (sin I/O: testeables en vitest).
// El resto de la activación vive en ./mercadopago-activation.

export function isActivePreapproval(status?: string): boolean {
  return status === "authorized" || status === "active";
}

// El `reason` es lo único que MP nos devuelve para saber qué plan se contrató (la preaprobación
// se crea sin fila local previa). Se escribe y se lee SOLO acá: no cambiar el texto sin migrar las
// preaprobaciones ya creadas, que seguirán diciendo "Mail Club".
const MAIL_CLUB_REASON_MARKER = "Mail Club";

export function preapprovalReason(plan: "digital" | "mail_club", currency: string): string {
  return plan === "mail_club"
    ? `Suscripción Triba ${MAIL_CLUB_REASON_MARKER} (${currency})`
    : `Suscripción Triba (${currency})`;
}

export function planFromPreapproval(preapproval: { reason?: string }): "digital" | "mail_club" {
  return preapproval.reason?.includes(MAIL_CLUB_REASON_MARKER) ? "mail_club" : "digital";
}

// Invariante: un pago aprobado es fuente de verdad aunque la preaprobación
// reporte "pending" (consistencia eventual de MP). El gate de estado aplica
// únicamente al evento preapproval (confirmedPayment=false). Regresión
// 03-oct-2026: el gate incondicional dejaba Mail Club en 'incomplete'
// con el cobro acreditado.
export function isActivationBlocked(confirmedPayment: boolean, preapprovalStatus?: string): boolean {
  return !confirmedPayment && !isActivePreapproval(preapprovalStatus);
}
