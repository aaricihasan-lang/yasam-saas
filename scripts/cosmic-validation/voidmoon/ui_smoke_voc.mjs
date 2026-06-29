/**
 * FAZ 3B / Adım 3 — VOC normal UI duman testi (Playwright).
 * 390/768/1280/1920px · taşma · içerik · yasak teknik alan sızıntısı.
 */
import { chromium } from "playwright";
const URL = "http://localhost:3611/cosmic-calendar";
const FORBID = ["harness-verified", "validationStatus", "voc-2", "astronomy-engine", "source", "confidence", "noAspectInSign", "voidStartUTC"];
const browser = await chromium.launch();
for (const [w, h, tag] of [[390, 844, "mobil"], [768, 1024, "tablet"], [1280, 900, "desktop"], [1920, 1080, "large"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForSelector("text=Ay Boşlukta mı");
  const sec = p.locator("section").filter({ hasText: "Ay Boşlukta mı" }).first();
  const ovX = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const status = (await sec.locator("text=/Ay şu an boşlukta/").count()) > 0;
  const cards = await sec.locator("text=/→/").count();
  const def = (await sec.locator("text=Hesap tanımı: klasik VOC").count()) > 0;
  const excluded = (await sec.locator("text=/Uranüs.*dahil değildir/").count()) > 0;
  const secText = await sec.innerText();
  const leak = FORBID.filter(f => secText.includes(f));
  console.log(`[${tag} ${w}px] overflowX=${ovX} | durum=${status} | ok→kart=${cards} | tanım=${def} | hariç-etiketi=${excluded} | sızıntı=${leak.length ? leak.join(",") : "yok"}`);
  if (tag === "mobil") await p.screenshot({ path: "scripts/cosmic-validation/voidmoon/.ui-voc-mobil.png" });
  if (tag === "desktop") await sec.screenshot({ path: "scripts/cosmic-validation/voidmoon/.ui-voc-section.png" });
  await ctx.close();
}
await browser.close();
console.log("bitti");
