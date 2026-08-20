import type { APIRoute } from "astro";
import type Stripe from "stripe";
import type { Database } from "../../../lib/database.types";
import { stripe, STRIPE_WEBHOOK_SECRET } from "../../../lib/stripe";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { ok, error } from "../../../lib/response";
import { logger } from "../../../lib/logger";
import { syncPaidSubscriber } from "../../../lib/sender";
import { sendWelcomeEmail } from "../../../lib/email";
import { getPreferredLocale } from "../../../lib/locale-pref";

const VERIFY_SIGNATURES = true;

type StripeSubWithPeriod = Stripe.Subscription & {
  current_period_start: number;
  current_period_end: number;
};

function periodRange(sub: Stripe.Subscription) {
  // This Stripe account (new billing model) does NOT expose current_period_start/end
  // on the subscription object, so fall back to start_date/created.
  const startSec = (sub as any).current_period_start ?? (sub as any).start_date ?? sub.created;
  const endSec =
    (sub as any).current_period_end ?? (startSec ? startSec + 30 * 24 * 60 * 60 : undefined);
  return {
    start: startSec ? new Date(startSec * 1000).toISOString() : undefined,
    end: endSec ? new Date(endSec * 1000).toISOString() : undefined,
  };
}

async function supersedeMigratedSub(userId: string) {
  if (!userId) return;
  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", "migrated");
}

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
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode !== "subscription") break;

        const stripeSub = (await stripe.subscriptions.retrieve(
          session.subscription as string,
        )) as unknown as StripeSubWithPeriod;
        const period = periodRange(stripeSub);
        const userId = session.client_reference_id || session.metadata?.user_id || "";

        let email = session.customer_email || session.customer_details?.email || undefined;
        if (!email && userId) {
          const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId);
          email = user?.user?.email;
        }

        const { data: subs } = await supabaseAdmin.from("subscriptions").upsert({
          user_id: userId,
          provider: "stripe",
          provider_subscription_id: stripeSub.id,
          status: stripeSub.status as "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "migrated",
          plan_currency: (session.metadata?.currency || "USD") as "EUR" | "USD" | "ARS",
          ...(period.start ? { current_period_start: period.start } : {}),
          ...(period.end ? { current_period_end: period.end } : {}),
        }, { onConflict: "provider, provider_subscription_id" }).select("id").single();

          await supabaseAdmin.from("profiles").upsert({
            id: userId,
            ...(email ? { email } : {}),
            role: "subscriber",
            subscription_id: subs?.id || null,
            updated_at: new Date().toISOString(),
          } as Database["public"]["Tables"]["profiles"]["Insert"], { onConflict: "id" });

          await supersedeMigratedSub(userId);

          if (email) {
            syncPaidSubscriber(email).catch((err) =>
              logger.error({ err, email }, "Sender sync error (stripe)"),
            );
            getPreferredLocale(userId).then((locale) =>
              sendWelcomeEmail(email, false, locale),
            ).catch((err) =>
              logger.error({ err, email }, "Welcome email error (stripe)"),
            );
          }

        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as StripeSubWithPeriod;
        const period = periodRange(sub);

        await supabaseAdmin.from("subscriptions").update({
          status: sub.status as "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "migrated",
          ...(period.start ? { current_period_start: period.start } : {}),
          ...(period.end ? { current_period_end: period.end } : {}),
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
