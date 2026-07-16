import type { APIRoute } from "astro";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "../../../lib/supabase-admin";

const MP_WEBHOOK_SECRET = import.meta.env.MP_WEBHOOK_SECRET || "";
const VERIFY_SIGNATURES = import.meta.env.VERIFY_MP_SIGNATURES !== "false";

function buildManifest(dataId: string, userId: string, xRequestId: string, ts: string): string {
  // Mercado Pago webhook v2 manifest for type=payment.
  // Order and separator per MP spec. If a sandbox signature test fails,
  // adjust ONLY this function.
  return `${dataId},${userId},${xRequestId},${ts}`;
}

function verifyMercadoPagoSignature(request: Request, body: any): boolean {
  if (!VERIFY_SIGNATURES) return true;

  if (!MP_WEBHOOK_SECRET) {
    console.error("[MP webhook] MP_WEBHOOK_SECRET not configured. Rejecting (fail-closed).");
    return false;
  }

  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");
  if (!xSignature || !xRequestId) {
    console.error("[MP webhook] Missing x-signature or x-request-id headers");
    return false;
  }

  const entries = xSignature.split(",").map((p) => {
    const i = p.indexOf("=");
    return i < 0 ? [p.trim(), ""] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
  });
  const parsed = Object.fromEntries(entries);
  const ts = parsed.ts;
  const v1 = parsed.v1;
  if (!ts || !v1) {
    console.error("[MP webhook] Malformed x-signature header");
    return false;
  }

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
    console.error(`[MP webhook] Timestamp out of window or invalid (ts=${ts})`);
    return false;
  }

  const dataId = body?.data?.id;
  const userId = body?.user_id;
  if (!dataId || !userId) {
    console.error("[MP webhook] Missing data.id or user_id in body");
    return false;
  }

  const manifest = buildManifest(String(dataId), String(userId), xRequestId, ts);
  const expected = createHmac("sha256", MP_WEBHOOK_SECRET).update(manifest).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length) {
    console.error(`[MP webhook] HMAC length mismatch. dataId=${dataId} ts=${ts}`);
    return false;
  }
  if (!timingSafeEqual(a, b)) {
    console.error(`[MP webhook] HMAC mismatch. dataId=${dataId} ts=${ts}`);
    return false;
  }

  return true;
}

export const POST: APIRoute = async ({ request }) => {
  if (VERIFY_SIGNATURES && !MP_WEBHOOK_SECRET) {
    console.error("[MP webhook] MP_WEBHOOK_SECRET not configured.");
    return new Response(JSON.stringify({ error: "Webhook misconfigured" }), { status: 500 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
  }

  if (!verifyMercadoPagoSignature(request, body)) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
  }

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
        const currencyMap: Record<string, string> = { ARS: "ARS", USD: "USD", EUR: "EUR" };
        const planCurrency = currencyMap[payment.currency_id] || "USD";

        const { data: subs } = await supabaseAdmin.from("subscriptions").upsert({
          user_id: userId,
          provider: "mercadopago",
          provider_subscription_id: `mp_${paymentId}`,
          status: "active",
          plan_currency: planCurrency,
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: "provider, provider_subscription_id" }).select("id").single();

        if (userId) {
          await supabaseAdmin.from("profiles").update({
            role: "subscriber",
            subscription_id: subs?.id || null,
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
