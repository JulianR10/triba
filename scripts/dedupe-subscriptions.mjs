/**
 * Deja UNA suscripción paga viva por persona: conserva la más antigua (o, en
 * empate, la que apunta profiles.subscription_id) y cancela el resto.
 *
 * Provider-first: si el proveedor falla, esa fila no se toca en la base.
 * Stripe: cancelación inmediata sin factura ni prorrateo (no genera cobros ni
 * reembolsos). Mercado Pago: status "cancelled" (irreversible).
 * Tras cancelar, repunta profiles.subscription_id a la que queda.
 *
 * Usage:
 *   node --env-file=.env scripts/dedupe-subscriptions.mjs [--email=x@y.com] [--backup=ruta.json] [--real]
 *
 * Por defecto DRY-RUN. Requires: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * STRIPE_SECRET_KEY, MP_ACCESS_TOKEN
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { writeFileSync } from "node:fs";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const real = process.argv.includes("--real");
const onlyEmail = arg("email");
const backupPath = arg("backup");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const MP = { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, "Content-Type": "application/json" };

async function isLive(row) {
  if (row.provider === "stripe") {
    try {
      const s = await stripe.subscriptions.retrieve(row.provider_subscription_id);
      return s.status === "active" || s.status === "trialing";
    } catch {
      return false;
    }
  }
  const res = await fetch(`https://api.mercadopago.com/preapproval/${row.provider_subscription_id}`, { headers: MP });
  return res.ok && (await res.json()).status === "authorized";
}

async function cancelAtProvider(row) {
  if (row.provider === "stripe") {
    await stripe.subscriptions.cancel(row.provider_subscription_id, { invoice_now: false, prorate: false });
    return;
  }
  const res = await fetch(`https://api.mercadopago.com/preapproval/${row.provider_subscription_id}`, {
    method: "PUT",
    headers: MP,
    body: JSON.stringify({ status: "cancelled" }),
  });
  if (!res.ok) throw new Error(`MP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

const { data: rows, error } = await supabase
  .from("subscriptions")
  .select("id, user_id, provider, provider_subscription_id, plan_type, status, created_at")
  .in("provider", ["stripe", "mercadopago"])
  .in("status", ["active", "trialing", "past_due"])
  .order("created_at", { ascending: true });
if (error) throw error;

const byUser = new Map();
for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);

const backup = [];
let canceled = 0;
for (const [userId, subs] of byUser) {
  if (subs.length < 2) continue;
  const { data: profile } = await supabase.from("profiles").select("email, subscription_id").eq("id", userId).maybeSingle();
  if (onlyEmail && profile?.email !== onlyEmail) continue;

  const live = [];
  for (const s of subs) if (await isLive(s)) live.push(s);
  if (live.length < 2) continue;

  const first = live[0].created_at;
  const ties = live.filter((s) => s.created_at.slice(0, 10) === first.slice(0, 10));
  // Más antigua; si hay varias del mismo día, la vinculada al perfil.
  const keep = (live.length > 1 && ties.length > 1 && ties.find((s) => s.id === profile?.subscription_id)) || live[0];
  const drop = live.filter((s) => s.id !== keep.id);

  console.log(`\n${profile?.email}`);
  console.log(`  QUEDA   ${keep.provider} ${keep.provider_subscription_id} (${keep.created_at})`);
  for (const d of drop) console.log(`  CANCELA ${d.provider} ${d.provider_subscription_id} (${d.created_at})`);
  backup.push({ email: profile?.email, userId, profilePointer: profile?.subscription_id, keep, drop });

  if (!real) continue;
  for (const d of drop) {
    try {
      await cancelAtProvider(d);
    } catch (err) {
      console.error(`  ERROR proveedor ${d.provider_subscription_id}: ${err.message} — no se toca la base`);
      continue;
    }
    const { error: upErr } = await supabase
      .from("subscriptions")
      .update({ status: "canceled", canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", d.id);
    if (upErr) console.error(`  ERROR base ${d.id}: ${upErr.message}`);
    else canceled++;
  }
  // El perfil debe apuntar a la que queda (en MP la cancelada conserva acceso hasta su fin).
  await supabase.from("profiles").update({ subscription_id: keep.id, updated_at: new Date().toISOString() }).eq("id", userId);
}

if (backupPath) writeFileSync(backupPath, JSON.stringify(backup, null, 1));
console.log(`\n${real ? `canceladas ${canceled}` : "dry-run: no se escribió nada"} · personas con duplicadas: ${backup.length}`);
