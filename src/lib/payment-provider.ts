import { MONTHLY_PRICE_CENTS } from "./pricing";

export interface CheckoutParams {
  userId: string;
  userEmail: string;
  currency: "EUR" | "USD" | "ARS";
  origin: string;
}

export interface CheckoutResult {
  url: string;
}

export interface PortalResult {
  url?: string;
  note?: string;
  provider: string;
}

export interface PaymentProvider {
  readonly name: "stripe" | "mercadopago";
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  getPortalUrl(providerSubscriptionId: string, origin: string): Promise<PortalResult>;
}

class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe" as const;

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const { stripe, STRIPE_PRICE_IDS } = await import("./stripe");
    if (!stripe) throw new Error("Stripe not configured");

    const priceId = STRIPE_PRICE_IDS[params.currency];
    if (!priceId) throw new Error(`No Stripe price ID for ${params.currency}`);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: params.userEmail,
      client_reference_id: params.userId,
      success_url: `${params.origin}/mi-cuenta?checkout=success`,
      cancel_url: `${params.origin}/suscribirme?checkout=canceled`,
      metadata: { user_id: params.userId, currency: params.currency },
    });

    return { url: session.url! };
  }

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    const { stripe } = await import("./stripe");
    if (!stripe) throw new Error("Stripe not configured");
    await stripe.subscriptions.cancel(providerSubscriptionId);
  }

  async getPortalUrl(providerSubscriptionId: string, origin: string): Promise<PortalResult> {
    const { stripe } = await import("./stripe");
    if (!stripe) throw new Error("Stripe not configured");

    const stripeSub = await stripe.subscriptions.retrieve(providerSubscriptionId);
    const customerId =
      typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/mi-cuenta`,
    });

    return { url: portal.url, provider: "stripe" };
  }
}

class MercadoPagoPaymentProvider implements PaymentProvider {
  readonly name = "mercadopago" as const;

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const { mpClient } = await import("./mercadopago");
    if (!mpClient) throw new Error("Mercado Pago not configured");

    const { PreApproval } = await import("mercadopago");
    const preApproval = new PreApproval(mpClient);

    const transactionAmount =
      params.currency === "ARS"
        ? MONTHLY_PRICE_CENTS[params.currency]
        : MONTHLY_PRICE_CENTS[params.currency] / 100;

    const result = await preApproval.create({
      body: {
        payer_email: params.userEmail,
        back_url: `${params.origin}/mi-cuenta?checkout=success`,
        reason: `Suscripción Triba (${params.currency})`,
        external_reference: params.userId,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: transactionAmount,
          currency_id: params.currency,
        },
      },
    });

    return { url: result.init_point! };
  }

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    const { mpClient } = await import("./mercadopago");
    if (!mpClient) throw new Error("Mercado Pago not configured");

    const { PreApproval } = await import("mercadopago");
    const preApproval = new PreApproval(mpClient);
    await preApproval.update({
      id: providerSubscriptionId,
      body: { status: "cancelled" },
    });
  }

  async getPortalUrl(
    _providerSubscriptionId: string,
    _origin: string,
  ): Promise<PortalResult> {
    return {
      note: "Gestioná tu suscripción desde el dashboard de Mercado Pago.",
      provider: "mercadopago",
    };
  }
}

const providers: Record<string, PaymentProvider> = {
  stripe: new StripePaymentProvider(),
  mercadopago: new MercadoPagoPaymentProvider(),
};

export function getPaymentProvider(name: "stripe" | "mercadopago"): PaymentProvider {
  return providers[name];
}
