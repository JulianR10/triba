/**
 * Recupera renovaciones de Mercado Pago que el webhook no aplicó: subs 'active'
 * con período vencido, preapproval 'authorized' y un cobro posterior al fin
 * del período. Fija current_period_end = next_payment_date de MP.
 *
 * Usage: node --env-file=.env scripts/resync-mp-periods.mjs [--real]
 * Por defecto DRY-RUN. Requires: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MP_ACCESS_TOKEN
 */
import { createClient } from "@supabase/supabase-js";

const real = process.argv.includes("--real");
const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DAY = 86400000;

async function mp(path) {
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`https://api.mercadopago.com${path}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 1500 * (i + 1))); continue; }
    if (!res.ok) throw new Error(`MP ${path} -> ${res.status}`);
    return res.json();
  }
  throw new Error(`MP ${path} -> 429 tras reintentos`);
}

const { data: subs, error } = await supabase
  .from("subscriptions")
  .select("id, provider_subscription_id, current_period_end, scheduled_plan_type")
  .eq("provider", "mercadopago")
  .eq("status", "active")
  .lt("current_period_end", new Date().toISOString());
if (error) throw error;

let fixed = 0;
for (const row of subs) {
  try {
    const p = await mp(`/preapproval/${row.provider_subscription_id}`);
    const end = new Date(row.current_period_end).getTime();
    const last = p.summarized?.last_charged_date ? new Date(p.summarized.last_charged_date).getTime() : 0;
    const next = p.next_payment_date ? new Date(p.next_payment_date) : null;
    if (p.status !== "authorized") { console.log(`skip ${row.id.slice(0, 8)}: MP ${p.status}`); continue; }
    if (last < end - 2 * DAY) { console.log(`skip ${row.id.slice(0, 8)}: sin cobro posterior al vencimiento`); continue; }
    if (!next || next.getTime() <= Date.now()) { console.log(`skip ${row.id.slice(0, 8)}: next_payment_date inválido`); continue; }
    if (row.scheduled_plan_type) { console.log(`skip ${row.id.slice(0, 8)}: tiene cambio de plan programado (revisar a mano)`); continue; }
    console.log(`${row.id.slice(0, 8)}: ${row.current_period_end} -> ${next.toISOString()}`);
    fixed++;
    if (real) {
      const { error: upErr } = await supabase
        .from("subscriptions")
        .update({ current_period_end: next.toISOString(), updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "active");
      if (upErr) console.error(`  ERROR ${row.id}: ${upErr.message}`);
    }
  } catch (err) {
    console.error(`error ${row.id.slice(0, 8)}: ${err.message}`);
  }
}
console.log(`${real ? "Actualizadas" : "A actualizar (dry-run)"}: ${fixed} de ${subs.length}`);
