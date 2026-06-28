/**
 * FAZ 3A / Adım 3 — Tutulmalar UI duman testi (Playwright).
 * 390/768/1280/1920px · taşma · kart içeriği · yasak teknik alanlar gizli mi.
 * Çalıştır:  node scripts/cosmic-validation/eclipses/ui_smoke_eclipse.mjs
 */
import { chromium } from "playwright";
const URL = "http://localhost:3571/cosmic-calendar";
const FORBIDDEN = ["Saros", "saros", "Magnitude", "magnitude", "latitude", "longitude",
  "Latitude", "Longitude", "distance", "Distance", "altitude", "Altitude",
  "confidence", "validation", "engine-verified", "catalog-verified", "obscuration", "solar-2", "lunar-2"];

const browser = await chromium.launch();
for (const [w, h, tag] of [[390, 844, "mobil"], [768, 1024, "tablet"], [1280, 900, "desktop"], [1920, 1080, "large"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("text=🌑 Tutulmalar");
  const sec = page.locator("section").filter({ hasText: "🌑 Tutulmalar" }).first();
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const cards = await sec.locator("text=/Tutulması/").count();
  const upcoming = (await sec.locator("text=Yaklaşan").count()) > 0;
  const past = (await sec.locator("text=Geçmiş").count()) > 0;
  const visBadges = await sec.locator("text=/Ankara'dan görül/").count();
  const orbBadge = await sec.locator("text=Örtülme oranı").count();
  // yasak teknik alan sızıntısı
  const secText = await sec.innerText();
  const leaked = FORBIDDEN.filter(f => secText.includes(f));
  console.log(`[${tag} ${w}px] overflowX=${overflowX} | kart=${cards} | yaklaşan=${upcoming} geçmiş=${past} | görünürlük rozeti=${visBadges} | örtülme=${orbBadge} | SIZAN teknik=${leaked.length ? leaked.join(",") : "yok"}`);
  if (tag === "mobil") await page.screenshot({ path: "scripts/cosmic-validation/eclipses/.ui-eclipse-mobil.png" });
  if (tag === "desktop") await sec.screenshot({ path: "scripts/cosmic-validation/eclipses/.ui-eclipse-section.png" });
  await ctx.close();
}
await browser.close();
console.log("bitti");
