/**
 * Importa suscriptores antiguos de Mercado Pago (era WooCommerce) al nuevo sistema.
 *
 * Estas preaprobaciones (reason "Pedido NNNN - x1 Suscripción Triba" / "Abono mensual",
 * creadas antes de 2026-08-01) nunca se importaron y siguen cobrando en Mercado Pago
 * sin dar acceso en el sitio nuevo. Este script:
 *   1. Enumera las preaprobaciones viejas de la cuenta y las que están "authorized".
 *   2. Resuelve el payer email vía authorized_payments -> payment (la API no expone
 *      payer_email en la preaprobación).
 *   3. Las guarda en subscriber_migrations (mp_preapproval_id / mp_plan_currency).
 *   4. Si la persona ya tiene cuenta, crea la subscription 'mercadopago' real
 *      (renovable por el webhook existente) y cancela la de cortesía 'migrated'.
 *   5. Las sincroniza al grupo Sender "suscriptora-paga".
 *
 * Usage:
 *   node --env-file=.env scripts/import-migrated-mp.mjs [--real]
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
// Preaprovalas creadas en este momento son del sitio nuevo (external_reference = userId).
const OLD_THRESHOLD = "2026-08-01";

const real = process.argv.includes("--real");

const accessToken = process.env.MP_ACCESS_TOKEN;
const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ─── Mercado Pago helpers ───────────────────────────────────────

async function mpGet(path) {
  const res = await fetch(`${MP_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`MP ${res.status} GET ${path}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

async function listOldPreapprovals() {
  const out = [];
  let offset = 0;
  const limit = 50;
  for (;;) {
    const page = await mpGet(`/preapproval/search?limit=${limit}&offset=${offset}`);
    const results = page.results || [];
    for (const p of results) {
      const created = p.date_created || "";
      if (created < OLD_THRESHOLD) {
        const detail = await mpGet(`/preapproval/${p.id}`);
        out.push({
          id: p.id,
          status: detail.status,
          currency: detail.auto_recurring?.currency_id || "ARS",
          amount: detail.auto_recurring?.transaction_amount,
          created: created.slice(0, 10),
          reason: detail.reason || "",
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
  if (!ap?.payment) return { email: null, nextRetryDate: null };
  const pay = await mpGet(`/v1/payments/${ap.payment.id}`);
  return {
    email: pay.payer?.email || null,
    nextRetryDate: ap.next_retry_date || null,
  };
}

// ─── Sender helper (opcional) ───────────────────────────────────

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

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log(`modo: ${real ? "REAL" : "DRY-RUN"} (usá --real para aplicar)`);
  console.log("\n🔎 Enumerando preaprobaciones viejas en Mercado Pago...");
  const old = await listOldPreapprovals();
  const active = old.filter((p) => p.status === "authorized" || p.status === "active");
  console.log(`   viejas totales: ${old.length} | activas: ${active.length}`);

  const { data: profiles } = await supabase.from("profiles").select("id, email");
  const profileByEmail = new Map((profiles || []).map((p) => [p.email.toLowerCase().trim(), p.id]));

  let mapped = 0;
  let withAccount = 0;

  for (const p of active) {
    const { email, nextRetryDate } = await resolvePayerEmail(p.id);
    if (!email) {
      console.log(`\n${p.id} | ${p.created} | ${p.reason} -> ❌ sin email vía API`);
      continue;
    }
    const lower = email.toLowerCase().trim();
    const { data: existing } = await supabase
      .from("subscriber_migrations")
      .select("id, old_subscription_data, stripe_subscription_id, stripe_customer_id, migrated_at")
      .eq("email", lower)
      .maybeSingle();

    const accountId = profileByEmail.get(lower);
    mapped++;

    const line = {
      email: lower,
      preapproval: p.id,
      status: p.status,
      currency: p.currency,
      amount: p.amount,
      hasAccountRecord: !!existing,
      accountId,
    };
    console.log(`\n${email}`);
    console.log(`   preapproval: ${p.id} | ${p.status} | ${p.currency} ${p.amount} | ${p.created} | ${p.reason}`);

    if (!real) {
      console.log(`   [dry] deps: ${existing ? "ya en subscriber_migrations" : "INSERT"} | account: ${accountId ? "crear sub" : "sin cuenta (pending)"}`);
      continue;
    }

    // 1. Respaldar/mergear la fila de migración
    await supabase.from("subscriber_migrations").upsert(
      {
        email: lower,
        mp_preapproval_id: p.id,
        mp_plan_currency: p.currency,
        old_subscription_data: existing?.old_subscription_data ?? { imported_at: new Date().toISOString() },
        stripe_subscription_id: existing?.stripe_subscription_id ?? null,
        stripe_customer_id: existing?.stripe_customer_id ?? null,
        migrated_at: existing?.migrated_at ?? new Date().toISOString(),
      },
      { onConflict: "email" },
    );

    // 2. Si hay cuenta, crear la sub 'mercadopago' y cancelar la de cortesía
    if (accountId) {
      const now = new Date().toISOString();
      const periodEnd = nextRetryDate
        ? new Date(nextRetryDate).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: sub } = await supabase
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

      if (sub?.id) {
        await supabase
          .from("profiles")
          .update({ role: "subscriber", subscription_id: sub.id, updated_at: now })
          .eq("id", accountId);
        await supabase
          .from("subscriptions")
          .update({ status: "canceled", updated_at: now })
          .eq("user_id", accountId)
          .eq("provider", "migrated");
      }
      withAccount++;
      console.log(`   ✅ sub 'mercadopago' ${sub?.id ? "creada" : "ERROR"} (cuenta existente)`);
    } else {
      console.log(`   ℹ️  sin cuenta: solo mapeado en subscriber_migrations (se activará al registrarse)`);
    }

    // 3. Sync a Sender
    await senderAddToPaidGroup(email);
  }

  console.log(`\n━━━ Resumen ━━━`);
  console.log(`  Viejas activas:      ${active.length}`);
  console.log(`  Con email mapeado:   ${mapped}`);
  console.log(`  Con cuenta creada:   ${withAccount}`);
  console.log(`  Modo:                ${real ? "REAL (aplicado)" : "DRY-RUN (sin cambios)"}`);
}

main().catch((err) => {
  console.error("\n💥 Error fatal:", err);
  process.exit(1);
});