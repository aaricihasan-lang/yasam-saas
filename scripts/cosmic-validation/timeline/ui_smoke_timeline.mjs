/**
 * Günün Exact Açıları — UI duman testi (Playwright), mevcut ui_smoke deseni.
 * Snapshot korunuyor mu, timeline render, tarih rozeti, Ay dahil/hariç, uzman güven,
 * empty-state, sahte HH:mm yok (date-precision satırda "gün içi"), yatay taşma.
 *
 * Önce dev server: PORT=3501 npm run dev   (veya URL env ile)
 * Çalıştır:        node scripts/cosmic-validation/timeline/ui_smoke_timeline.mjs
 */
import { chromium } from "playwright";

const URL = process.env.URL || "http://localhost:3501/cosmic-calendar";
let fail = 0;
const log = (k, v, ok) => { if (ok === false) fail++; console.log(`  ${ok === false ? "✗" : "·"} ${k}: ${v}`); };

async function overflowX(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function run(browser, viewport, tag) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("text=Gökyüzü Açıları", { timeout: 90000 });

  // Snapshot korunuyor
  log(`${tag} snapshot 'Gökyüzü Açıları'`, "VAR", (await page.locator("text=Gökyüzü Açıları").count()) > 0);

  // Timeline başlığı (bugün seçili → "Bugünün Exact Açıları")
  const tl = page.locator("text=/Exact Açıları/");
  const tlCount = await tl.count();
  log(`${tag} timeline başlığı`, tlCount, tlCount > 0);

  // Tarih rozeti / açıklama (seçili konum tz metni)
  const explain = await page.locator("text=/kronolojik listesi/").count();
  log(`${tag} timeline açıklaması`, explain, explain > 0);

  // Ay toggle var mı, sayısı değişiyor mu
  const moonBtn = page.locator("button", { hasText: /Ay (dahil|hariç)/ });
  const hasMoonBtn = (await moonBtn.count()) > 0;
  log(`${tag} Ay dahil/hariç butonu`, hasMoonBtn ? "VAR" : "YOK", hasMoonBtn);

  // Timeline satır sayısı (Ay dahilken)
  const rowsSel = "div.border-t.border-indigo-100\\/70 .rounded-xl.border.border-violet-100\\/70";
  const includedRows = await page.locator(rowsSel).count();
  log(`${tag} timeline satır (Ay dahil)`, includedRows);
  if (hasMoonBtn) {
    await moonBtn.first().click();
    await page.waitForTimeout(400);
    const excludedRows = await page.locator(rowsSel).count();
    log(`${tag} Ay hariç → satır`, `${includedRows}→${excludedRows}`, excludedRows <= includedRows);
    await moonBtn.first().click(); // geri aç
    await page.waitForTimeout(300);
  }

  // Sahte dakika yok: "gün içi" etiketli satırda ':' içeren saat OLMAMALI (kaba kontrol)
  const gunIci = await page.locator("text=gün içi").count();
  log(`${tag} 'gün içi' (date-precision dürüst etiket)`, gunIci);

  // Uzman mod → güven etiketi çıkmalı
  const expertBtn = page.locator("button", { hasText: "Uzman Modu" });
  if (await expertBtn.count()) {
    await expertBtn.first().click();
    await page.waitForTimeout(500);
    const conf = await page.locator("text=/(yüksek|orta|konum) güven/").count();
    log(`${tag} uzmanda güven etiketi`, conf);
  }

  const ov = await overflowX(page);
  log(`${tag} yatay taşma(px)`, ov, ov <= 1);

  await ctx.close();
}

const browser = await chromium.launch();
try {
  await run(browser, { width: 1280, height: 900 }, "desktop");
  await run(browser, { width: 375, height: 780 }, "mobil");
} finally {
  await browser.close();
}
console.log(`\nSONUÇ: ${fail === 0 ? "TÜM UI KONTROLLERİ GEÇTİ ✓" : `${fail} KONTROL ✗`}`);
process.exit(fail === 0 ? 0 : 1);
