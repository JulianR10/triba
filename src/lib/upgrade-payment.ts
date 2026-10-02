import type Stripe from "stripe";

// Cobro del upgrade con la tarjeta guardada (Stripe off-session).
// Si no hay tarjeta o el banco exige autenticación, el llamador cae al
// Checkout mode=payment existente. Nada de esto toca Mercado Pago.

export interface SavedCard {
  customerId: string;
  paymentMethodId: string;
}

export interface UpgradePaymentIntentParams {
  amount: number;
  currency: string;
  customer: string;
  payment_method: string;
  off_session: true;
  confirm: true;
  description: string;
  metadata: {
    upgrade_id: string;
    user_id: string;
    plan: "mail_club_upgrade";
  };
}

// Parámetros puros del PaymentIntent: importe exacto de la diferencia,
// contra la tarjeta guardada, confirmación inmediata off-session.
export function buildUpgradePaymentIntentParams(args: {
  diffCents: number;
  currency: "EUR" | "USD";
  customerId: string;
  paymentMethodId: string;
  upgradeId: string;
  userId: string;
}): UpgradePaymentIntentParams {
  return {
    amount: args.diffCents,
    currency: args.currency.toLowerCase(),
    customer: args.customerId,
    payment_method: args.paymentMethodId,
    off_session: true,
    confirm: true,
    description: "Diferencia Mail Club Triba",
    metadata: {
      upgrade_id: args.upgradeId,
      user_id: args.userId,
      plan: "mail_club_upgrade",
    },
  };
}

// Clave de idempotencia por upgrade: reintentar el cobro nunca duplica cargos.
export function upgradeIdempotencyKey(upgradeId: string): string {
  return `mailclub-upgrade-${upgradeId}`;
}

// El banco exige autenticación (SCA/3DS): no es un rechazo, es derivación
// al Checkout para completar el desafío.
export function isAuthenticationRequiredError(err: any): boolean {
  return err?.code === "authentication_required" || err?.decline_code === "authentication_required";
}

// Rechazo duro de la tarjeta (fondos, vencida, etc.): se muestra inline y
// la usuaria decide si reintentar con otra tarjeta vía Checkout.
export function isCardError(err: any): boolean {
  return err?.type === "StripeCardError";
}

// Tarjeta guardada de la suscripción vigente: medio por defecto de la
// suscripción, con fallback al medio por defecto del customer.
// Null = sin tarjeta reutilizable → ir directo al Checkout.
export async function getSubscriptionSavedCard(
  stripe: Stripe,
  providerSubscriptionId: string,
): Promise<SavedCard | null> {
  const sub = await stripe.subscriptions.retrieve(providerSubscriptionId, {
    expand: ["customer", "default_payment_method"],
  });
  const customerId =
    typeof sub.customer === "string" ? sub.customer : (sub.customer as any)?.id;
  if (!customerId) return null;

  const subPm =
    typeof (sub as any).default_payment_method === "string"
      ? ((sub as any).default_payment_method as string)
      : ((sub as any).default_payment_method?.id as string | undefined);
  if (subPm) return { customerId, paymentMethodId: subPm };

  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"],
  });
  if ((customer as any)?.deleted) return null;
  const customerPm =
    typeof (customer as any)?.invoice_settings?.default_payment_method === "string"
      ? ((customer as any).invoice_settings.default_payment_method as string)
      : ((customer as any)?.invoice_settings?.default_payment_method?.id as string | undefined);
  if (!customerPm) return null;
  return { customerId, paymentMethodId: customerPm };
}
