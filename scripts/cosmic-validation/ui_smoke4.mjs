/**
 * FAZ 2C / Adım 4 — Uzman filtreleri + detay penceresi UI testi (Playwright).
 * Çalıştır:  node scripts/cosmic-validation/ui_smoke4.mjs
 */
import { chromium } from "playwright";
const URL = "http://localhost:3501/cosmic-calendar";
const log = (k, v) => console.log(`  ${k}: ${v}`);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function run(viewport, tag) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("text=Gökyüzü Açıları");

  // Uzman moda geç + Ay dahil
  await page.locator("button", { hasText: "Uzman Modu" }).first().click();
  await page.waitForTimeout(400);
  await page.locator("text=Ay açılarını dahil et").first().click();
  await page.waitForTimeout(500);

  const countCards = () => page.locator('[role="button"]').filter({ hasText: "Detay →" }).count();
  const baseCount = await countCards();
  log(`${tag} uzman kart sayısı`, baseCount);

  // Filtre panelini aç
  await page.locator("button", { hasText: "Filtreler" }).first().click();
  await page.waitForTimeout(300);
  log(`${tag} filtre paneli`, (await page.locator("text=Açı türü").count()) > 0 ? "AÇILDI" : "YOK");
  log(`${tag} filtre paneli overflowX`, await overflow(page));

  // Aspect filtresi: yalnız Kare
  await page.locator("button", { hasText: "□ Kare" }).first().click();
  await page.waitForTimeout(400);
  const afterKare = await countCards();
  log(`${tag} 'Kare' filtresi (≤ base)`, `${afterKare} (base ${baseCount})`);

  // Çoklu geçiş filtresi ekle
  await page.locator("text=Çoklu geçiş").first().click();
  await page.waitForTimeout(400);
  const afterTriple = await countCards();
  log(`${tag} +Çoklu geçiş`, afterTriple);

  // İstasyon yakını filtresi
  await page.locator("text=İstasyon yakını").first().click();
  await page.waitForTimeout(400);
  log(`${tag} +İstasyon (sonuç)`, await countCards());

  // Temizle
  await page.locator("button", { hasText: "Filtreleri temizle" }).first().click();
  await page.waitForTimeout(400);
  const afterClear = await countCards();
  log(`${tag} temizle → base'e döndü mü`, `${afterClear} (${afterClear === baseCount ? "EVET" : "HAYIR"})`);

  // Yalnız exact filtresi
  await page.locator("text=Yalnız exact").first().click();
  await page.waitForTimeout(400);
  log(`${tag} 'Yalnız exact' (≤ base)`, `${await countCards()} (base ${baseCount})`);
  await page.locator("button", { hasText: "Filtreleri temizle" }).first().click();
  await page.waitForTimeout(300);

  // Detay penceresi aç
  await page.locator('[role="button"]').filter({ hasText: "Detay →" }).first().click();
  await page.waitForTimeout(400);
  const dialog = page.locator('[role="dialog"]');
  log(`${tag} detay açıldı`, (await dialog.count()) > 0 ? "EVET" : "HAYIR");
  const fields = ["Açı türü", "Hassasiyet", "Güven", "Göreli hız", "İşaretli hız", "Orb türevi", "Geçiş", "İstasyon yakını", "konum"];
  let present = 0;
  for (const f of fields) if (await dialog.locator(`text=${f}`).count() > 0) present++;
  log(`${tag} detay alan sayısı`, `${present}/${fields.length}`);
  log(`${tag} detay overflowX`, await overflow(page));
  await page.screenshot({ path: `scripts/cosmic-validation/.ui4-${tag}.png` });
  // Kapat
  await dialog.locator('button[aria-label="Kapat"]').click();
  await page.waitForTimeout(300);
  log(`${tag} detay kapandı`, (await page.locator('[role="dialog"]').count()) === 0 ? "EVET" : "HAYIR");

  await ctx.close();
}

const browser = await chromium.launch();
console.log("=== DESKTOP 1280 ==="); await run({ width: 1280, height: 900 }, "desktop");
console.log("=== MOBİL 390 ===");    await run({ width: 390, height: 844 }, "mobile");
console.log("=== LARGE 1680 ===");   await run({ width: 1680, height: 1000 }, "large");
await browser.close();
console.log("\nBitti — ekran görüntüleri .ui4-*.png");
