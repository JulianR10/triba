/**
 * Recrea la cobranza automática en Stripe de las suscriptoras migradas desde
 * WooCommerce que tienen tarjeta guardada + historial de pago real.
 *
 * Crea una subscription recurrente (mismo precio viejo €10,5/mes) por customer,
 * alineando el billing_cycle_anchor al último cobro + 30 días (sin cargo inmediato)
 * y guarda el mapping en subscriber_migrations (stripe_subscription_id).
 *
 * Usage:
 *   node --env-file=.env scripts/recreate-migrated-billing.mjs [--dry-run]
 *
 * Requires in .env: STRIPE_SECRET_KEY, PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const PRICE_EUR_105 = "price_1U0obKLIVKTt84JHfVQV5CRI";
const EXCLUDE_EMAILS = new Set([
  "ing.azularganaras@gmail.com",
  "comunidadtriba@gmail.com",
]);
const DAY = 24 * 60 * 60;

const dryRun = process.argv.includes("--dry-run");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function allCustomers() {
  const out = [];
  for await (const c of stripe.customers.list({ limit: 100 })) {
    out.push(c);
  }
  return out;
}

async function lastPaid(customerId) {
  const charges = await stripe.charges.list({ customer: customerId, limit: 3 });
  const paid = charges.data.filter((x) => x.status === "succeeded" && x.amount > 100);
  return paid[0] || null;
}

async function main() {
  const customers = await allCustomers();
  const results = [];
  let skipped = 0;

  for (const c of customers) {
    if (EXCLUDE_EMAILS.has(c.email)) continue;

    const methods = await stripe.customers.listPaymentMethods(c.id, { limit: 3 });
    const card = methods.data.find((x) => x.type === "card");
    const last = await lastPaid(c.id);
    if (!card || !last) {
      skipped++;
      continue;
    }

    const existing = await stripe.subscriptions.list({
      customer: c.id,
      status: "all",
      limit: 1,
    });
    if (existing.data.length > 0) {
      skipped++;
      continue;
    }

    const anchor = last.created + 30 * DAY;
    const line = {
      email: c.email,
      lastCharge: `${last.amount / 100}/${last.currency.toUpperCase()} ${new Date(last.created * 1000).toISOString().slice(0, 10)}`,
      card: `${card.card.brand} ****${card.card.last4}`,
      anchor: new Date(anchor * 1000).toISOString().slice(0, 10),
    };

    if (dryRun) {
      results.push({ ...line, status: "DRY" });
      continue;
    }

    try {
      const params = {
        customer: c.id,
        items: [{ price: PRICE_EUR_105 }],
        collection_method: "charge_automatically",
        default_payment_method: card.id,
        proration_behavior: "none",
        metadata: { migrated: "true", email: c.email },
      };
      if (anchor > Math.floor(Date.now() / 1000)) {
        params.billing_cycle_anchor = anchor;
      }
      const sub = await stripe.subscriptions.create(params);

      await supabase
        .from("subscriber_migrations")
        .upsert({
          email: c.email,
          stripe_subscription_id: sub.id,
          stripe_customer_id: c.id,
          migrated_at: new Date().toISOString(),
        }, { onConflict: "email" });

      results.push({ ...line, status: `OK ${sub.id}` });
    } catch (err) {
      results.push({ ...line, status: `ERR ${err.message}` });
    }
  }

  console.log(`modo: ${dryRun ? "DRY-RUN" : "REAL"} | total: ${customers.length} | skip: ${skipped}`);
  for (const r of results) {
    console.log(`${r.status} | ${r.email} | last ${r.lastCharge} | ${r.card} | anchor ${r.anchor}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
