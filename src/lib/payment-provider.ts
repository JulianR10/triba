import { MONTHLY_PRICE_CENTS } from "./pricing";
import { MAIL_CLUB_PRICE_CENTS } from "./mail-club";

export interface CheckoutParams {
  userId: string;
  userEmail: string;
  currency: "EUR" | "USD" | "ARS";
  origin: string;
  plan?: "digital" | "mail_club";
  countryIso?: string;
}

export interface CheckoutResult {
  url: string;
}

export interface PortalResult {
  url?: string;
  note?: string;
  provider: string;
}

export interface DowngradeResult {
  // ISO del momento en que la vuelta a digital toma efecto (fin del período).
  effectiveAt?: string;
}

export interface PaymentProvider {
  readonly name: "stripe" | "mercadopago";
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  // Cancela al final del período pagado (Stripe) o frena la recurrencia
  // conservando el acceso hasta el vencimiento (MP).
  scheduleCancel(providerSubscriptionId: string): Promise<void>;
  // Programa la vuelta al plan digital al final del período pagado.
  // periodEndIso: fin del período actual (ISO) para Stripe; MP lo ignora.
  downgradeToDigital(
    providerSubscriptionId: string,
    currency: "EUR" | "USD" | "ARS",
    periodEndIso?: string | null,
  ): Promise<DowngradeResult>;
  getPortalUrl(providerSubscriptionId: string, origin: string): Promise<PortalResult>;
}

class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe" as const;

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const { stripe, STRIPE_PRICE_IDS, MAIL_CLUB_STRIPE_PRICE_IDS } = await import("./stripe");
    if (!stripe) throw new Error("Stripe not configured");

    const plan = params.plan ?? "digital";
    if (plan !== "digital" && plan !== "mail_club") throw new Error("Invalid plan");
    if (plan === "mail_club" && params.currency === "ARS") {
      throw new Error("ARS Mail Club usa Mercado Pago, no Stripe");
    }

    const priceId =
      plan === "mail_club"
        ? MAIL_CLUB_STRIPE_PRICE_IDS[params.currency as "EUR" | "USD"]
        : STRIPE_PRICE_IDS[params.currency];
    if (!priceId) throw new Error(`No Stripe price ID for ${plan} ${params.currency}`);

    const successUrl = new URL(`${params.origin}/mi-cuenta`);
    successUrl.searchParams.set("checkout", "success");
    if (plan === "mail_club") successUrl.searchParams.set("flow", "mail_club");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: params.userEmail,
      client_reference_id: params.userId,
      success_url: successUrl.toString(),
      cancel_url: `${params.origin}/suscribirme?checkout=canceled`,
      metadata: {
        user_id: params.userId,
        currency: params.currency,
        plan,
        ...(params.countryIso ? { country_iso: params.countryIso } : {}),
      },
    });

    return { url: session.url! };
  }

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    const { stripe } = await import("./stripe");
    if (!stripe) throw new Error("Stripe not configured");
    await stripe.subscriptions.cancel(providerSubscriptionId);
  }

  async scheduleCancel(providerSubscriptionId: string): Promise<void> {
    const { stripe } = await import("./stripe");
    if (!stripe) throw new Error("Stripe not configured");
    await stripe.subscriptions.update(providerSubscriptionId, {
      cancel_at_period_end: true,
    });
  }

  async downgradeToDigital(
    providerSubscriptionId: string,
    currency: "EUR" | "USD" | "ARS",
    periodEndIso?: string | null,
  ): Promise<DowngradeResult> {
    const { stripe, STRIPE_PRICE_IDS } = await import("./stripe");
    if (!stripe) throw new Error("Stripe not configured");
    if (!periodEndIso) throw new Error("Missing period end for downgrade schedule");

    const digitalPriceId = STRIPE_PRICE_IDS[currency];
    if (!digitalPriceId) throw new Error(`No digital Stripe price ID for ${currency}`);

    const current = await stripe.subscriptions.retrieve(providerSubscriptionId);
    const currentPriceId = current.items.data[0]?.price.id;
    const currentItemId = current.items.data[0]?.id;
    if (!currentItemId || !currentPriceId) throw new Error("Stripe subscription without items");

    const periodEndSec = Math.floor(new Date(periodEndIso).getTime() / 1000);
    if (!Number.isFinite(periodEndSec) || periodEndSec <= Math.floor(Date.now() / 1000)) {
      throw new Error("Invalid period end for downgrade schedule");
    }

    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: providerSubscriptionId,
    });
    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      phases: [
        {
          items: [{ price: currentPriceId, quantity: 1 }],
          end_date: periodEndSec,
          proration_behavior: "none",
        },
        {
          items: [{ price: digitalPriceId, quantity: 1 }],
          proration_behavior: "none",
        },
      ],
    });

    return { effectiveAt: new Date(periodEndSec * 1000).toISOString() };
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

    const plan = params.plan ?? "digital";
    if (plan !== "digital" && plan !== "mail_club") throw new Error("Invalid plan");
    if (plan === "mail_club" && params.currency !== "ARS") {
      throw new Error("Mail Club no-ARS usa Stripe, no Mercado Pago");
    }

    const cents =
      plan === "mail_club"
        ? MAIL_CLUB_PRICE_CENTS[params.currency]
        : MONTHLY_PRICE_CENTS[params.currency];
    const transactionAmount =
      params.currency === "ARS" ? cents : cents / 100;

    const result = await preApproval.create({
      body: {
        payer_email: params.userEmail,
        back_url: `${params.origin}/mi-cuenta?checkout=success`,
        reason:
          plan === "mail_club"
            ? `Suscripción Triba Mail Club (${params.currency})`
            : `Suscripción Triba (${params.currency})`,
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

  async scheduleCancel(providerSubscriptionId: string): Promise<void> {
    // MP no tiene cancelación programada: se frena la recurrencia ahora y la
    // app conserva el acceso hasta current_period_end (cancel diferida).
    return this.cancelSubscription(providerSubscriptionId);
  }

  async downgradeToDigital(
    providerSubscriptionId: string,
    _currency: "EUR" | "USD" | "ARS",
    _periodEndIso?: string | null,
  ): Promise<DowngradeResult> {
    const { mpClient } = await import("./mercadopago");
    if (!mpClient) throw new Error("Mercado Pago not configured");

    const { MONTHLY_PRICE_CENTS } = await import("./pricing");
    const { PreApproval } = await import("mercadopago");
    const preApproval = new PreApproval(mpClient);
    const current = await preApproval.get({ id: providerSubscriptionId });
    const nextPaymentDate = (current as any)?.next_payment_date as string | undefined;
    await preApproval.update({
      id: providerSubscriptionId,
      body: {
        auto_recurring: {
          transaction_amount: MONTHLY_PRICE_CENTS.ARS,
          currency_id: "ARS",
        },
      },
    });
    return {
      effectiveAt: nextPaymentDate
        ? new Date(nextPaymentDate).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
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
