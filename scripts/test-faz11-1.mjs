import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "scripts/screenshots/faz11-1";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors  = [];

// ─── 1366x768 desktop ──────────────────────────────────────────────────────
const ctx  = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

const BASE = "http://localhost:3000/dashboard/cosmic-calendar";
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("text=Yaşam Takvimi");

// ── 1. Retro Durumu: tema + kalan gün ──────────────────────────────────────
console.log("1) Retro Durumu — tema + kalan gün...");
const retroCard = page.locator("div.rounded-3xl").filter({ hasText: "Seçili Gün Detayı" }).first();
const hasTema   = await retroCard.locator("text=/Sorumluluk|İletişim|İlişkiler|Eylem|İnançlar/").count();
const hasKalan  = await retroCard.locator("text=/\\d+ gün kaldı/").count();
const hasBadge  = await retroCard.locator("text=Aktif dönemde").count();
console.log("   Tema metni:", hasTema  > 0 ? "✓" : "✗");
console.log("   Kalan gün:", hasKalan > 0 ? "✓" : "✗");
console.log("   Aktif badge:", hasBadge > 0 ? "✓" : "✗");

// Retro Durumu kutusunu screenshot al
const retroBox = retroCard.locator("div").filter({ hasText: "🪐 Retro Durumu" }).first();
await retroBox.screenshot({ path: `${OUT}/01-retro-kart.png` }).catch(() => {});
await page.screenshot({ path: `${OUT}/01-full-page.png`, fullPage: false });

// ── 2. Yaklaşan Retro Dönemleri kartı ──────────────────────────────────────
console.log("2) Yaklaşan Retro Dönemleri kartı...");
const yaklasanKart = page.locator("div.rounded-3xl").filter({ hasText: "Yaklaşan Retro Dönemleri" }).first();
const karVarMi    = await yaklasanKart.count();
console.log("   Kart var:", karVarMi > 0 ? "✓" : "✗");
if (karVarMi > 0) {
  const retroBtns = await yaklasanKart.locator("button").all();
  console.log("   Retro kayıt sayısı:", retroBtns.length, retroBtns.length >= 1 ? "✓" : "✗");
  for (const b of retroBtns) {
    const txt = await b.textContent();
    console.log("    →", txt?.trim().replace(/\n+/g, " ").slice(0, 70));
  }
  await yaklasanKart.screenshot({ path: `${OUT}/02-yaklasan-retro-kart.png` });
}

// ── 3. Yaklaşan Retro tıklanınca navigate ───────────────────────────────────
console.log("3) Yaklaşan Retro tıklama → navigate...");
if (karVarMi > 0) {
  const firstBtn = yaklasanKart.locator("button").first();
  const ayBefore = await page.locator("h2").filter({ hasText: /202/ }).first().textContent();
  await firstBtn.click();
  await page.waitForTimeout(400);
  const ayAfter = await page.locator("h2").filter({ hasText: /202/ }).first().textContent();
  console.log("   Önceki ay:", ayBefore?.trim());
  console.log("   Sonraki ay:", ayAfter?.trim());
  console.log("   Navigate çalıştı:", ayBefore !== ayAfter ? "✓" : "(aynı ayda kalabilir)");
}
await page.screenshot({ path: `${OUT}/03-after-click.png`, fullPage: false });

// ── 4. Sol / Sağ kolon dengesi ───────────────────────────────────────────────
console.log("4) Sol kolon dolu mu? (Yaklaşan Retro sol kolonda)...");
// Sol kolonu bul — takvim, güçlü günler, yaklaşan retro aynı flex-col'da
const leftCol = page.locator(".flex-col.gap-4").first();
const leftCards = await leftCol.locator("div.rounded-3xl").all();
console.log("   Sol kolondaki kart sayısı:", leftCards.length, leftCards.length >= 4 ? "✓ (≥4)" : "⚠");

// ── 5. Mobil ────────────────────────────────────────────────────────────────
console.log("5) Mobil doğrulama...");
const mCtx  = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mPage = await mCtx.newPage();
await mPage.goto(BASE, { waitUntil: "networkidle" });
const overflow  = await mPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const mRetroKart = await mPage.locator("div.rounded-3xl").filter({ hasText: "Yaklaşan Retro Dönemleri" }).count();
console.log("   Yatay taşma:", overflow ? "⚠ VAR" : "✓ yok");
console.log("   Kart mobilde görünüyor:", mRetroKart > 0 ? "✓" : "✗");
await mPage.screenshot({ path: `${OUT}/04-mobile.png`, fullPage: false });
await mCtx.close();

console.log("\nConsole hataları:", errors.length === 0 ? "✓ yok" : errors.join(", "));
await ctx.close();
await browser.close();
console.log(`Screenshots → ${OUT}`);
