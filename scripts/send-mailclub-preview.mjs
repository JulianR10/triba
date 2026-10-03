/**
 * Envía (o previsualiza con --dry) el email REAL de bienvenida Mail Club,
 * usando la misma plantilla que producción (`src/lib/email-templates.ts`).
 * No duplica HTML: si la plantilla cambia, este preview cambia con ella.
 *
 * Uso:
 *   node --env-file=.env scripts/send-mailclub-preview.mjs --email=alguien@ejemplo.com [--name="Julián"] [--founder=5] [--dry]
 *
 * Requiere en .env: SENDER_API_KEY, SENDER_FROM_EMAIL (y opcional SENDER_FROM_NAME).
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mailClubWelcomeHtml } from "../src/lib/email-templates.ts";
import { firstShipmentPeriod, shipmentMonthLabel } from "../src/lib/mail-club.ts";

const args = process.argv.slice(2);
const arg = (name) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const email = (arg("email") || "").trim().toLowerCase();
const dry = args.includes("--dry");

if (!email) {
  console.error("Falta --email=<destino>. Ej: --email=julianrecarte@gmail.com");
  process.exit(1);
}

const name = arg("name") || email.split("@")[0];
const founder = arg("founder") ? Number(arg("founder")) : 5;
const ship = firstShipmentPeriod(new Date());

const data = {
  recipientName: name,
  addressLines: [name, "Calle Mayor 1 — 2º B", "28013 Madrid, Madrid", "ES"],
  shipmentMonth: shipmentMonthLabel(ship.year, ship.month, "es"),
  founderNumber: Number.isFinite(founder) && founder > 0 ? founder : null,
};

const html = mailClubWelcomeHtml(data, "es");
const subject = "Bienvenida al Mail Club ✉️";

if (dry) {
  const out = join(tmpdir(), "triba-mailclub-welcome-preview.html");
  writeFileSync(out, html, "utf8");
  console.log(`DRY-RUN · HTML generado en: ${out}`);
  console.log(`Destinataria simulada: ${name} · mes: ${data.shipmentMonth} · fundadora: ${data.founderNumber}`);
  process.exit(0);
}

const key = process.env.SENDER_API_KEY || "";
const fromEmail = process.env.SENDER_FROM_EMAIL || "hola@comunidadtriba.com";
const fromName = process.env.SENDER_FROM_NAME || "Triba";
if (!key) {
  console.error("Falta SENDER_API_KEY en .env");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function send(attempt = 0) {
  const res = await fetch("https://api.sender.net/v2/message/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { email: fromEmail, name: fromName },
      to: { email },
      subject,
      html,
    }),
  });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const retryAfter = Number(res.headers.get("retry-after") || 0);
      const backoff = retryAfter ? retryAfter * 1000 : 1000 * Math.pow(2, attempt);
      console.log(`Sender ${res.status}: reintento en ${Math.round(backoff / 1000)}s...`);
      await sleep(backoff);
      return send(attempt + 1);
    }
    const text = await res.text().catch(() => "");
    throw new Error(`Sender ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

console.log(`Enviando bienvenida Mail Club a ${email} (${data.shipmentMonth})...`);
try {
  await send();
  console.log("OK: email enviado. Revisá la casilla (y spam la primera vez).");
} catch (err) {
  console.error("ERROR:", err.message);
  process.exit(1);
}
