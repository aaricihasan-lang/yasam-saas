import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "scripts/screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const BASE = "http://localhost:3000/dashboard/cosmic-calendar";

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("text=Yaşam Takvimi", { timeout: 15000 });

// ── 4. Ay navigasyonu — doğru h2 seçimi ──────────────────────────────────
console.log("4) Ay navigasyonu testi...");
// Takvim ayı başlığı: "Haziran 2026" gibi — energy card h2'si "Dinlenme ve Hazırlık"
// Spesifik: h2'ler içinde "202" içereni seç
const ayBasligi = () => page.locator("h2").filter({ hasText: /202/ }).first();

const oncekiAy = await ayBasligi().textContent();
console.log("   Başlangıç ayı:", oncekiAy?.trim());

await page.locator("button[aria-label='Önceki ay']").click();
await page.waitForTimeout(300);
const sonrakiAy = await ayBasligi().textContent();
console.log("   Önceki aya geçildi:", sonrakiAy?.trim());
console.log("   " + (oncekiAy !== sonrakiAy ? "✓ Ay değişti" : "✗ Ay değişmedi"));
await page.screenshot({ path: `${OUT}/04a-prev-month.png`, fullPage: true });

// İleri 2 kez — Temmuz
await page.locator("button[aria-label='Sonraki ay']").click();
await page.waitForTimeout(200);
await page.locator("button[aria-label='Sonraki ay']").click();
await page.waitForTimeout(300);
const temmuzAy = await ayBasligi().textContent();
console.log("   2 kez ileri:", temmuzAy?.trim());
console.log("   " + (temmuzAy?.includes("Temmuz") ? "✓ Temmuz" : "✗ Temmuz değil"));
await page.screenshot({ path: `${OUT}/04b-temmuz.png`, fullPage: true });

// ── 5. İleri aylarda ay fazı ikonları ────────────────────────────────────
console.log("5) Temmuz'da ay fazı ikonları...");
const moonBtns = await page.locator("button").filter({ hasText: /🌑|🌓|🌕|🌗/ }).all();
console.log("   Ay fazı ikonlu günler:", moonBtns.length, moonBtns.length >= 2 ? "✓" : "✗");
for (const b of moonBtns) {
  const txt = await b.textContent();
  console.log("    →", txt?.trim().replace(/\n/g, " "));
}

// Ağustos
await page.locator("button[aria-label='Sonraki ay']").click();
await page.waitForTimeout(300);
const agustosAy = await ayBasligi().textContent();
console.log("   Ağustos:", agustosAy?.trim());
await page.screenshot({ path: `${OUT}/05-agustos.png`, fullPage: true });
const moonBtnsAgustos = await page.locator("button").filter({ hasText: /🌑|🌓|🌕|🌗/ }).all();
console.log("   Ağustos ay fazı ikonları:", moonBtnsAgustos.length, moonBtnsAgustos.length >= 2 ? "✓" : "✗");

// ── 6. Sayfa fresh yükle → bugün seçili → Gezegen Saati kartı ────────────
console.log("6) Fresh yükleme — bugün seçili — Gezegen Saati kartı...");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

// "Bugün" badge görünüyor mu?
const bugunBadge = await page.locator("text=● Bugün").count();
console.log("   '● Bugün' badge:", bugunBadge > 0 ? "✓ görünüyor" : "✗ yok");

// Şu Anki Gezegen Saati kartı
const gezegenKarti = await page.locator("text=Şu Anki Gezegen Saati").count();
console.log("   'Şu Anki Gezegen Saati' kartı:", gezegenKarti > 0 ? "✓ görünüyor" : "✗ görünmüyor");

await page.screenshot({ path: `${OUT}/06-fresh-load-today.png`, fullPage: true });

// ── 7. Başka güne tıkla → Gezegen Saati kartı gizlensin ─────────────────
console.log("7) Başka güne tıkla → Gezegen Saati gizlenmesi...");
// "1" günü tıkla (bugün Haziran 17, 1 farklı bir gün)
const gunBir = page.locator("button").filter({ hasText: /^1$/ }).first();
await gunBir.click();
await page.waitForTimeout(400);

const bugunBadgeSonra = await page.locator("text=● Bugün").count();
const gezegenKartiSonra = await page.locator("text=Şu Anki Gezegen Saati").count();
console.log("   '● Bugün' badge:", bugunBadgeSonra === 0 ? "✓ gizlendi" : "✗ hâlâ var");
console.log("   Gezegen Saati kartı:", gezegenKartiSonra === 0 ? "✓ gizlendi" : "✗ hâlâ var");

await page.screenshot({ path: `${OUT}/07-other-day-fresh.png`, fullPage: true });

// ── 8. Tıkladıktan sonra sağ panel güncellendi mi? ────────────────────────
console.log("8) Sağ panelde tarih güncellemesi...");
const secilenGunMiladi = await page.locator(".space-y-1\\.5 > div:first-child p:last-child").textContent().catch(() => "?");
console.log("   Seçili gün Miladi:", secilenGunMiladi?.trim());
console.log("   " + (secilenGunMiladi?.includes("1 Haziran") ? "✓ 1 Haziran gösteriyor" : "⚠ tarih: " + secilenGunMiladi));

// Şu Anki Gezegen Saati kartı tekrar bugüne tıkla
const todayBtnEl = page.locator("button").filter({ has: page.locator("span", { hasText: "bugün" }) });
const todayCount = await todayBtnEl.count();
if (todayCount > 0) {
  await todayBtnEl.first().click();
  await page.waitForTimeout(400);
  const gezegenGeri = await page.locator("text=Şu Anki Gezegen Saati").count();
  console.log("   Bugüne geri tıklandı → Gezegen Saati:", gezegenGeri > 0 ? "✓ geri döndü" : "✗ geri gelmedi");
  await page.screenshot({ path: `${OUT}/09-today-back.png`, fullPage: true });
}

// ── Console hataları ───────────────────────────────────────────────────────
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
console.log("\nConsole hataları:", errors.length === 0 ? "✓ yok" : "\n  " + errors.join("\n  "));

await ctx.close();
await browser.close();
console.log("\nEkran görüntüleri →", OUT);
