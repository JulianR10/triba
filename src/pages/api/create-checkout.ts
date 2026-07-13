import type { APIRoute } from "astro";
import { supabase } from "../../lib/supabase";
import { stripe, STRIPE_PRICE_IDS } from "../../lib/stripe";
import { mpPreference } from "../../lib/mercadopago";
import { plans, MONTHLY_PRICE_CENTS } from "../../lib/pricing";

export const POST: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: { provider: string; currency: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
  }

  const { provider, currency } = body;

  if (!["stripe", "mercadopago", "paypal"].includes(provider)) {
    return new Response(JSON.stringify({ error: "Invalid provider" }), { status: 400 });
  }

  if (!["EUR", "USD", "ARS"].includes(currency)) {
    return new Response(JSON.stringify({ error: "Invalid currency" }), { status: 400 });
  }

  const plan = plans.find((p) => p.moneda === currency);
  const origin = new URL(request.url).origin;

  try {
    switch (provider) {
      case "stripe": {
        if (!stripe) throw new Error("Stripe not configured");

        const priceId = STRIPE_PRICE_IDS[currency as keyof typeof STRIPE_PRICE_IDS];
        if (!priceId) throw new Error(`No Stripe price ID for ${currency}`);

        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          payment_method_types: ["card"],
          line_items: [{ price: priceId, quantity: 1 }],
          customer_email: user.email,
          client_reference_id: user.id,
          success_url: `${origin}/mi-cuenta?checkout=success`,
          cancel_url: `${origin}/suscribirme?checkout=canceled`,
          metadata: { user_id: user.id, currency },
        });

        return new Response(JSON.stringify({ url: session.url }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      case "mercadopago": {
        if (!mpPreference) throw new Error("Mercado Pago not configured");

        const preference = await mpPreference.create({
          body: {
            items: [{
              id: `subscription-${currency}`,
              title: `Suscripción Triba (${currency})`,
              quantity: 1,
              unit_price: MONTHLY_PRICE_CENTS[currency] / 100,
              currency_id: currency === "ARS" ? "ARS" : currency,
            }],
            payer: { email: user.email },
            back_urls: {
              success: `${origin}/mi-cuenta?checkout=success`,
              failure: `${origin}/suscribirme?checkout=canceled`,
              pending: `${origin}/suscribirme?checkout=pending`,
            },
            auto_return: "approved",
            external_reference: user.id,
            purpose: "subscription",
          },
        });

        return new Response(JSON.stringify({ url: preference.init_point }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      case "paypal": {
        return new Response(
          JSON.stringify({
            error: "PayPal subscriptions require client-side order creation. Use POST /api/create-paypal-order instead.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(JSON.stringify({ error: "Unsupported provider" }), { status: 400 });
    }
  } catch (err: any) {
    console.error("create-checkout error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
