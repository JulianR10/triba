/**
 * Re-dispara la automatización de bienvenida de un suscriptor del newsletter gratuito.
 *
 * Sender NO re-dispara automatizaciones a miembros ya agregados a un grupo, aunque el
 * POST /subscribers lleve trigger_automation:true (el welcome ya salió una vez y Sender
 * no lo repite). Solución: borrar el subscriber de Sender y re-crearlo (alta a grupo en
 * UNA llamada con trigger_automation) para que la automatización "welcome" se dispare
 * de nuevo.
 *
 * Uso:
 *   node --env-file=.env scripts/resend-welcome.mjs --email=julianrecarte@gmail.com --dry
 *   node --env-file=.env scripts/resend-welcome.mjs --email=julianrecarte@gmail.com
 *
 * Necesita en .env: SENDER_API_KEY, PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";

const SENDER_API_BASE = "https://api.sender.net/v2";
const key = process.env.SENDER_API_KEY;
const emailArg = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1];
const dry = process.argv.includes("--dry");

if (!key) {
  console.error("Falta SENDER_API_KEY en .env");
  process.exit(1);
}
if (!emailArg) {
  console.error("Falta --email=<email>");
  process.exit(1);
}

const email = emailArg.toLowerCase().trim();

async function req(method, path, body) {
  const res = await fetch(SENDER_API_BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    throw new Error(`Sender ${method} ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

async function main() {
  console.log(`email: ${email} | modo: ${dry ? "DRY-RUN" : "REAL"}`);

  const groups = await req("GET", "/groups");
  const group = (groups.data || []).find((g) => g.title === "newsletter-gratuito");
  if (!group) {
    console.error("No existe el grupo newsletter-gratuito");
    process.exit(1);
  }
  console.log(`grupo newsletter-gratuito: ${group.id}`);

  if (dry) {
    console.log(`[dry] quitaría ${email} del grupo ${group.id} y volvería a POST /subscribers con trigger_automation`);
    return;
  }

  console.log(`quitando ${email} del grupo ${group.id}...`);
  await req("DELETE", `/subscribers/groups/${group.id}`, { subscribers: [email] });

  await req("POST", "/subscribers", {
    email,
    groups: [group.id],
    trigger_automation: true,
  });
  console.log(`subscriber re-creado en ${group.title} con trigger_automation → bienvenida disparada`);

  const supabase = createClient(
    process.env.PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  try {
    await supabase
      .from("newsletters")
      .update({ sender_synced: true, sender_synced_at: new Date().toISOString(), sender_sync_error: null })
      .eq("email", email);
    console.log("Supabase sender_synced actualizado.");
  } catch (e) {
    console.log("Supabase update falló (no crítico):", e.message);
  }
}

main().catch((e) => {
  console.error("\n💥", e.message);
  process.exit(1);
});