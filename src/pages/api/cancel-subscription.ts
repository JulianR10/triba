import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase-admin";

export const POST: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (subError || !subscription) {
      return new Response(
        JSON.stringify({ error: "No active subscription found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const providerErrors: string[] = [];

    try {
      switch (subscription.provider) {
        case "stripe": {
          const { stripe } = await import("../../lib/stripe");
          if (stripe) {
            await stripe.subscriptions.cancel(subscription.provider_subscription_id);
          }
          break;
        }
        case "mercadopago": {
          const { mpClient } = await import("../../lib/mercadopago");
          if (mpClient) {
            const { MercadoPagoConfig, PreApproval } = await import("mercadopago");
            const localClient = new MercadoPagoConfig({
              accessToken: process.env.MP_ACCESS_TOKEN || "",
            });
            const preApproval = new PreApproval(localClient);
            await preApproval.update({
              id: subscription.provider_subscription_id,
              body: { status: "cancelled" },
            });
          }
          break;
        }
      }
    } catch (err: any) {
      providerErrors.push(err.message || "Provider cancel failed");
    }

    const { error: dbError } = await supabaseAdmin.rpc("cancel_subscription", {
      p_user_id: user.id,
    });

    if (dbError) {
      return new Response(
        JSON.stringify({ error: "Failed to update subscription" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Suscripción cancelada correctamente",
        providerWarnings: providerErrors.length > 0 ? providerErrors : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("cancel-subscription error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
