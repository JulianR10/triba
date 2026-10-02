/**
 * Actualización trimestral del precio ARS de las preaprobaciones Mail Club
 * existentes en Mercado Pago, SIN recrear suscripciones.
 *
 * Afecta SOLO a `subscriptions` con provider=mercadopago, plan_type=mail_club
 * y status=active. Compara el `transaction_amount` vigente en MP y actualiza
 * lo distinto vía `PUT /preapproval/:id` (mismo patrón que el upgrade).
 * Idempotente: si el importe ya coincide, se salta sin escribir.
 *
 * Protocolo (los términos exigen aviso ≥30 días):
 *   1. node --env-file=.env scripts/update-mp-mailclub-price.mjs --amount 17000
 *      → dry-run: muestra qué cambiaría.
 *   2. node --env-file=.env scripts/update-mp-mailclub-price.mjs --amount 17000 --list-emails
 *      → CSV con los emails afectados para el aviso previo por email propio
 *      (MP no notifica a la pagadora del cambio de monto).
 *   3. Esperar ≥30 días desde el aviso.
 *   4. ... --amount 17000 --real → aplica. El nuevo importe rige desde la
 *      próxima renovación (MP no permite programarlo).
 *
 * Usage:
 *   node --env-file=.env scripts/update-mp-mailclub-price.mjs --amount <ARS> [--real] [--list-emails]
 *
 * Por defecto corre en DRY-RUN (no escribe nada).
 *
 * Requires in .env:
 *   PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MP_ACCESS_TOKEN
 */
import { createClient } from "@supabase/supabase-js";

const MP_BASE = "https://api.mercadopago.com";

const args = process.argv.slice(2);
const real = args.includes("--real");
const listEmails = args.includes("--list-emails");
const amountArg = args[args.indexOf("--amount") + 1];
const newAmount = Number(amountArg);

if (!Number.isFinite(newAmount) || newAmount <= 0 || !Number.isInteger(newAmount)) {
  console.error("Falta --amount <ARS entero positivo> (p. ej. --amount 17000).");
  process.exit(2);
}

const accessToken = process.env.MP_ACCESS_TOKEN;
if (!accessToken) {
  console.error("Falta MP_ACCESS_TOKEN en .env.");
  process.exit(2);
}
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

async function mpPut(path, body) {
  const res = await fetch(`${MP_BASE}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`MP ${res.status} PUT ${path}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

function csvCell(s) {
  const v = s === null || s === undefined ? "" : String(s);
  const neutralized = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(v) || neutralized !== v ? `"${neutralized.replace(/"/g, '""')}"` : neutralized;
}

const { data: subs, error } = await supabase
  .from("subscriptions")
  .select("id, user_id, provider_subscription_id, status, plan_currency")
  .eq("provider", "mercadopago")
  .eq("plan_type", "mail_club")
  .eq("status", "active");

if (error) throw error;

const results = [];
for (const sub of subs || []) {
  const mpId = sub.provider_subscription_id;
  let current = null;
  let email = "";
  try {
    const detail = await mpGet(`/preapproval/${mpId}`);
    current = Number(detail.auto_recurring?.transaction_amount);
    if (detail.status !== "authorized" && detail.status !== "active") {
      results.push({ mpId, email, current, action: `skip (MP status ${detail.status})` });
      continue;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", sub.user_id)
      .maybeSingle();
    email = profile?.email || "";
    if (!Number.isFinite(current)) {
      results.push({ mpId, email, current: "?", action: "skip (sin transaction_amount en MP)" });
      continue;
    }
    if (current === newAmount) {
      results.push({ mpId, email, current, action: "skip (ya coincide)" });
      continue;
    }
    if (!real) {
      results.push({ mpId, email, current, action: `actualizaría ${current} → ${newAmount}` });
      continue;
    }
    await mpPut(`/preapproval/${mpId}`, {
      auto_recurring: { transaction_amount: newAmount, currency_id: "ARS" },
    });
    // Verificación post-update: releer y confirmar el importe.
    const check = await mpGet(`/preapproval/${mpId}`);
    const after = Number(check.auto_recurring?.transaction_amount);
    results.push({
      mpId, email, current,
      action: after === newAmount ? `ok ${current} → ${after}` : `ERROR: MP dice ${after}`,
    });
  } catch (err) {
    results.push({ mpId, email, current: current ?? "?", action: `error: ${String(err.message || err).slice(0, 160)}` });
  }
}

if (listEmails) {
  const emails = [...new Set(results.map((r) => r.email).filter(Boolean))].sort();
  console.log(["email", ...emails.map((e) => csvCell(e))].join("\n"));
} else {
  for (const r of results) {
    console.log(`${r.mpId} | ${r.email || "-"} | actual=${r.current} | ${r.action}`);
  }
  const toChange = results.filter((r) => r.action.startsWith("actualizaría") || r.action.startsWith("ok")).length;
  const skipped = results.length - toChange;
  const errors = results.filter((r) => r.action.startsWith("error") || r.action.startsWith("ERROR")).length;
  console.log(`modo: ${real ? "REAL" : "DRY-RUN"} | nuevo importe: ARS ${newAmount} | total: ${results.length} | cambio: ${toChange} | skip: ${skipped} | errores: ${errors}`);
}
if (results.some((r) => r.action.startsWith("error") || r.action.startsWith("ERROR"))) process.exitCode = 1;
