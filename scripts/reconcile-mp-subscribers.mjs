/**
 * Reencuentra suscriptores que pagaron por Mercado Pago pero nunca obtuvieron
 * acceso en el sitio (sin fila en `subscriptions`/`profiles.subscription_id`).
 *
 * Causa: el webhook de MP sólo creaba la suscripción a partir del evento
 * `subscription_preapproval` con status "authorized"; si ese evento no llegaba
 * (o llegaba con status "pending"), el cobro aprobado (`subscription_authorized_payment`)
 * era un no-op y la persona pagaba sin acceso. Este script:
 *   1. Enumera TODAS las preaprobaciones de la cuenta y filtra las authorized/active.
 *   2. Resuelve el email del pagador (authorized_payments -> payment; la API no
 *      expone payer_email en la preaprobación).
 *   3. Si el email tiene cuenta, crea la sub 'mercadopago' (idempotente) y la
 *      linkea al perfil, cancelando la de cortesía 'migrated' si existiera.
 *   4. Sincroniza al grupo Sender "suscriptora-paga".
 *
 * Es idempotente: las subs ya linkeadas se saltan.
 *
 * Usage:
 *   node --env-file=.env scripts/reconcile-mp-subscribers.mjs [--real]
 *
 * Por defecto corre en DRY-RUN (no escribe nada). Con --real aplica los cambios.
 *
 * Requires in .env:
 *   PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MP_ACCESS_TOKEN
 * Opcional: SENDER_API_KEY
 */
import { createClient } from "@supabase/supabase-js";

const MP_BASE = "https://api.mercadopago.com";
const SENDER_API_BASE = "https://api.sender.net/v2";

const real = process.argv.includes("--real");

const accessToken = process.env.MP_ACCESS_TOKEN;
const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function mpGet(path) {
  const res = await fetch(`${MP_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`MP ${res.status} GET ${path}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

async function listPreapprovals() {
  const out = [];
  let offset = 0;
  const limit = 50;
  for (;;) {
    const page = await mpGet(`/preapproval/search?limit=${limit}&offset=${offset}`);
    const results = page.results || [];
    for (const p of results) {
      const detail = await mpGet(`/preapproval/${p.id}`);
      if (detail.status === "authorized" || detail.status === "active") {
        out.push({
          id: String(p.id),
          status: detail.status,
          currency: detail.auto_recurring?.currency_id || "ARS",
          externalReference: detail.external_reference || null,
          nextPaymentDate: detail.next_payment_date || null,
        });
      }
    }
    offset += limit;
    if (results.length === 0 || !page.paging || offset >= page.paging.total) break;
  }
  return out;
}

async function resolvePayerEmail(preapprovalId) {
  const page = await mpGet(`/authorized_payments/search?preapproval_id=${preapprovalId}`);
  const ap = (page.results || [])[0];
  if (!ap?.payment) return null;
  const pay = await mpGet(`/v1/payments/${ap.payment.id}`);
  return pay.payer?.email || null;
}

async function senderAddToPaidGroup(email) {
  const key = process.env.SENDER_API_KEY;
  if (!key) return;
  const res = await fetch(`${SENDER_API_BASE}/groups`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!res.ok) return;
  const data = await res.json();
  let group = (data.data || []).find((g) => g.title === "suscriptora-paga");
  if (!group) {
    const created = await fetch(`${SENDER_API_BASE}/groups`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "suscriptora-paga" }),
    }).then((r) => r.json());
    group = created.data;
  }
  if (!group?.id) return;
  await fetch(`${SENDER_API_BASE}/subscribers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, groups: [group.id], trigger_automation: false }),
  }).catch((e) => console.log(`   ⚠️  Sender: ${e.message}`));
}

async function main() {
  console.log(`modo: ${real ? "REAL" : "DRY-RUN"} (usá --real para aplicar)`);
  console.log("\n🔎 Enumerando preaprobaciones activas en Mercado Pago...");
  const active = await listPreapprovals();
  console.log(`   activas totales: ${active.length}`);

  const { data: profiles } = await supabase.from("profiles").select("id, email");
  const profileById = new Map((profiles || []).map((p) => [p.id, p.email]));
  const profileByEmail = new Map((profiles || []).map((p) => [p.email.toLowerCase().trim(), p.id]));

  let alreadyLinked = 0;
  let activated = 0;
  let noAccount = 0;

  for (const p of active) {
    // external_reference IS the Supabase user id for new-site preapprovals;
    // old migrated ones don't carry it (resolved by email below).
    const externalUserId = p.externalReference || null;

    let email = externalUserId ? profileById.get(externalUserId) : null;
    if (!email) email = await resolvePayerEmail(p.id);

    console.log(`\n${p.id} | ${p.status} | ${p.currency} | ref: ${p.externalReference || "-"}`);

    if (!email) {
      console.log(`   ❌ sin email vía API (sin cuenta mapeable)`);
      continue;
    }

    let accountId = externalUserId || profileByEmail.get(email.toLowerCase().trim()) || null;

    if (!accountId) {
      noAccount++;
      console.log(`   ℹ️  ${email} → sin cuenta (no se puede activar)`);
      continue;
    }

    // Ya linkeada? Mismo sub apuntando desde el perfil.
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, user_id")
      .eq("provider", "mercadopago")
      .eq("provider_subscription_id", p.id)
      .maybeSingle();

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("subscription_id")
      .eq("id", accountId)
      .maybeSingle();

    if (sub?.id && sub.user_id === accountId && profileRow?.subscription_id === sub.id) {
      alreadyLinked++;
      console.log(`   ✅ ${email} → ya activa (nada que hacer)`);
      continue;
    }

    const now = new Date().toISOString();
    const periodEnd = p.nextPaymentDate
      ? new Date(p.nextPaymentDate).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    if (!real) {
      console.log(`   [dry] ${email} → crearía sub 'mercadopago' + link de perfil`);
      continue;
    }

    const { data: newSub, error: subError } = await supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: accountId,
          provider: "mercadopago",
          provider_subscription_id: p.id,
          status: "active",
          plan_currency: p.currency,
          current_period_start: now,
          current_period_end: periodEnd,
        },
        { onConflict: "provider, provider_subscription_id" },
      )
      .select("id")
      .single();

    if (subError) {
      console.log(`   ⚠️  ${email} → ERROR: ${subError.message}`);
      continue;
    }

    if (newSub?.id) {
      await supabase
        .from("profiles")
        .update({ role: "subscriber", subscription_id: newSub.id, updated_at: now })
        .eq("id", accountId);
      await supabase
        .from("subscriptions")
        .update({ status: "canceled", updated_at: now })
        .eq("user_id", accountId)
        .eq("provider", "migrated");
      await senderAddToPaidGroup(email);
      activated++;
      console.log(`   ✅ ${email} → sub creada y perfil linkeado`);
    } else {
      console.log(`   ⚠️  ${email} → ERROR creando sub`);
    }
  }

  console.log(`\n━━━ Resumen ━━━`);
  console.log(`  Preaprobaciones activas:  ${active.length}`);
  console.log(`  Ya linkeadas:             ${alreadyLinked}`);
  console.log(`  Activadas ahora:          ${activated}`);
  console.log(`  Sin cuenta:               ${noAccount}`);
  console.log(`  Modo:                     ${real ? "REAL (aplicado)" : "DRY-RUN (sin cambios)"}`);
}

main().catch((err) => {
  console.error("\n💥 Error fatal:", err);
  process.exit(1);
});