/**
 * Resincroniza current_period_start/end de las suscripciones Stripe con el
 * período real (items[0]). El webhook usaba un fallback start_date + 30d que
 * dejaba el período vencido tras la primera renovación.
 *
 * Usage:
 *   node --env-file=.env scripts/resync-stripe-periods.mjs [--real]
 *
 * Por defecto DRY-RUN. Con --real escribe los cambios.
 * Requires: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const real = process.argv.includes("--real");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: subs, error } = await supabase
  .from("subscriptions")
  .select("id, provider_subscription_id, status, current_period_start, current_period_end")
  .eq("provider", "stripe")
  .in("status", ["active", "trialing", "past_due"]);
if (error) throw error;

let changed = 0;
for (const row of subs) {
  let sub;
  try {
    sub = await stripe.subscriptions.retrieve(row.provider_subscription_id);
  } catch (err) {
    console.warn(`skip ${row.provider_subscription_id}: ${err.message}`);
    continue;
  }
  const item = sub.items.data[0];
  if (!item?.current_period_end) continue;
  const start = new Date(item.current_period_start * 1000).toISOString();
  const end = new Date(item.current_period_end * 1000).toISOString();
  if (new Date(row.current_period_end).getTime() === item.current_period_end * 1000) continue;

  changed++;
  console.log(`${row.provider_subscription_id}: ${row.current_period_end} -> ${end}`);
  if (real) {
    const { error: upErr } = await supabase
      .from("subscriptions")
      .update({ current_period_start: start, current_period_end: end, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (upErr) console.error(`update failed ${row.id}: ${upErr.message}`);
  }
}
console.log(`${real ? "updated" : "would update"} ${changed} of ${subs.length}`);
