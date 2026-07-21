import type { APIRoute } from "astro";
import { stripe, STRIPE_WEBHOOK_SECRET } from "../../../lib/stripe";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { ok, error } from "../../../lib/response";
import { logger } from "../../../lib/logger";

const VERIFY_SIGNATURES = true;

export const POST: APIRoute = async ({ request }) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return error("Stripe not configured", 500);
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature") || "";

  let event;
  try {
    if (VERIFY_SIGNATURES) {
      event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(body);
    }
  } catch {
    return error("Invalid signature", 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;

        if (session.mode !== "subscription") break;

        const stripeSub = await stripe.subscriptions.retrieve(session.subscription);
        const userId = session.client_reference_id || session.metadata?.user_id;

        const { data: subs } = await supabaseAdmin.from("subscriptions").upsert({
          user_id: userId,
          provider: "stripe",
          provider_subscription_id: stripeSub.id,
          status: stripeSub.status,
          plan_currency: session.metadata?.currency || "USD",
          current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
        }, { onConflict: "provider, provider_subscription_id" }).select("id").single();

          await supabaseAdmin.from("profiles").update({
          role: "subscriber",
          subscription_id: subs?.id || null,
          updated_at: new Date().toISOString(),
        }).eq("id", userId);

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
            subscription_id: null,
            updated_at: new Date().toISOString(),
          }).eq("id", existing.user_id);
          }
        }

        break;
      }
    }

    return ok({ received: true });
  } catch (err: any) {
    logger.error({ err, eventType: event?.type }, "stripe webhook error");
    return error("Internal server error", 500);
  }
};
