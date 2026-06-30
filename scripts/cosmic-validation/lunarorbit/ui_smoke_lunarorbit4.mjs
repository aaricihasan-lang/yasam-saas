/**
 * FAZ 3C / Adim 4 — Ay Yorungesi uzman modu UI testi (Playwright).
 * Toggle · filtreler · detay paneli · responsive · normal-mod sizinti.
 */
import { chromium } from "playwright";
const URL = "http://localhost:3661/cosmic-calendar";
const NORMAL_FORBID = ["harness-verified", "validationStatus", "Doğrulama", "Kaynak:", "apsis-", "syzygy-"];
const ov = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const browser = await chromium.launch();

async function run(w, h, tag) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForSelector("text=Ay Yörüngesi");
  const sec = p.locator("section").filter({ hasText: "Ay Yörüngesi" }).first();
  const ovN = await ov(p);
  const normalLeak = NORMAL_FORBID.filter(f => (sec.innerText ? false : false)); // placeholder
  const ntext = await sec.innerText();
  const nLeak = NORMAL_FORBID.filter(f => ntext.includes(f));
  // uzman moda gec
  await sec.locator("button", { hasText: "Uzman Modu" }).first().click();
  await p.waitForTimeout(500);
  const kapsamPanel = (await sec.locator("text=/Topocentric: varsayılan değil/").count()) > 0;
  const filtreBar = (await sec.locator("button", { hasText: "Supermoon" }).count()) > 0;
  const cardsAll = await sec.locator('[role="button"]').filter({ hasText: "Detay →" }).count();
  // filtre: Perigee
  await sec.locator("button", { hasText: "Perigee" }).first().click();
  await p.waitForTimeout(300);
  const afterPerigee = await sec.locator('[role="button"]').filter({ hasText: "Detay →" }).count();
  const onlyPerigee = (await sec.locator("text=/Apogee \\(en uzak/").count()) === 0;
  // filtre: Supermoon
  await sec.locator("button", { hasText: "Temizle" }).first().click(); await p.waitForTimeout(200);
  await sec.locator("button", { hasText: "Supermoon" }).first().click(); await p.waitForTimeout(300);
  const afterSuper = await sec.locator('[role="button"]').filter({ hasText: "Detay →" }).count();
  await sec.locator("button", { hasText: "Temizle" }).first().click(); await p.waitForTimeout(200);
  const ovE = await ov(p);
  // detay ac
  await sec.locator('[role="button"]').filter({ hasText: "Detay →" }).first().click(); await p.waitForTimeout(400);
  const dlg = p.locator('[role="dialog"]');
  const detail = await dlg.count();
  const dtxt = detail ? await dlg.innerText() : "";
  const hasTech = ["Doğrulama", "Mesafe (AU)", "dakika düzeyi"].filter(f => dtxt.includes(f)).length;
  const ovD = await ov(p);
  await dlg.locator('button[aria-label="Kapat"]').click(); await p.waitForTimeout(200);
  const closed = (await p.locator('[role="dialog"]').count()) === 0;

  console.log(`[${tag} ${w}px] ovN=${ovN} ovE=${ovE} ovD=${ovD} | normalSızıntı=${nLeak.length ? nLeak.join(",") : "yok"} | kapsam=${kapsamPanel} filtre=${filtreBar} | Perigee(yalnız=${onlyPerigee}) ${cardsAll}→${afterPerigee} | Super→${afterSuper} | detay=${detail > 0} teknik=${hasTech} kapandı=${closed}`);
  await ctx.close();
}
await run(390, 844, "mobil");
await run(768, 1024, "tablet");
await run(1280, 900, "desktop");
await run(1920, 1080, "large");
await browser.close();
console.log("bitti");
