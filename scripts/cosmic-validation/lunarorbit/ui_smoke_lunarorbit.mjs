/**
 * FAZ 3C / Adim 3 — Ay Yorungesi normal UI duman testi (Playwright).
 * 390/768/1280/1920px · tasma · icerik · yasak teknik alan sizintisi.
 */
import { chromium } from "playwright";
const URL = "http://localhost:3661/cosmic-calendar";
const FORBID = ["harness-verified", "validationStatus", "apsis-", "syzygy-", "astronomy-engine", "SearchLunarApsis", "topocentric", "isSupermoon", "fixedThreshold"];
const browser = await chromium.launch();
for (const [w, h, tag] of [[390, 844, "mobil"], [768, 1024, "tablet"], [1280, 900, "desktop"], [1920, 1080, "large"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForSelector("text=Ay Yörüngesi");
  const sec = p.locator("section").filter({ hasText: "Ay Yörüngesi" }).first();
  const ovX = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const dist = (await sec.locator("text=Ay-Dünya mesafesi").count()) > 0;
  const distType = (await sec.locator("text=/geocentric/").count()) > 0;
  const apsis = (await sec.locator("text=/Perigee|Apogee/").count());
  const minutePolicy = (await sec.locator("text=dakika düzeyi").count()) > 0;
  const nolle = (await sec.locator("text=/Nolle\\/Espenak %90/").count()) > 0;
  const fixedAux = (await sec.locator("text=/yardımcı çapraz kontrol/").count()) > 0;
  const km = (await sec.locator("text=/ km/").count());
  const secText = await sec.innerText();
  const leak = FORBID.filter(f => secText.includes(f));
  // saniye iddiasi: apsis kartlarinda "HH:MM:SS" formatinda zaman var mi (olmamali)
  const hasSeconds = /\d{2}:\d{2}:\d{2}/.test(secText);
  console.log(`[${tag} ${w}px] overflowX=${ovX} | mesafe=${dist} geocentric=${distType} | apsisKart=${apsis} dakikaPolicy=${minutePolicy} | nolle=${nolle} yardımcıEtiket=${fixedAux} | kmSayısı=${km} | saniyeVar=${hasSeconds} | sızıntı=${leak.length ? leak.join(",") : "yok"}`);
  if (tag === "desktop") await sec.screenshot({ path: "scripts/cosmic-validation/lunarorbit/.ui-lo-section.png" });
  await ctx.close();
}
await browser.close();
console.log("bitti");
