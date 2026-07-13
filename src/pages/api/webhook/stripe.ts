import type { APIRoute } from "astro";
import { stripe, STRIPE_WEBHOOK_SECRET } from "../../../lib/stripe";
import { supabaseAdmin } from "../../../lib/supabase-admin";

export const POST: APIRoute = async ({ request }) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature") || "";

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;

        if (session.mode !== "subscription") break;

        const subscription = await stripe.subscriptions.retrieve(session.subscription);

        await supabaseAdmin.from("subscriptions").upsert({
          user_id: session.client_reference_id || session.metadata?.user_id,
          provider: "stripe",
          provider_subscription_id: subscription.id,
          status: subscription.status,
          plan_currency: session.metadata?.currency || "USD",
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        }, { onConflict: "provider, provider_subscription_id" });

        await supabaseAdmin.from("profiles").update({
          role: "subscriber",
          updated_at: new Date().toISOString(),
        }).eq("id", session.client_reference_id || session.metadata?.user_id);

        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as any;

        await supabaseAdmin.from("subscriptions").update({
          status: sub.status,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("provider_subscription_id", sub.id).eq("provider", "stripe");

        if (sub.status === "canceled" || sub.status === "past_due") {
          const { data: existing } = await supabaseAdmin
            .from("subscriptions")
            .select("user_id")
            .eq("provider_subscription_id", sub.id)
            .eq("provider", "stripe")
            .maybeSingle();

          if (existing) {
            await supabaseAdmin.from("profiles").update({
              role: "free",
              updated_at: new Date().toISOString(),
            }).eq("id", existing.user_id);
          }
        }

        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err: any) {
    console.error("stripe webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
};
