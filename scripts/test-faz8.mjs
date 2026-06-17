import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "scripts/screenshots/faz8";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx  = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
const BASE = "http://localhost:3000/dashboard/cosmic-calendar";

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("text=Yaşam Takvimi", { timeout: 15000 });

// ── 1. Yeni bölümler var mı? ──────────────────────────────────────────────
console.log("1) Yeni bölümler var mı?");
const rehber     = await page.locator("text=Günlük Rehber").count();
const potansiyel = await page.locator("text=Günün Potansiyeli").count();
const aktivite   = await page.locator("text=Uygun Aktiviteler").count();
const dikkat     = await page.locator("text=Dikkat Edilmesi Gerekenler").count();
const ruhsal     = await page.locator("text=Ruhsal Öneri").count();
console.log("   🔮 Günlük Rehber:",             rehber     > 0 ? "✓" : "✗");
console.log("   ✨ Günün Potansiyeli:",           potansiyel > 0 ? "✓" : "✗");
console.log("   ✓ Uygun Aktiviteler:",           aktivite   > 0 ? "✓" : "✗");
console.log("   ⚠ Dikkat Edilmesi Gerekenler:", dikkat     > 0 ? "✓" : "✗");
console.log("   🧘 Ruhsal Öneri:",               ruhsal     > 0 ? "✓" : "✗");
await page.screenshot({ path: `${OUT}/01-initial-1366x768.png`, fullPage: false });

// ── 2. Rehber içeriği dolu mu? ────────────────────────────────────────────
console.log("2) Rehber içeriği...");
// Aktivite listesindeki ✓ maddeler
const checkItems = await page.locator("text=✓").filter({ hasNot: page.locator("p") }).count();
// Daha güvenli: tüm ✓ içeren li elementleri
const aktiviteMadde = await page.locator("ul li").filter({ hasText: "✓" }).all();
console.log("   Aktivite madde sayısı:", aktiviteMadde.length, aktiviteMadde.length >= 3 ? "✓" : "✗");
for (const li of aktiviteMadde.slice(0, 5)) {
  console.log("    →", (await li.textContent())?.trim().replace(/\n/g, ""));
}
const dikkatMadde = await page.locator("ul li").filter({ hasText: "⚠" }).all();
console.log("   Dikkat madde sayısı:", dikkatMadde.length, dikkatMadde.length >= 2 ? "✓" : "✗");

// ── 3. Farklı güne tıkla → rehber değişiyor mu? ──────────────────────────
console.log("3) Rehber içeriği güne göre değişiyor mu?");
const ilkPotansiyel = await page.locator("text=Günün Potansiyeli").locator("+ p").textContent().catch(() =>
  page.locator(".text-violet-50\\/50, .bg-violet-50\\/50").locator("p:last-child").first().textContent()
).catch(() => "?");

// 1. güne tıkla
await page.locator("button").filter({ hasText: /^1$/ }).first().click();
await page.waitForTimeout(400);

const sonraPotansiyel = await page.locator(".bg-violet-50\\/50 p:last-child").first().textContent().catch(() => "?");
console.log("   17 Haz potansiyel:", ilkPotansiyel?.trim().slice(0, 50) + "...");
console.log("    1 Haz potansiyel:", sonraPotansiyel?.trim().slice(0, 50) + "...");
console.log("   İçerik değişti mi:", ilkPotansiyel !== sonraPotansiyel ? "✓ evet" : "⚠ aynı (aynı faz/burç olabilir)");
await page.screenshot({ path: `${OUT}/02-day1-selected.png`, fullPage: false });

// ── 4. Tooltip sistemi — hover testi ─────────────────────────────────────
console.log("4) Tooltip sistemi testi...");
// Ay fazı işaretli günler var mı?
const moonBtns = await page.locator("button.group\\/day").filter({ has: page.locator("span.text-\\[10px\\]") }).all();
console.log("   Ay fazı işaretli gün sayısı:", moonBtns.length);

if (moonBtns.length > 0) {
  const firstMoon = moonBtns[0];
  // Hover öncesi tooltip gizli mi?
  const tooltipBefore = await page.locator(".group\\/day:hover .group-hover\\/day\\:block").count();

  // Hover
  await firstMoon.hover();
  await page.waitForTimeout(200);

  // Tooltip görünüyor mu? (whitespace-nowrap ile bir span var)
  const tooltipEl = await firstMoon.locator("span.whitespace-nowrap").count();
  console.log("   Hover sonrası tooltip elementi:", tooltipEl > 0 ? "✓ var (hidden group-hover:block)" : "✗ yok");

  // CSS class kontrolü
  const tooltipClass = await firstMoon.locator("span").last().getAttribute("class");
  const hasGroupHover = tooltipClass?.includes("group-hover/day:block") ?? false;
  console.log("   group-hover/day:block class:", hasGroupHover ? "✓" : "✗");

  await page.screenshot({ path: `${OUT}/03-tooltip-hover.png`, fullPage: false });
} else {
  // Temmuz'a git
  await page.locator("button[aria-label='Sonraki ay']").click();
  await page.waitForTimeout(300);
  const moonBtns2 = await page.locator("button.group\\/day").filter({ has: page.locator("span.text-\\[10px\\]") }).all();
  console.log("   Temmuz'da ay fazı işaretli gün:", moonBtns2.length);
  if (moonBtns2.length > 0) {
    await moonBtns2[0].hover();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/03-tooltip-temmuz.png`, fullPage: false });
  }
}

// ── 5. 1366x768 full sayfa görünümü (fullPage: false = sadece viewport) ──
console.log("5) 1366x768 viewport screenshot...");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/04-viewport-1366x768.png`, fullPage: false });
console.log("   Screenshot alındı.");

// ── 6. Console hatası ─────────────────────────────────────────────────────
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
await page.reload({ waitUntil: "networkidle" });
console.log("Console hataları:", errors.length === 0 ? "✓ yok" : errors.join(", "));

await ctx.close();
await browser.close();
console.log(`\nScreenshots → ${OUT}`);
