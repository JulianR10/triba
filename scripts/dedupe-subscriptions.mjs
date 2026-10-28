/**
 * Deja UNA suscripción paga viva por persona: conserva la más antigua EN EL
 * PROVEEDOR (Stripe `created`, MP `date_created`; la created_at de la base no
 * es confiable) o, en empate de día, la que apunta profiles.subscription_id, y
 * cancela el resto. `--keep=<id del proveedor>` fuerza cuál queda (decisión de
 * la dueña, p. ej. Karen).
 *
 * Provider-first: si el proveedor falla, esa fila no se toca en la base.
 * Stripe: cancelación inmediata sin factura ni prorrateo (no genera cobros ni
 * reembolsos). Mercado Pago: status "cancelled" (irreversible).
 * Tras cancelar, repunta profiles.subscription_id a la que queda.
 *
 * Usage:
 *   node --env-file=.env scripts/dedupe-subscriptions.mjs [--email=x@y.com] [--keep=sub_o_preapproval_id] [--backup=ruta.json] [--real]
 *
 * Por defecto DRY-RUN. `--real` exige `--email=`: se cancela de a una persona
 * (MP avisa por mail al cancelar y es irreversible; ver ROADMAP). Requires: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * STRIPE_SECRET_KEY, MP_ACCESS_TOKEN
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { writeFileSync } from "node:fs";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const real = process.argv.includes("--real");
const onlyEmail = arg("email");
const backupPath = arg("backup");
const keepOverride = arg("keep");

if (real && !onlyEmail) {
  console.error("--real exige --email=: cancelá de a una persona y verificá antes de seguir con la próxima.");
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const MP = { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, "Content-Type": "application/json" };

// Estado y fecha de alta reales en el proveedor; null si ya no está viva.
async function liveInfo(row) {
  if (row.provider === "stripe") {
    try {
      const s = await stripe.subscriptions.retrieve(row.provider_subscription_id);
      if (s.status !== "active" && s.status !== "trialing") return null;
      const price = s.items.data[0]?.price;
      return {
        providerCreated: new Date(s.created * 1000).toISOString(),
        amount: price?.unit_amount != null ? `${price.unit_amount / 100} ${price.currency.toUpperCase()}` : "?",
      };
    } catch {
      return null;
    }
  }
  const res = await fetch(`https://api.mercadopago.com/preapproval/${row.provider_subscription_id}`, { headers: MP });
  if (!res.ok) return null;
  const p = await res.json();
  if (p.status !== "authorized") return null;
  return {
    providerCreated: new Date(p.date_created).toISOString(),
    amount: `${p.auto_recurring?.transaction_amount ?? "?"} ${p.auto_recurring?.currency_id ?? ""}`.trim(),
  };
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
  for (const s of subs) {
    const info = await liveInfo(s);
    if (info) live.push({ ...s, ...info });
  }
  if (live.length < 2) continue;
  live.sort((a, b) => a.providerCreated.localeCompare(b.providerCreated));

  const first = live[0].providerCreated;
  const ties = live.filter((s) => s.providerCreated.slice(0, 10) === first.slice(0, 10));
  // Más antigua en el proveedor; si hay varias del mismo día, la vinculada al perfil.
  let keep = (ties.length > 1 && ties.find((s) => s.id === profile?.subscription_id)) || live[0];
  if (keepOverride) {
    const forced = live.find((s) => s.provider_subscription_id === keepOverride);
    if (!forced) {
      if (onlyEmail) {
        console.error(`--keep=${keepOverride} no está entre las vivas de ${profile?.email}: no se toca nada.`);
        process.exit(1);
      }
      continue;
    }
    keep = forced;
  }
  const drop = live.filter((s) => s.id !== keep.id);

  const fmt = (s) => `${s.provider} ${s.provider_subscription_id} · alta ${s.providerCreated.slice(0, 10)} · ${s.amount} · ${s.plan_type}`;
  console.log(`\n${profile?.email}`);
  console.log(`  QUEDA   ${fmt(keep)}`);
  for (const d of drop) console.log(`  CANCELA ${fmt(d)}`);
  if (profile?.subscription_id && profile.subscription_id !== keep.id) {
    console.log("  AVISO   el perfil apunta a otra fila: se repuntará a la que queda");
  }
  if (subs.findIndex((x) => x.id === keep.id) !== 0) {
    console.log("  AVISO   el orden de la base no coincide con el del proveedor (se usó el del proveedor)");
  }
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
