import { chromium } from "playwright";

const BASE = "https://www.universotriba.com";
const results = [];

function ok(name, detail = "") {
  results.push({ name, status: "PASS", detail });
}
function fail(name, detail = "") {
  results.push({ name, status: "FAIL", detail });
}

async function triggerReveals(page) {
  await page.evaluate(() => {
    document.querySelectorAll(".reveal-stagger, .reveal-text").forEach((el) =>
      el.classList.add("revealed")
    );
  });
  await page.waitForTimeout(700);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: "es-AR" });
  const page = await ctx.newPage();

  // ── 1. Home ──
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const popup = page.locator("#mailclub-popup");
  const popupVisible = await popup.isVisible().catch(() => false);
  popupVisible ? ok("Home: popup aparece") : fail("Home: popup no apareció");

  const dismiss = popup.locator('button:has-text("Seguir explorando")');
  if ((await dismiss.count()) > 0) {
    await dismiss.click();
    await page.waitForTimeout(600);
    const closed = await popup.evaluate((el) => el.dataset.open === "0");
    closed ? ok("Home: popup se cierra") : fail("Home: popup no se cierra");
  } else fail("Home: no hay botón de cierre");

  // ── 2. Suscribirme ──
  await page.goto(`${BASE}/suscribirme`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const tabs = page.locator("#currency-segments button, #mailclub-segments button");
  const tabCount = await tabs.count();
  tabCount >= 3 ? ok("Suscribirme: pestañas moneda", `${tabCount}`) : fail("Suscribirme: pestañas", `${tabCount}`);

  const susBtn = page.locator('text=Suscribirse').first();
  await susBtn.scrollIntoViewIfNeeded();
  const susBtnCount = await susBtn.count();
  susBtnCount > 0 ? ok("Suscribirme: btn Suscribirse") : fail("Suscribirme: btn ausente");

  if (susBtnCount > 0) {
    const w = await susBtn.first().evaluate((el) => getComputedStyle(el).width);
    w && w !== "0px" ? ok("Suscribirme: btn full-width", w) : fail("Suscribirme: btn 0px", w);
  }

  // precio /mes visible (EUR /mes, $16.000/mes, etc.)
  const mes = page.locator('text=/mes/');
  const mesCount = await mes.count();
  mesCount > 0 ? ok("Suscribirme: /mes presente", `${mesCount}`) : fail("Suscribirme: /mes ausente");

    // ── 3. Click Suscribirse Mail Club → login/signup con redirect ──
  const mcBtn = page.locator('#mailclub-login-box a:has-text("Suscribirse")');
  if (await mcBtn.count() > 0) {
    const href = (await mcBtn.first().getAttribute("href")) || "";
    (href.includes("/iniciar-sesion") && href.includes("plan%3Dmail_club"))
      ? ok("Suscribirme: btn va a login+redirect")
      : fail("Suscribirme: btn login+redirect", href);
  }

  // ── 4. Mail Club ──
  await page.goto(`${BASE}/mail-club`, { waitUntil: "networkidle" });
  const carta = page.locator('img[src*="cartaSinFondo"]');
  (await carta.count()) > 0 ? ok("Mail Club: carta presente") : fail("Mail Club: carta ausente");

  const band = page.locator('text=/Quiero mi sobre|Qué trae tu sobre/');
  (await band.count()) > 0 ? ok("Mail Club: banda + CTA") : fail("Mail Club: banda");

  // ── 5. Términos / Privacidad (reveal fix) ──
  for (const p of ["/terminos", "/privacidad"]) {
    await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
    await triggerReveals(page);
    const hidden = await page.evaluate(() => {
      const els = document.querySelectorAll(".reveal-stagger.revealed > *, .reveal-text.revealed > *");
      let bad = 0;
      els.forEach((e) => {
        const s = getComputedStyle(e);
        if (s.opacity === "0" || s.display === "none") bad++;
      });
      return bad;
    });
    hidden === 0 ? ok(`${p}: reveal ok`) : fail(`${p}: ${hidden} hijos ocultos`);
  }

  // ── 6. Consola sin errores ──
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  errors.length === 0 ? ok("Consola: sin errores JS") : fail("Consola: errores JS", errors.join("; "));

  await browser.close();

  console.log("\n=== SMOKE TEST PROD ===");
  results.forEach((r) => console.log(`${r.status}  ${r.name}${r.detail ? " — " + r.detail : ""}`));
  const pass = results.filter((r) => r.status === "PASS").length;
  console.log(`\n${pass}/${results.length} tests pasados`);
  process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
})();
