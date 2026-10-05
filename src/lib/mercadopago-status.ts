// Decisiones puras de estado Mercado Pago (sin I/O: testeables en vitest).
// El resto de la activación vive en ./mercadopago-activation.

export function isActivePreapproval(status?: string): boolean {
  return status === "authorized" || status === "active";
}

export function planFromPreapproval(preapproval: { reason?: string }): "digital" | "mail_club" {
  return preapproval.reason?.includes("Mail Club") ? "mail_club" : "digital";
}

// Invariante: un pago aprobado es fuente de verdad aunque la preaprobación
// reporte "pending" (consistencia eventual de MP). El gate de estado aplica
// únicamente al evento preapproval (confirmedPayment=false). Regresión
// 03-oct-2026: el gate incondicional dejaba Mail Club en 'incomplete'
// con el cobro acreditado.
export function isActivationBlocked(confirmedPayment: boolean, preapprovalStatus?: string): boolean {
  return !confirmedPayment && !isActivePreapproval(preapprovalStatus);
}
