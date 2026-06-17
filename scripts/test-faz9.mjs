import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "scripts/screenshots/faz9";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx  = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
const BASE = "http://localhost:3000/dashboard/cosmic-calendar";

const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("text=Yaşam Takvimi", { timeout: 15000 });

// ── 1. Yeni özellikler var mı? ──────────────────────────────────────────────
console.log("1) Yeni özellikler varlık kontrolü...");
const zimCizelge = await page.locator("text=Önümüzdeki Önemli Kozmik Olaylar").count();
const gucluGun   = await page.locator("text=Bu Ayın Güçlü Günleri").count();
const filtre     = await page.locator("text=Ay Fazları").count();
const tarihInput = await page.locator("input[placeholder*='GG.AA.YYYY']").count();
console.log("   Kozmik Zaman Çizelgesi:", zimCizelge > 0 ? "✓" : "✗");
console.log("   Bu Ayın Güçlü Günleri:", gucluGun  > 0 ? "✓" : "✗");
console.log("   Filtre çubuğu:",          filtre     > 0 ? "✓" : "✗");
console.log("   Tarih atlama input:",      tarihInput > 0 ? "✓" : "✗");
await page.screenshot({ path: `${OUT}/01-initial.png`, fullPage: false });

// ── 2. Zaman Çizelgesi içeriği ──────────────────────────────────────────────
console.log("2) Zaman Çizelgesi içeriği...");
const phaseCards = await page.locator("button").filter({ hasText: /Dolunay|Yeni Ay|İlk Dördün|Son Dördün/ }).filter({ hasText: /gün/ }).all();
console.log("   Faz event kartı sayısı:", phaseCards.length, phaseCards.length >= 4 ? "✓ (>=4)" : "⚠");
for (const c of phaseCards.slice(0, 5)) {
  const txt = await c.textContent();
  console.log("    →", txt?.trim().replace(/\n+/g, " ").slice(0, 60));
}

// ── 3. Ay değiştir — Güçlü Günler güncellensin ─────────────────────────────
console.log("3) Ay değişince Güçlü Günler güncellensin...");
const gucluBefore = await page.locator("div.rounded-3xl").filter({ hasText: "Bu Ayın Güçlü Günleri" }).locator("p.text-\\[11px\\]").first().textContent().catch(() => "?");
console.log("   Haziran güçlü gün:", gucluBefore?.trim());

await page.locator("button[aria-label='Sonraki ay']").click();
await page.waitForTimeout(400);
const gucluAfter = await page.locator("div.rounded-3xl").filter({ hasText: "Bu Ayın Güçlü Günleri" }).locator("p.text-\\[11px\\]").first().textContent().catch(() => "?");
console.log("   Temmuz güçlü gün:", gucluAfter?.trim());
console.log("   Güncellendi mi:", gucluBefore !== gucluAfter ? "✓ evet" : "⚠ aynı");
await page.screenshot({ path: `${OUT}/02-temmuz-guclu.png`, fullPage: false });

// Güçlü güne tıkla — sağ panel güncellensin
const gucluBtn = page.locator("div.rounded-3xl").filter({ hasText: "Bu Ayın Güçlü Günleri" }).locator("button").first();
const gucluCount = await gucluBtn.count();
if (gucluCount > 0) {
  await gucluBtn.click();
  await page.waitForTimeout(400);
  const secilenGun = await page.locator(".space-y-1\\.5 > div:first-child p:last-child").textContent().catch(() => "?");
  console.log("   Güçlü güne tıklandı → Seçili tarih:", secilenGun?.trim());
}

// ── 4. Tarih atlama testi ───────────────────────────────────────────────────
console.log("4) Tarih atlama testi...");
const inp = page.locator("input[placeholder*='GG.AA.YYYY']");
await inp.fill("15.09.2026");
await inp.press("Enter");
await page.waitForTimeout(400);

const ayBasligi = await page.locator("h2").filter({ hasText: /202/ }).first().textContent();
console.log("   15.09.2026 → Ay başlığı:", ayBasligi?.trim());
console.log("   Eylül'e gidildi mi:", ayBasligi?.includes("Eylül") ? "✓" : "✗ (değer: " + ayBasligi?.trim() + ")");
await page.screenshot({ path: `${OUT}/03-date-jump.png`, fullPage: false });

