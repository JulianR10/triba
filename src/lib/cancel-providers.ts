import { getPaymentProvider } from "./payment-provider";
import { logger } from "./logger";

// El proveedor ya frenó la recurrencia por otro canal: no bloquear la baja
// local por eso. Se matchea por mensaje porque Stripe/MP no usan códigos
// estables para este caso (404 No such subscription, sub canceled, etc.).
export function isAlreadyCanceledProviderError(message: string): boolean {
  return /no such (subscription|preapproval)|already\s*cancel+ed|has been cancel+ed|resource\s+(not\s+found|missing)|not found/i.test(
    message,
  );
}

interface CancelableRow {
  provider: string;
  provider_subscription_id: string | null;
  cancel_at_period_end: boolean | null;
}

// Frena la recurrencia en el proveedor de TODAS las suscripciones vigentes de
// la usuaria (puede tener varias filas) antes de marcar la baja local. Corta en
// el primer error real: la RPC no debe correr si algún cobro sigue activo.
// Cortesías 'migrated' no tienen gateway y se saltean.
export async function scheduleProviderCancels(
  userId: string,
  rows: CancelableRow[],
): Promise<{ failed: true; warnings: string[] } | { failed: false; warnings: string[] }> {
  const warnings: string[] = [];
  for (const row of rows) {
    if (row.cancel_at_period_end) continue;
    if (!row.provider_subscription_id || (row.provider !== "stripe" && row.provider !== "mercadopago")) continue;
    try {
      await getPaymentProvider(row.provider).scheduleCancel(row.provider_subscription_id);
    } catch (err: any) {
      const providerMessage = err?.message || String(err);
      if (isAlreadyCanceledProviderError(providerMessage)) {
        logger.warn({ userId, providerMessage }, "cancel already canceled at provider");
        warnings.push(
          "La renovación ya figuraba frenada en el proveedor de pago; registramos la baja en Triba.",
        );
      } else {
        logger.error({ err, userId }, "cancel provider error");
        return { failed: true, warnings };
      }
    }
  }
  return { failed: false, warnings: [...new Set(warnings)] };
}
