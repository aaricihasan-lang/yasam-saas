import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "scripts/screenshots/faz12";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors  = [];

const ctx  = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

const BASE = "http://localhost:3000/dashboard/cosmic-calendar";
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("text=Kozmik Ajanda");

// ── 1. Kozmik Ajanda varlık kontrolü ──────────────────────────────────────
console.log("1) Kozmik Ajanda bölümü...");
const ajandaBolum = page.locator("div").filter({ hasText: "🗓 Kozmik Ajanda" }).first();
const bolumVarMi  = await ajandaBolum.count();
console.log("   Bölüm var:", bolumVarMi > 0 ? "✓" : "✗");

// Olay satırları
const rows = await ajandaBolum.locator("button.flex.w-full").count();
console.log("   Olay sayısı:", rows, rows >= 5 ? "✓" : "⚠");

// Filtreler
const filters = await ajandaBolum.locator("button").filter({ hasText: /Tümü|Ay Fazları|Retrolar|Güçlü/ }).count();
console.log("   Filtre sayısı:", filters, filters === 4 ? "✓" : "✗");

await page.screenshot({ path: `${OUT}/01-ajanda-full.png`, fullPage: false });
await ajandaBolum.screenshot({ path: `${OUT}/01-ajanda-kart.png` });

// ── 2. Ay Fazları filtresi ─────────────────────────────────────────────────
console.log("2) 'Ay Fazları' filtresi...");
await ajandaBolum.locator("button", { hasText: "Ay Fazları" }).click();
await page.waitForTimeout(200);
const phaseRows = await ajandaBolum.locator("button.flex.w-full").count();
console.log("   Ay Fazı satırı sayısı:", phaseRows, phaseRows >= 2 ? "✓" : "✗");
const retroRows = await ajandaBolum.locator("button.flex.w-full").filter({ hasText: /Retrosu/ }).count();
console.log("   Retro satırı:", retroRows === 0 ? "✓ (filtre çalışıyor)" : "✗ (retro görünüyor)");

// ── 3. Retrolar filtresi ───────────────────────────────────────────────────
console.log("3) 'Retrolar' filtresi...");
await ajandaBolum.locator("button", { hasText: "Retrolar" }).click();
await page.waitForTimeout(200);
const retroOnly = await ajandaBolum.locator("button.flex.w-full").count();
const noPhase   = await ajandaBolum.locator("button.flex.w-full").filter({ hasText: /Yeni Ay|Dolunay|İlk Dördün|Son Dördün/ }).count();
console.log("   Sadece retro satırları:", retroOnly, retroOnly >= 1 ? "✓" : "✗ (90g içinde retro yok)");
console.log("   Faz satırı:", noPhase === 0 ? "✓ yok" : "✗ görünüyor");

// ── 4. Güçlü Günler filtresi ───────────────────────────────────────────────
console.log("4) 'Güçlü Günler' filtresi...");
await ajandaBolum.locator("button", { hasText: "Güçlü Günler" }).click();
await page.waitForTimeout(200);
const gucluRows = await ajandaBolum.locator("button.flex.w-full").count();
console.log("   Güçlü gün satırı:", gucluRows, gucluRows >= 1 ? "✓" : "⚠ (hesaplamayı kontrol et)");
for (let i = 0; i < Math.min(gucluRows, 3); i++) {
  const txt = await ajandaBolum.locator("button.flex.w-full").nth(i).textContent();
  console.log("    →", txt?.trim().replace(/\n+/g, " ").slice(0, 70));
}
await ajandaBolum.screenshot({ path: `${OUT}/02-guclu-gunler-filtre.png` });

// ── 5. Tümü filtresi geri dön ──────────────────────────────────────────────
console.log("5) 'Tümü' filtresi + olaya tıklama...");
await ajandaBolum.locator("button", { hasText: "Tümü" }).click();
await page.waitForTimeout(200);
const tumuRows = await ajandaBolum.locator("button.flex.w-full").count();
console.log("   Tümü toplam olay:", tumuRows);

// İlk olaya tıkla
const firstEvent = ajandaBolum.locator("button.flex.w-full").first();
const ayBefore = await page.locator("h2").filter({ hasText: /202/ }).first().textContent();
await firstEvent.click();
await page.waitForTimeout(400);
const ayAfter = await page.locator("h2").filter({ hasText: /202/ }).first().textContent();
console.log("   Tıklama navigate:", ayBefore?.trim(), "→", ayAfter?.trim());
console.log("   Navigate çalıştı:", !(ayBefore === ayAfter) ? "✓" : "(aynı ay — ilk olay bu ayda)");
await page.screenshot({ path: `${OUT}/03-after-click.png`, fullPage: false });

// ── 6. Geri sayım renkleri ─────────────────────────────────────────────────
console.log("6) Geri sayım renkleri...");
await page.goto(BASE, { waitUntil: "networkidle" });
const ajanda2 = page.locator("div").filter({ hasText: "🗓 Kozmik Ajanda" }).first();
const roseCount  = await ajanda2.locator(".text-rose-600").count();
const amberCount = await ajanda2.locator(".text-amber-600").count();
const slateCount = await ajanda2.locator(".text-slate-400").count();
console.log("   Yakın (≤7g, kırmızı):", roseCount);
console.log("   Orta (≤21g, amber):", amberCount);
console.log("   Uzak (>21g, gri):", slateCount);
console.log("   Renk sistemi:", (roseCount + amberCount + slateCount) > 0 ? "✓" : "✗");

// ── 7. Performans — sayfa yükleme süresi ──────────────────────────────────
console.log("7) Performans...");
const t0 = Date.now();
await page.reload({ waitUntil: "networkidle" });
const t1 = Date.now();
console.log("   Reload süresi:", t1 - t0, "ms", (t1 - t0) < 3000 ? "✓" : "⚠");

// ── 8. Mobil ──────────────────────────────────────────────────────────────
console.log("8) Mobil görünüm...");
const mCtx  = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mPage = await mCtx.newPage();
await mPage.goto(BASE, { waitUntil: "networkidle" });
const overflow   = await mPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const mAjanda    = await mPage.locator("div").filter({ hasText: "🗓 Kozmik Ajanda" }).count();
const mFilterBtn = await mPage.locator("button", { hasText: "Ay Fazları" }).count();
console.log("   Yatay taşma:", overflow ? "⚠ VAR" : "✓ yok");
console.log("   Ajanda mobilde:", mAjanda > 0 ? "✓" : "✗");
console.log("   Filtreler mobilde:", mFilterBtn > 0 ? "✓" : "✗");
await mPage.screenshot({ path: `${OUT}/04-mobile.png`, fullPage: false });
await mCtx.close();

console.log("\nConsole hataları:", errors.length === 0 ? "✓ yok" : errors.slice(0, 3).join(", "));
await ctx.close();
await browser.close();
console.log(`Screenshots → ${OUT}`);
