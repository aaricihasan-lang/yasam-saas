/**
 * FAZ 3A / Adım 4 — Eclipse uzman modu UI testi (Playwright).
 * Şehir seçici · kapsama · filtreler · detay paneli · responsive · teknik sızıntı.
 */
import { chromium } from "playwright";
const URL = "http://localhost:3571/cosmic-calendar";
const FORBID = ["Saros", "saros", "agnitude", "centerLat", "longitude", "validation-", "engine-verified", "catalog-verified", "solar-2", "lunar-2"];
const ov = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const browser = await chromium.launch();
async function run(w, h, tag) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForSelector("text=🌑 Tutulmalar");
  const sec = p.locator("section").filter({ hasText: "🌑 Tutulmalar" }).first();
  // normal: Ankara, kart tıklanmaz, teknik sızıntı yok
  const normalLeak = FORBID.filter(f => (sec ? "" : "")); // placeholder
  const ovNormal = await ov(p);
  // uzman moda geç
  await sec.locator("button", { hasText: "Uzman Modu" }).first().click();
  await p.waitForTimeout(400);
  const hasCity = await sec.locator("select").count();
  const cardsBefore = await sec.locator("text=/Tutulması/").count();
  // şehir değiştir: Van (ilk select = şehir; ikinci = tür filtresi)
  await sec.locator("select").first().selectOption("Van");
  await p.waitForTimeout(400);
  const vanBadge = await sec.locator("text=/Van'dan/").count();
  // filtre: Güneş
  await sec.locator("button", { hasText: "Güneş" }).first().click();
  await p.waitForTimeout(300);
  const afterSolar = await sec.locator("text=/Tutulması/").count();
  const onlySolar = (await sec.locator("text=/Ay Tutulması/").count()) === 0;
  // filtre: Görülebilen
  await sec.locator("button", { hasText: "Görülebilen" }).first().click();
  await p.waitForTimeout(300);
  const afterVisible = await sec.locator("text=/Tutulması/").count();
  // temizle
  await sec.locator("button", { hasText: "Temizle" }).first().click();
  await p.waitForTimeout(300);
  const afterClear = await sec.locator("text=/Tutulması/").count();
  const ovExpert = await ov(p);
  // detay aç
  await sec.locator('[role="button"]').filter({ hasText: "Tutulması" }).first().click();
  await p.waitForTimeout(400);
  const dialog = p.locator('[role="dialog"]');
  const detailOpen = await dialog.count();
  const cityList = await dialog.locator("text=Referans şehir görünürlüğü").count();
  const dialogText = detailOpen ? await dialog.innerText() : "";
  const leak = FORBID.filter(f => dialogText.includes(f));
  const ovDetail = await ov(p);
  await dialog.locator('button[aria-label="Kapat"]').click();
  await p.waitForTimeout(200);
  const closed = (await p.locator('[role="dialog"]').count()) === 0;

  console.log(`[${tag} ${w}px] ovNormal=${ovNormal} ovExpert=${ovExpert} ovDetail=${ovDetail} | şehir-seç=${hasCity} | Van-rozet=${vanBadge>0} | filtreGüneş(yalnızGüneş=${onlySolar}) ${cardsBefore}→${afterSolar} | görülebilen=${afterVisible} | temizle→${afterClear} | detay=${detailOpen>0} şehirListe=${cityList>0} sızıntı=${leak.length?leak.join(","):"yok"} kapandı=${closed}`);
  if (tag === "mobil") await p.screenshot({ path: "scripts/cosmic-validation/eclipses/.ui-eclipse4-mobil.png", fullPage: false });
  await ctx.close();
}
await run(390, 844, "mobil");
await run(768, 1024, "tablet");
await run(1280, 900, "desktop");
await run(1920, 1080, "large");
await browser.close();
console.log("bitti");
