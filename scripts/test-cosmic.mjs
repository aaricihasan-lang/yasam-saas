import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const OUT = "scripts/screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const BASE = "http://localhost:3000/dashboard/cosmic-calendar";

// ── 1. Sayfa açılıyor mu? ──────────────────────────────────────────────────
console.log("1) Sayfa açılıyor mu?");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("text=Yaşam Takvimi", { timeout: 15000 });
await page.screenshot({ path: join(OUT, "01-initial.png"), fullPage: true });
console.log("   ✓ Sayfa açıldı");

// ── 2. Bugünün Enerjisi / Seçili Gün Detayı görünüyor mu? ─────────────────
const detayBaslik = await page.textContent("text=Seçili Gün Detayı");
const kozmikOzet  = await page.textContent("text=Kozmik Özet");
console.log("2) Seçili Gün Detayı kartı:", detayBaslik ? "✓ var" : "✗ yok");
console.log("   Kozmik Özet şeridi:", kozmikOzet ? "✓ var" : "✗ yok");

// ── 3. Takvim günlerine tıklama ────────────────────────────────────────────
console.log("3) Takvim günlerine tıklama testi...");

// Seçili günün başlık metnini al (Miladi Tarih alanı)
const beforeDate = await page.textContent(".space-y-1\\.5 > div:first-child p:last-child").catch(() => "?");
console.log("   Önceki tarih:", beforeDate);

// Takvimde 15. günü bul ve tıkla
const dayButtons = await page.locator("button").filter({ hasText: /^15$/ }).all();
if (dayButtons.length > 0) {
  await dayButtons[0].click();
  await page.waitForTimeout(400);
  const afterDate = await page.textContent(".space-y-1\\.5 > div:first-child p:last-child").catch(() => "?");
  console.log("   15'e tıklandıktan sonra tarih:", afterDate);
  console.log("   " + (afterDate !== beforeDate ? "✓ Tarih değişti" : "⚠ Tarih değişmedi (aynı gün seçili olabilir)"));
}
await page.screenshot({ path: join(OUT, "02-day-clicked.png"), fullPage: true });

// ── 4. Ay navigasyonu ──────────────────────────────────────────────────────
console.log("4) Önceki Ay butonu...");
const prevBtn = page.locator("button[aria-label='Önceki ay']");
const monthBefore = await page.textContent("h2");
await prevBtn.click();
await page.waitForTimeout(300);
const monthAfter = await page.textContent("h2");
console.log("   Önceki ay:", monthBefore?.trim(), "→", monthAfter?.trim());
console.log("   " + (monthBefore !== monthAfter ? "✓ Ay değişti" : "✗ Ay değişmedi"));
await page.screenshot({ path: join(OUT, "03-prev-month.png"), fullPage: true });

console.log("   Sonraki Ay butonu...");
const nextBtn = page.locator("button[aria-label='Sonraki ay']");
await nextBtn.click(); // geri dön
await nextBtn.click(); // temmuz'a geç
await page.waitForTimeout(300);
const monthTemmuz = await page.textContent("h2");
console.log("   Temmuz'a geçildi mi:", monthTemmuz?.trim());
await page.screenshot({ path: join(OUT, "04-next-month-temmuz.png"), fullPage: true });

// ── 5. Ay fazı ikonları görünüyor mu? (Temmuz) ────────────────────────────
console.log("5) Temmuz'da ay fazı ikonları...");
await nextBtn.click(); // Ağustos
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, "05-agustos.png"), fullPage: true });
const moonEmojis = await page.locator("button").filter({ hasText: /🌑|🌓|🌕|🌗/ }).all();
console.log("   Ay fazı ikonlu gün sayısı:", moonEmojis.length, moonEmojis.length > 0 ? "✓" : "✗");

// ── 6. Bugün seçiliyken Gezegen Saati kartı ───────────────────────────────
console.log("6) Bugüne dön, Gezegen Saati kartı...");
// Takvimde bugüne göre ay navigasyonu (4 kez geri)
for (let i = 0; i < 3; i++) await prevBtn.click();
await page.waitForTimeout(300);
const todayBtn = page.locator("button", { has: page.locator("span.text-\\[7px\\]") });
const todayCount = await todayBtn.count();
if (todayCount > 0) {
  await todayBtn.first().click();
  await page.waitForTimeout(400);
}
const gezegenKarti = await page.locator("text=Şu Anki Gezegen Saati").count();
console.log("   Şu Anki Gezegen Saati kartı:", gezegenKarti > 0 ? "✓ görünüyor" : "✗ görünmüyor");
await page.screenshot({ path: join(OUT, "06-today-selected.png"), fullPage: true });

// ── 7. Başka gün seçilince Gezegen Saati kartı gizleniyor mu? ─────────────
console.log("7) Başka gün seçilince Gezegen Saati kartı...");
const nonTodayBtns = await page.locator("button").filter({ hasText: /^[0-9]+$/ }).all();
for (const btn of nonTodayBtns) {
  const txt = await btn.textContent();
  const hasToday = await btn.locator("span.text-\\[7px\\]").count();
  if (hasToday === 0 && txt?.trim() !== "") {
    await btn.click();
    break;
  }
}
await page.waitForTimeout(400);
const gezegenGizli = await page.locator("text=Şu Anki Gezegen Saati").count();
console.log("   Başka gün seçilince:", gezegenGizli === 0 ? "✓ gizlendi" : "✗ hâlâ görünüyor");
await page.screenshot({ path: join(OUT, "07-other-day.png"), fullPage: true });

// ── 8. Mobil görünüm taşma testi ──────────────────────────────────────────
console.log("8) Mobil görünüm (390px)...");
await ctx.close();
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mPage = await mCtx.newPage();
await mPage.goto(BASE, { waitUntil: "networkidle" });
await mPage.waitForSelector("text=Yaşam Takvimi", { timeout: 10000 });
const overflow = await mPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
console.log("   Yatay taşma:", overflow ? "⚠ VAR" : "✓ yok");
await mPage.screenshot({ path: join(OUT, "08-mobile.png"), fullPage: true });

// ── Console hataları ───────────────────────────────────────────────────────
const errors = [];
mPage.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await mPage.reload({ waitUntil: "networkidle" });
console.log("\nConsole hataları:", errors.length === 0 ? "✓ yok" : errors.join("\n  "));

await mCtx.close();
await browser.close();
console.log("\nEkran görüntüleri:", OUT);
