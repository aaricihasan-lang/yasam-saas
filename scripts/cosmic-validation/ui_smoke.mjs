/**
 * FAZ 2C / Adım 3 — Kozmik Ajanda UI duman testi (Playwright).
 * Normal/Uzman mod, Ay açıları toggle, taşma kontrolü (desktop + mobil).
 * Çalıştır:  node scripts/cosmic-validation/ui_smoke.mjs
 */
import { chromium } from "playwright";

const URL = "http://localhost:3501/cosmic-calendar";
const results = [];
const log = (k, v) => { results.push([k, v]); console.log(`  ${k}: ${v}`); };

async function overflow(page) {
  return page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    w: document.documentElement.clientWidth,
  }));
}

async function run(viewport, tag) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("text=Gökyüzü Açıları", { timeout: 30000 });

  // Normal mod taşma
  const ov1 = await overflow(page);
  log(`${tag} normal overflowX(px)`, ov1.overflowX);
  // Uzman butonu var mı, normalde exact saat YOK
  const expertBtn = page.locator("button", { hasText: "Uzman Modu" });
  log(`${tag} Uzman butonu`, (await expertBtn.count()) > 0 ? "VAR" : "YOK");
  const exactBefore = await page.locator("text=/Tam:|Tam tarih:/").count();
  log(`${tag} normalde exact-saat etiketi`, exactBefore);

  // Uzman moda geç
  await expertBtn.first().click();
  await page.waitForTimeout(600);
  const moonToggle = page.locator("text=Ay açılarını dahil et");
  log(`${tag} Ay toggle (uzman)`, (await moonToggle.count()) > 0 ? "VAR" : "YOK");
  const exactAfter = await page.locator("text=/Tam:|Tam tarih:|Exact doğrulanamadı/").count();
  log(`${tag} uzmanda exact etiketi sayısı`, exactAfter);
  const precMinute = await page.locator("text=Dakika hassasiyetinde").count();
  const precDate = await page.locator("text=Tarih hassasiyetinde").count();
  log(`${tag} precision(dakika/tarih)`, `${precMinute}/${precDate}`);
  const ov2 = await overflow(page);
  log(`${tag} uzman overflowX(px)`, ov2.overflowX);

  // Ay açıkken Ay rozeti
  const moonBefore = await page.locator("text=☽ Ay").count();
  await moonToggle.first().click();
  await page.waitForTimeout(600);
  const moonAfter = await page.locator("text=☽ Ay").count();
  log(`${tag} Ay rozeti (kapalı→açık)`, `${moonBefore}→${moonAfter}`);
  const ov3 = await overflow(page);
  log(`${tag} uzman+Ay overflowX(px)`, ov3.overflowX);

  await page.screenshot({ path: `scripts/cosmic-validation/.ui-${tag}.png`, fullPage: true });
  await ctx.close();
}

const browser = await chromium.launch();
console.log("=== DESKTOP (1280×900) ===");
await run({ width: 1280, height: 900 }, "desktop");
console.log("=== MOBİL (390×844) ===");
await run({ width: 390, height: 844 }, "mobile");
await browser.close();

const anyOverflow = results.filter(([k]) => k.includes("overflowX")).some(([, v]) => v > 1);
console.log(`\nGENEL: ${anyOverflow ? "TAŞMA VAR (incele)" : "TAŞMA YOK"} | ekran görüntüleri .ui-desktop.png / .ui-mobile.png`);
