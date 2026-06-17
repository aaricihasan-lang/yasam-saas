import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "scripts/screenshots/faz10";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx  = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
const BASE = "http://localhost:3000/dashboard/cosmic-calendar";
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("text=Yaşam Takvimi");

const searchInput = () => page.locator("input[placeholder*='Dolunay']");
const searchBtn   = () => page.locator("button", { hasText: "Ara" }).first();

async function doSearch(q) {
  await searchInput().fill(q);
  await searchBtn().click();
  await page.waitForTimeout(300);
}

// ── 1. "Dolunay" araması ────────────────────────────────────────────────────
console.log("1) 'Dolunay' araması...");
await doSearch("Dolunay");
const res1 = await page.locator("text=Sonraki Dolunay").count();
const res1b = await page.locator("button", { hasText: "Takvimde Göster" }).count();
console.log("   Sonraki Dolunay sonucu:", res1 > 0 ? "✓" : "✗");
console.log("   Takvimde Göster butonu:", res1b > 0 ? "✓" : "✗");
const dolunayTxt = await page.locator("text=Sonraki Dolunay").locator("..").textContent().catch(() => "?");
console.log("   İçerik:", dolunayTxt?.trim().slice(0, 80));
await page.screenshot({ path: `${OUT}/01-dolunay.png`, fullPage: false });

// ── 2. "Yeni Ay" araması ────────────────────────────────────────────────────
console.log("2) 'Yeni Ay' araması...");
await page.locator("button[aria-label]").filter({ hasText: "" }).first(); // clear
await page.locator("button").filter({ hasText: "×" }).count();
// X butonu varsa tıkla
const xBtn = page.locator("button").filter({ has: page.locator("svg") }).last();
await searchInput().fill("");
await doSearch("Yeni Ay");
const res2 = await page.locator("text=Sonraki Yeni Ay").count();
console.log("   Sonraki Yeni Ay:", res2 > 0 ? "✓" : "✗");

// ── 3. "42 gün sonra" araması ───────────────────────────────────────────────
console.log("3) '42 gün sonra' araması...");
await searchInput().fill("");
await doSearch("42 gün sonra");
// Gün sonucu bir tarih göstermeli
const res3 = await page.locator("button", { hasText: "Takvimde Göster" }).count();
console.log("   42 gün sonra sonuç:", res3 > 0 ? "✓ (Takvimde Göster var)" : "✗");
const dateCell = await page.locator(".rounded-2xl").filter({ hasText: /Hicri/ }).count();
console.log("   Gün detay kartı:", dateCell > 0 ? "✓" : "✗");
await page.screenshot({ path: `${OUT}/02-42gun.png`, fullPage: false });

// ── 4. "15 Ağustos 2026" araması ────────────────────────────────────────────
console.log("4) '15 Ağustos 2026' araması...");
await searchInput().fill("");
await doSearch("15 Ağustos 2026");
const res4 = await page.locator("text=15 Ağustos 2026").count();
console.log("   15 Ağustos 2026 sonuç:", res4 > 0 ? "✓" : "✗");
await page.screenshot({ path: `${OUT}/03-agustos15.png`, fullPage: false });

// ── 5. "Ağustos 2026 Dolunay" araması ───────────────────────────────────────
console.log("5) 'Ağustos 2026 Dolunay' araması...");
await searchInput().fill("");
await doSearch("Ağustos 2026 Dolunay");
const res5a = await page.locator("text=Sonraki Dolunay").count();
const res5b = await page.locator(".rounded-2xl").filter({ hasText: "Dolunay" }).filter({ hasText: /gün/ }).count();
console.log("   Ağustos Dolunay sonuç:", (res5a + res5b) > 0 ? "✓" : "✗");
await page.screenshot({ path: `${OUT}/04-agustos-dolunay.png`, fullPage: false });

// ── 6. "Takvimde Göster" butonu çalışıyor mu? ───────────────────────────────
console.log("6) Takvimde Göster butonu...");
await searchInput().fill("");
await doSearch("Dolunay");
const takBtn = page.locator("button", { hasText: "Takvimde Göster" }).first();
if (await takBtn.count() > 0) {
  const ayBefore = await page.locator("h2").filter({ hasText: /202/ }).first().textContent();
  await takBtn.click();
  await page.waitForTimeout(400);
  const ayAfter = await page.locator("h2").filter({ hasText: /202/ }).first().textContent();
  // Arama temizlendi mi?
  const searchCleared = await page.locator("input[placeholder*='Dolunay']").inputValue();
  console.log("   Ay navigasyonu:", ayAfter?.trim());
  console.log("   Arama temizlendi:", !searchCleared ? "✓" : "✗ (kaldı: " + searchCleared + ")");
  console.log("   Ay değişti mi:", ayBefore !== ayAfter ? "✓ " + ayBefore + " → " + ayAfter : "(aynı ayda olabilir)");
  await page.screenshot({ path: `${OUT}/05-takvimde-goster.png`, fullPage: false });
}

// ── 7. Güçlü Günler açıklaması ──────────────────────────────────────────────
console.log("7) Güçlü Günler açıklaması...");
await page.goto(BASE, { waitUntil: "networkidle" });
const gucluCard = page.locator("div.rounded-3xl").filter({ hasText: "Bu Ayın Güçlü Günleri" }).first();
const hasPlus   = await gucluCard.locator("text=+").count();
const hasPuan   = await gucluCard.locator("text=/\\d+p/").count();
console.log("   + puan gösterimi:", hasPlus > 0 ? "✓" : "✗");
console.log("   Toplam puan badge:", hasPuan > 0 ? "✓" : "✗");
const firstReason = await gucluCard.locator("p.text-\\[9px\\]").first().textContent().catch(() => "?");
console.log("   İlk gün açıklaması:", firstReason?.trim().slice(0, 60));
await gucluCard.screenshot({ path: `${OUT}/06-guclu-gunler.png` });

// ── 8. Mobil ────────────────────────────────────────────────────────────────
console.log("8) Mobil görünüm...");
const mCtx  = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mPage = await mCtx.newPage();
await mPage.goto(BASE, { waitUntil: "networkidle" });
const overflow = await mPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
console.log("   Yatay taşma:", overflow ? "⚠ VAR" : "✓ yok");
const mInput = await mPage.locator("input[placeholder*='Dolunay']").count();
console.log("   Arama input mobilde:", mInput > 0 ? "✓ var" : "✗ yok");
await mPage.screenshot({ path: `${OUT}/07-mobile.png`, fullPage: false });
await mCtx.close();

console.log("Console hataları:", errors.length === 0 ? "✓ yok" : errors.slice(0, 3).join(", "));

await ctx.close();
await browser.close();
console.log(`\nScreenshots → ${OUT}`);
