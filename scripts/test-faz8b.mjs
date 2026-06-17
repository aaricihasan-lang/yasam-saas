import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "scripts/screenshots/faz8";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx  = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();

await page.goto("http://localhost:3000/dashboard/cosmic-calendar", { waitUntil: "networkidle" });
await page.waitForSelector("text=Günlük Rehber");

// Sağ panele scroll et ve screenshot al
await page.evaluate(() => window.scrollTo(0, 300));
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/05-scrolled-right-panel.png` });

// Tooltip testi — Haziran'da mevcut ay fazı günlerini bul
const moonBtns = await page.locator("button").filter({ hasText: /🌑|🌓|🌕|🌗/ }).all();
console.log("Ay fazı günleri:", moonBtns.length);

if (moonBtns.length > 0) {
  // İlk fazı hover et
  await moonBtns[0].hover();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/06-tooltip-active.png` });
  console.log("Tooltip hover screenshot alındı");

  // Tooltip metnini al
  const tooltipText = await moonBtns[0].locator("span").last().textContent();
  console.log("Tooltip metni:", tooltipText?.trim());
} else {
  // Temmuz'a geç
  await page.locator("button[aria-label='Sonraki ay']").click();
  await page.waitForTimeout(300);
  const moonBtns2 = await page.locator("button").filter({ hasText: /🌑|🌓|🌕|🌗/ }).all();
  console.log("Temmuz ay fazı günleri:", moonBtns2.length);
  if (moonBtns2.length > 0) {
    await moonBtns2[0].hover();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/06-tooltip-temmuz.png` });
    const tooltipText = await moonBtns2[0].locator("span").last().textContent();
    console.log("Tooltip metni (Temmuz):", tooltipText?.trim());
  }
}

// Sağ panel element screenshot
await page.goto("http://localhost:3000/dashboard/cosmic-calendar", { waitUntil: "networkidle" });
await page.waitForSelector("text=Seçili Gün Detayı");
const panel = page.locator("div.rounded-3xl").filter({ hasText: "Seçili Gün Detayı" }).first();
await panel.screenshot({ path: `${OUT}/07-detail-card.png` });
console.log("Detay kartı screenshot alındı");

await ctx.close();
await browser.close();
console.log("done");
