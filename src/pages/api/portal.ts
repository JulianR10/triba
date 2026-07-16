import type { APIRoute } from "astro";
import { supabase } from "../../lib/supabase";
import { stripe } from "../../lib/stripe";

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

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("provider, provider_subscription_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!sub) {
    return new Response(JSON.stringify({ error: "No active subscription" }), { status: 404 });
  }

  const origin = new URL(request.url).origin;

  try {
    if (sub.provider === "stripe") {
      if (!stripe) throw new Error("Stripe not configured");

      const stripeSub = await stripe.subscriptions.retrieve(sub.provider_subscription_id);
      const customerId = typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;

      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/mi-cuenta`,
      });

      return new Response(JSON.stringify({ url: portal.url }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        note: "Gestiona tu suscripción desde el dashboard de Mercado Pago.",
        provider: sub.provider,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("portal error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
