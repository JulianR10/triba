import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase-admin";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const eventType = body.event_type;

    switch (eventType) {
      case "PAYMENT.SALE.COMPLETED": {
        const sale = body.resource;
        const orderId = sale.billing_agreement_id || sale.parent_payment;
        const userId = sale.custom || sale.invoice_number || body.resource?.custom_id;

        await supabaseAdmin.from("subscriptions").upsert({
          user_id: userId,
          provider: "paypal",
          provider_subscription_id: orderId || `pp_${sale.id}`,
          status: "active",
          plan_currency: (sale.amount?.currency || "USD") === "EUR" ? "EUR" : "USD",
          current_period_start: new Date(sale.create_time).toISOString(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: "provider, provider_subscription_id" });

        if (userId) {
          await supabaseAdmin.from("profiles").update({
            role: "subscriber",
            updated_at: new Date().toISOString(),
          }).eq("id", userId);
        }

        break;
      }

      case "BILLING.SUBSCRIPTION.CANCELLED": {
        const sub = body.resource;

        await supabaseAdmin.from("subscriptions").update({
          status: "canceled",
          updated_at: new Date().toISOString(),
        }).eq("provider_subscription_id", sub.id).eq("provider", "paypal");

        const { data: existing } = await supabaseAdmin
          .from("subscriptions")
          .select("user_id")
          .eq("provider_subscription_id", sub.id)
          .eq("provider", "paypal")
          .maybeSingle();

        if (existing) {
          await supabaseAdmin.from("profiles").update({
            role: "free",
            updated_at: new Date().toISOString(),
          }).eq("id", existing.user_id);
        }

        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err: any) {
    console.error("paypal webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
};
