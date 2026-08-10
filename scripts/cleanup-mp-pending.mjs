/**
 * Cancela preaprobaciones de Mercado Pago abandonadas.
 *
 * Cuando alguien abre el checkout de MP (o hace doble-clic) se crea una
 * preaprobación con status "pending" que NO cobra nada hasta que el pagador
 * la autoriza. Las que quedan pending > 24h son intentos abandonados y se
 * pueden cancelar sin afectar a nadie.
 *
 * Reglas:
 *   1. Solo preaprobaciones con status "pending".
 *   2. Creadas hace más de 24 horas (coincide con el TTL del checkout-intent).
 *   3. Sin ningún pago asociado (guard extra: pendientes de cobro no se tocan).
 *
 * Usage:
 *   node --env-file=.env scripts/cleanup-mp-pending.mjs [--real]
 *
 * Por defecto corre en DRY-RUN (no escribe nada). Con --real cancela en MP.
 *
 * Requires in .env: MP_ACCESS_TOKEN
 */
const MP_BASE = "https://api.mercadopago.com";
const real = process.argv.includes("--real");
const ABANDONED_MS = 24 * 60 * 60 * 1000;

const accessToken = process.env.MP_ACCESS_TOKEN;

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

async function listPreapprovals() {
  const out = [];
  let offset = 0;
  const limit = 50;
  for (;;) {
    const page = await mpGet(`/preapproval/search?limit=${limit}&offset=${offset}`);
    const results = page.results || [];
    for (const p of results) {
      const detail = await mpGet(`/preapproval/${p.id}`);
      out.push({
        id: String(p.id),
        status: detail.status,
        created: detail.date_created || p.date_created || "",
        reason: detail.reason || "",
      });
    }
    offset += limit;
    if (results.length === 0 || !page.paging || offset >= page.paging.total) break;
  }
  return out;
}

async function hasAnyPayment(preapprovalId) {
  const page = await mpGet(`/authorized_payments/search?preapproval_id=${preapprovalId}`);
  return (page.results || []).some((r) => r.payment);
}

async function main() {
  console.log(`modo: ${real ? "REAL" : "DRY-RUN"} (usá --real para cancelar)`);
  console.log("\n🔎 Enumerando preaprobaciones pendientes abandonadas...");

  const all = await listPreapprovals();
  const cutoff = new Date(Date.now() - ABANDONED_MS).toISOString();
  let cancelled = 0;
  let skippedRecent = 0;
  let skippedWithPayment = 0;

  for (const p of all.filter((p) => p.status === "pending")) {
    console.log(`\n${p.id} | pending | creada: ${p.created} | reason: ${p.reason}`);

    if (!p.created || p.created >= cutoff) {
      skippedRecent++;
      console.log(`   ℹ️  menor a 24h → se deja como está`);
      continue;
    }

    const hasPayment = await hasAnyPayment(p.id);
    if (hasPayment) {
      skippedWithPayment++;
      console.log(`   ⚠️  tiene pago asociado → NO se cancela`);
      continue;
    }

    if (!real) {
      console.log(`   [dry] cancelaría`);
      continue;
    }

    await mpPut(`/preapproval/${p.id}`, { status: "cancelled" });
    cancelled++;
    console.log(`   ✅ cancelada`);
  }

  console.log(`\n━━━ Resumen ━━━`);
  console.log(`  Pending abandonadas canceladas: ${cancelled}`);
  console.log(`  Skiped por < 24h:              ${skippedRecent}`);
  console.log(`  Skiped por pago asociado:      ${skippedWithPayment}`);
  console.log(`  Modo: ${real ? "REAL (aplicado)" : "DRY-RUN (sin cambios)"}`);
}

main().catch((err) => {
  console.error("\n💥 Error fatal:", err);
  process.exit(1);
});