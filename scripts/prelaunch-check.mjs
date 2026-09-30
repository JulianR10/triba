/**
 * Gate de configuración previo al lanzamiento Mail Club. Solo lectura:
 * verifica que existan las claves y precios reales (sin placeholders),
 * sin hacer ningún cobro ni llamada de red.
 *
 * Falla (exit 1) si falta algo bloqueante. Los cobros reales EUR/USD/ARS
 * y la verificación en dashboards siguen siendo pasos manuales aparte.
 *
 * Usage:
 *   node --env-file=.env scripts/prelaunch-check.mjs
 */
const PLACEHOLDER_PREFIXES = ["price_xxx", "TEST-xxx", "your-", "xxx", "TODO", "CHANGEME"];

function isPlaceholder(v) {
  if (!v || !String(v).trim()) return true;
  const s = String(v).trim();
  return PLACEHOLDER_PREFIXES.some((p) => s === p || s.startsWith(p));
}

const checks = [
  { key: "STRIPE_SECRET_KEY", label: "Stripe secret key", blocking: true },
  { key: "STRIPE_WEBHOOK_SECRET", label: "Stripe webhook secret", blocking: true },
  { key: "STRIPE_PRICE_EUR", label: "Precio digital EUR", blocking: true },
  { key: "STRIPE_PRICE_USD", label: "Precio digital USD", blocking: true },
  { key: "STRIPE_PRICE_MAIL_CLUB_EUR", label: "Precio Mail Club EUR", blocking: true },
  { key: "STRIPE_PRICE_MAIL_CLUB_USD", label: "Precio Mail Club USD", blocking: true },
  { key: "MP_ACCESS_TOKEN", label: "Mercado Pago access token", blocking: true },
  { key: "MP_WEBHOOK_SECRET", label: "Mercado Pago webhook secret", blocking: true },
  { key: "SENDER_API_KEY", label: "Sender API key", blocking: true },
  { key: "SENDER_FROM_EMAIL", label: "Sender from email", blocking: true },
  { key: "SITE", label: "SITE (origen canónico)", blocking: false },
  { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase service role", blocking: true },
  { key: "PUBLIC_SUPABASE_URL", label: "Supabase URL", blocking: true },
];

let failed = 0;
let warned = 0;
for (const c of checks) {
  const val = process.env[c.key];
  if (isPlaceholder(val)) {
    if (c.blocking) {
      failed++;
      console.log(`  ✗ BLOQUEANTE  ${c.label} (${c.key})`);
    } else {
      warned++;
      console.log(`  ! opcional    ${c.label} (${c.key})`);
    }
  } else {
    console.log(`  ✓             ${c.label}`);
  }
}

console.log("");
if (failed > 0) {
  console.log(`FALTAN ${failed} valor(es) bloqueante(s). No lanzar.`);
  process.exit(1);
}
console.log(`Configuración OK${warned > 0 ? ` (${warned} aviso(s) no bloqueante(s))` : ""}.`);
console.log("Pendiente manual: cobros reales EUR/USD/ARS, dashboards y webhooks.");