// Türkçe ay adıyla test
const inp2 = page.locator("input[placeholder*='GG.AA.YYYY']");
await inp2.fill("1 Kasım 2026");
await inp2.press("Enter");
await page.waitForTimeout(400);
const ay2 = await page.locator("h2").filter({ hasText: /202/ }).first().textContent();
console.log("   '1 Kasım 2026' → Ay:", ay2?.trim());
console.log("   Kasım'a gidildi mi:", ay2?.includes("Kasım") ? "✓" : "✗");

// ── 5. Filtre aç/kapat ─────────────────────────────────────────────────────
console.log("5) Filtre aç/kapat...");
// Haziran'a dön
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

// Ay Fazları filtresi kapalıyken moon emoji yok olmalı
const moonBefore = await page.locator("button").filter({ hasText: /🌑|🌓|🌕|🌗/ }).count();
console.log("   Ay Fazları ON → faz günleri:", moonBefore);

await page.locator("button").filter({ hasText: /^🌕 Ay Fazları$/ }).click();
await page.waitForTimeout(300);
const moonAfter = await page.locator("button").filter({ hasText: /🌑|🌓|🌕|🌗/ }).count();
console.log("   Ay Fazları OFF → faz günleri:", moonAfter);
console.log("   İkonlar gizlendi mi:", moonAfter < moonBefore ? "✓" : "✗ (before:" + moonBefore + " after:" + moonAfter + ")");

// Hicri filtre
const hicriBtn = page.locator("button").filter({ hasText: /🌙 Hicri/ });
await hicriBtn.click();
await page.waitForTimeout(400);
const hicriCells = await page.locator("span").filter({ hasText: /^H\d+$/ }).count();
console.log("   Hicri ON → H** sayısı:", hicriCells, hicriCells > 0 ? "✓" : "✗");
await page.screenshot({ path: `${OUT}/04-filters.png`, fullPage: false });

// Numeroloji filtre
const numBtn = page.locator("button").filter({ hasText: /🔢 Numeroloji/ });
await numBtn.click();
await page.waitForTimeout(400);
const numCells = await page.locator("span").filter({ hasText: /^N\d+$/ }).count();
console.log("   Numeroloji ON → N** sayısı:", numCells, numCells > 0 ? "✓" : "✗");
await page.screenshot({ path: `${OUT}/05-hicri-num.png`, fullPage: false });

// ── 6. Güçlü Günler kartı Temmuz'a göre güncelleniyor mu? ─────────────────
console.log("6) Güçlü Günler zaman çizelgesi olayına tıklayınca güncellensin...");
// Zaman çizelgesindeki ilk karta tıkla
const timelineBtn = page.locator("div").filter({ hasText: "Önümüzdeki Önemli Kozmik Olaylar" }).locator("button").first();
if (await timelineBtn.count() > 0) {
  await timelineBtn.click();
  await page.waitForTimeout(400);
  const ay = await page.locator("h2").filter({ hasText: /202/ }).first().textContent();
  console.log("   Zaman çizelgesi tıklandı → Ay:", ay?.trim());
  console.log("   " + (ay && ay !== "Haziran 2026" ? "✓ Ay değişti" : "⚠ değişmedi"));
}

// ── 7. Mobil görünüm ───────────────────────────────────────────────────────
console.log("7) Mobil görünüm...");
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mPage = await mCtx.newPage();
await mPage.goto(BASE, { waitUntil: "networkidle" });
await mPage.waitForSelector("text=Yaşam Takvimi");
const overflow = await mPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
console.log("   Yatay taşma:", overflow ? "⚠ VAR" : "✓ yok");
await mPage.screenshot({ path: `${OUT}/06-mobile.png`, fullPage: false });
await mCtx.close();

// ── 8. Console hataları ────────────────────────────────────────────────────
console.log("Console hataları:", errors.length === 0 ? "✓ yok" : errors.join(", "));

await ctx.close();
await browser.close();
console.log(`\nScreenshots → ${OUT}`);
