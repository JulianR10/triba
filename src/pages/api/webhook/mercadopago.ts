import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase-admin";

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { action, data, type } = body;

  try {
    if (type === "payment" && action === "payment.created") {
      const paymentId = data.id;

      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        { headers: { Authorization: `Bearer ${import.meta.env.MP_ACCESS_TOKEN}` } }
      );

      if (!response.ok) return new Response(JSON.stringify({ received: true }), { status: 200 });

      const payment = await response.json();

      if (payment.status === "approved") {
        const userId = payment.external_reference;

        await supabaseAdmin.from("subscriptions").upsert({
          user_id: userId,
          provider: "mercadopago",
          provider_subscription_id: `mp_${paymentId}`,
          status: "active",
          plan_currency: payment.currency_id === "ARS" ? "ARS" : payment.currency_id === "BRL" ? "USD" : "USD",
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: "provider, provider_subscription_id" });

        if (userId) {
          await supabaseAdmin.from("profiles").update({
            role: "subscriber",
            updated_at: new Date().toISOString(),
          }).eq("id", userId);
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err: any) {
    console.error("mercadopago webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
};
