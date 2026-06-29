/**
 * FAZ 3B / Adım 4 — VOC uzman modu UI testi (Playwright).
 * Toggle · filtreler · detay paneli · responsive · normal-mod sızıntı kontrolü.
 */
import { chromium } from "playwright";
const URL = "http://localhost:3611/cosmic-calendar";
// Normal modda görünmemesi gereken teknik alanlar (detay panelinde görünebilir)
const NORMAL_FORBID = ["harness-verified", "validationStatus", "Doğrulama", "Kaynak:", "voc-2"];
const ov = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const browser = await chromium.launch();

async function run(w, h, tag) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForSelector("text=Ay Boşlukta mı");
  const sec = p.locator("section").filter({ hasText: "Ay Boşlukta mı" }).first();
  const ovNormal = await ov(p);
  // normal modda teknik sızıntı yok mu?
  const normalText = await sec.innerText();
  const normalLeak = NORMAL_FORBID.filter(f => normalText.includes(f));
  // uzman moda geç
  await sec.locator("button", { hasText: "Uzman Modu" }).first().click();
  await p.waitForTimeout(400);
  const filterBar = (await sec.locator("text=Aspectsiz").count()) > 0;
  const cardsBefore = await sec.locator('[role="button"]').filter({ hasText: "Detay →" }).count();
  // filtre: Aspectsiz
  await sec.locator("text=Aspectsiz").first().click();
  await p.waitForTimeout(300);
  const afterNoAsp = await sec.locator('[role="button"]').filter({ hasText: "Detay →" }).count();
  // temizle
  await sec.locator("button", { hasText: "Temizle" }).first().click();
  await p.waitForTimeout(300);
  // süre filtresi: Kısa
  await sec.locator("button", { hasText: "Kısa" }).first().click();
  await p.waitForTimeout(300);
  const afterShort = await sec.locator('[role="button"]').filter({ hasText: "Detay →" }).count();
  await sec.locator("button", { hasText: "Temizle" }).first().click();
  await p.waitForTimeout(300);
  const ovExpert = await ov(p);
  // detay aç
  await sec.locator('[role="button"]').filter({ hasText: "Detay →" }).first().click();
  await p.waitForTimeout(400);
  const dialog = p.locator('[role="dialog"]');
  const detailOpen = await dialog.count();
  const dtxt = detailOpen ? await dialog.innerText() : "";
  const hasTech = ["Doğrulama", "Kaynak", "Dahil cisimler", "Hesap tanımı: klasik VOC"].filter(f => dtxt.includes(f) || dtxt.includes("klasik VOC")).length;
  const hasDefinition = dtxt.includes("klasik VOC") || dtxt.includes("Void of Course");
  const ovDetail = await ov(p);
  await dialog.locator('button[aria-label="Kapat"]').click();
  await p.waitForTimeout(200);
  const closed = (await p.locator('[role="dialog"]').count()) === 0;

  console.log(`[${tag} ${w}px] ovN=${ovNormal} ovE=${ovExpert} ovD=${ovDetail} | normalSızıntı=${normalLeak.length ? normalLeak.join(",") : "yok"} | filtreBar=${filterBar} | aspectsiz ${cardsBefore}→${afterNoAsp} | kısa→${afterShort} | detay=${detailOpen > 0} teknikAlan=${hasTech} tanım=${hasDefinition} kapandı=${closed}`);
  if (tag === "mobil") await p.screenshot({ path: "scripts/cosmic-validation/voidmoon/.ui-voc4-mobil.png" });
  await ctx.close();
}
await run(390, 844, "mobil");
await run(768, 1024, "tablet");
await run(1280, 900, "desktop");
await run(1920, 1080, "large");
await browser.close();
console.log("bitti");
