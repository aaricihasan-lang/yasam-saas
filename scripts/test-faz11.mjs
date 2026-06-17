import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "scripts/screenshots/faz11";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx  = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
const BASE = "http://localhost:3000/dashboard/cosmic-calendar";
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("text=Yaşam Takvimi");

const search = (q) => async () => {
  await page.locator("input[placeholder*='Merkür']").fill(q);
  await page.locator("button", { hasText: "Ara" }).first().click();
  await page.waitForTimeout(350);
};

// ── 1. Retro Durumu gerçek veriye bağlandı mı? ─────────────────────────────
console.log("1) Retro Durumu (bugün aktif retro)...");
const retroAlani = await page.locator("div.rounded-3xl").filter({ hasText: "Seçili Gün Detayı" }).first();
const retroTxt   = await retroAlani.locator("text=/Retro/").first().textContent().catch(() => "?");
console.log("   Retro alanı:", retroTxt?.trim().slice(0, 60));
// Satürn 29 May - 14 Ekim 2026 aktif olmalı (bugün 17 Haziran 2026)
const saturnRetro = await retroAlani.locator("text=Satürn Retrosu").count();
console.log("   Satürn Retrosu aktif:", saturnRetro > 0 ? "✓" : "✗ (veri kontrolü gerekiyor)");
await page.screenshot({ path: `${OUT}/01-retro-durumu.png`, fullPage: false });

// ── 2. Retro arama — "Merkür retrosu" ──────────────────────────────────────
console.log("2) 'Merkür retrosu' araması...");
await search("Merkür retrosu")();
const merkurRes = await page.locator("text=Merkür Retrosu").count();
console.log("   Merkür Retrosu sonucu:", merkurRes > 0 ? "✓" : "✗");
const takvimBtn = await page.locator("button", { hasText: "Takvimde Göster" }).count();
console.log("   Takvimde Göster butonu:", takvimBtn > 0 ? "✓" : "✗");
const merkurTxt = await page.locator(".rounded-2xl").filter({ hasText: "Merkür Retrosu" }).textContent().catch(() => "?");
console.log("   İçerik:", merkurTxt?.trim().slice(0, 80).replace(/\n/g, " "));
await page.screenshot({ path: `${OUT}/02-merkur-retro.png`, fullPage: false });

// ── 3. "Satürn retrosu" araması ─────────────────────────────────────────────
console.log("3) 'Satürn retrosu' araması (aktif)...");
await page.locator("input[placeholder*='Merkür']").fill("");
await search("Satürn retrosu")();
const saturnRes   = await page.locator("text=Satürn Retrosu").count();
const aktifLabel  = await page.locator("text=Aktif Dönem").count();
console.log("   Satürn Retrosu:", saturnRes > 0 ? "✓" : "✗");
console.log("   Aktif Dönem etiketi:", aktifLabel > 0 ? "✓" : "✗");
await page.screenshot({ path: `${OUT}/03-saturn-retro.png`, fullPage: false });

// ── 4. "Aktif retrolar" araması ─────────────────────────────────────────────
console.log("4) 'Aktif retrolar' araması...");
await page.locator("input[placeholder*='Merkür']").fill("");
await search("Aktif retrolar")();
const aktifRetroList = await page.locator("text=Aktif Retrolar").count();
console.log("   Aktif Retrolar listesi:", aktifRetroList > 0 ? "✓" : "✗");
await page.screenshot({ path: `${OUT}/04-aktif-retrolar.png`, fullPage: false });

// ── 5. Zaman Çizelgesinde retro eventleri ───────────────────────────────────
console.log("5) Zaman Çizelgesinde retro eventleri...");
await page.goto(BASE, { waitUntil: "networkidle" });
const retroEvents = await page.locator("button").filter({ hasText: /Retrosu/ }).filter({ hasText: /gün/ }).all();
console.log("   Zaman çizelgesindeki retro event sayısı:", retroEvents.length, retroEvents.length > 0 ? "✓" : "✗ (60-90 gün aralığında retro yok olabilir)");
for (const e of retroEvents.slice(0, 3)) {
  const txt = await e.textContent();
  console.log("    →", txt?.trim().replace(/\n+/g, " ").slice(0, 60));
}

// ── 6. Takvimde retro işaretçileri ──────────────────────────────────────────
console.log("6) Takvimde retro başlangıç işaretçileri...");
// Satürn retrosu Mayıs'ta başladı. Eylül'e gidip Merkür retrosu başlangıcını görmeye çalış
await page.locator("button[aria-label='Sonraki ay']").click(); // Temmuz
await page.locator("button[aria-label='Sonraki ay']").click(); // Ağustos
await page.locator("button[aria-label='Sonraki ay']").click(); // Eylül
await page.waitForTimeout(300);
const eylulAy = await page.locator("h2").filter({ hasText: /202/ }).first().textContent();
console.log("   Ay:", eylulAy?.trim());
// Eylül'de Merkür retrosu 13 Eylül
const retroCells = await page.locator("button").filter({ has: page.locator(".group\\/retro") }).all();
const retroSymbols = await page.locator(".group\\/retro").all();
console.log("   Retro işaretçili hücre sayısı:", retroSymbols.length, retroSymbols.length > 0 ? "✓" : "✗ (Eylül'de Merkür retro yok olabilir)");
await page.screenshot({ path: `${OUT}/05-takvim-retro.png`, fullPage: false });

// ── 7. Takvimde Göster — retro sonucu ───────────────────────────────────────
console.log("7) Takvimde Göster retro navigasyonu...");
await page.goto(BASE, { waitUntil: "networkidle" });
await search("Merkür retrosu")();
const takBtn = page.locator("button", { hasText: "Takvimde Göster" }).first();
if (await takBtn.count() > 0) {
  await takBtn.click();
  await page.waitForTimeout(400);
  const ay = await page.locator("h2").filter({ hasText: /202/ }).first().textContent();
  console.log("   Navigate edildi →", ay?.trim());
  const searchCleared = await page.locator("input[placeholder*='Merkür']").inputValue();
  console.log("   Arama temizlendi:", !searchCleared ? "✓" : "✗");
  await page.screenshot({ path: `${OUT}/06-takvim-goster.png`, fullPage: false });
}

// ── 8. Mobil ────────────────────────────────────────────────────────────────
console.log("8) Mobil görünüm...");
const mCtx  = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mPage = await mCtx.newPage();
await mPage.goto(BASE, { waitUntil: "networkidle" });
const overflow = await mPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
console.log("   Yatay taşma:", overflow ? "⚠ VAR" : "✓ yok");
await mPage.screenshot({ path: `${OUT}/07-mobile.png`, fullPage: false });
await mCtx.close();

console.log("\nConsole hataları:", errors.length === 0 ? "✓ yok" : errors.slice(0, 3).join(", "));
await ctx.close();
await browser.close();
console.log(`Screenshots → ${OUT}`);
