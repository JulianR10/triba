import type { APIRoute } from "astro";
import { supabase } from "../../lib/supabase";
import { paypalOrders, PAYPAL_PLAN_IDS } from "../../lib/paypal";

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

  let body: { currency: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
  }

  const { currency } = body;
  if (!["EUR", "USD", "ARS"].includes(currency)) {
    return new Response(JSON.stringify({ error: "Invalid currency" }), { status: 400 });
  }

  const planId = PAYPAL_PLAN_IDS[currency as keyof typeof PAYPAL_PLAN_IDS];
  if (!planId) {
    return new Response(JSON.stringify({ error: "PayPal configuration error" }), { status: 500 });
  }

  if (!paypalOrders) {
    return new Response(JSON.stringify({ error: "PayPal not configured" }), { status: 500 });
  }

  try {
    const origin = new URL(request.url).origin;

    const { result } = await paypalOrders.create({
      body: {
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: user.id,
          description: `Suscripción Triba (${currency})`,
          amount: { currency_code: currency, value: "10.00" },
        }],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: `${origin}/mi-cuenta?checkout=success`,
              cancel_url: `${origin}/suscribirme?checkout=canceled`,
            },
          },
        },
      },
    });

    const approvalUrl = result.links?.find((l: any) => l.rel === "payer-action")?.href;

    return new Response(JSON.stringify({ id: result.id, approvalUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("create-paypal-order error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
