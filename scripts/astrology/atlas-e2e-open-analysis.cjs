// Gökyüzü Atlası e2e ortak yardımcısı (2026-11-05, V3 analiz seçicisi).
// Masadaki AÇIK (bu oturumda hesaplanmış) bir analize geçer:
//   • V3 seçici varsa (varsayılan): başlıktaki seçiciyi açar, kayıtlı liste yüklenmesini bekler, tekniği verilen öneke uyan masa
//     satırını (data-picker-kind=bench) seçer;
//   • seçici yoksa (NEXT_PUBLIC_ATLAS_ANALYSIS_PICKER=off → eski şeritler): önceki betiklerdeki şerit / mobil kutucuk davranışı aynen.
// Her iki yolda da seçilen sekme yoksa Playwright hata verir (sessiz PASS yok).
async function openBenchAnalysis(page, techniquePrefix, mobile) {
  const trigger = page.locator("[data-testid=atlas-picker-trigger]:visible").first();
  if ((await trigger.count()) > 0) {
    if ((await page.locator("[data-testid=atlas-picker-panel]").count()) === 0) await trigger.click();
    await page.locator("[data-testid=atlas-picker-panel]").first().waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(() => !document.querySelector("[data-testid=atlas-picker-panel][data-loading]"), null, { timeout: 30000 });
    // Masada açık sonuç: kaydedilmemişse "bench" satırı, kaydedildiyse masa bilgisini taşıyan TEK kayıtlı satır (data-picker-open).
    const opt = page.locator(`[data-testid=atlas-picker-panel] [role=option][data-picker-open][data-picker-technique^='${techniquePrefix}']`).first();
    await opt.scrollIntoViewIfNeeded();
    await opt.click();
    await page.waitForTimeout(900);
    return "picker";
  }
  const tabSel = mobile ? `[data-testid=astro-result-tabs-mobile] [data-tab-key-m^='${techniquePrefix}']` : `[data-tab-key^='${techniquePrefix}']`;
  if (mobile && !(await page.locator(tabSel).first().isVisible()) && (await page.locator("[data-testid=astro-result-tabs-more]").isVisible())) await page.locator("[data-testid=astro-result-tabs-more]").click();
  await page.locator(tabSel).first().click();
  await page.waitForTimeout(900);
  return "strip";
}

// Telefonda (V3) başlık işlemleri "⋯" menüsünde — kapalıysa açar (masaüstünde / eski düzende hiçbir şey yapmaz).
async function revealHeaderActions(page) {
  const t = page.locator("[data-testid=atlas-desk-menu-toggle]:visible").first();
  if ((await t.count()) > 0 && (await t.getAttribute("aria-expanded")) !== "true") {
    await t.click();
    await page.waitForTimeout(250);
  }
}

// V3: kaydedilmiş + açık sonuç seçicide tek KAYITLI satırdır; seçilince değişmez kayıt açılır (eski "Kayıtlı analizi aç").
// Dönüş: "opened" (kayıt açıldı) · "active" (bu satır zaten masadaki ETKİN sonuç — yeniden seçmek bir şey yapmaz; çağıran
// başlıktaki "Kayıtlı analizi aç" düğmesini kullanır) · false (seçici yok → eski yol).
async function openSavedViaPicker(page, techniquePrefix) {
  const trigger = page.locator("[data-testid=atlas-picker-trigger]:visible").first();
  if ((await trigger.count()) === 0) return false;
  if ((await page.locator("[data-testid=atlas-picker-panel]").count()) === 0) await trigger.click();
  await page.locator("[data-testid=atlas-picker-panel]").first().waitFor({ state: "visible", timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector("[data-testid=atlas-picker-panel][data-loading]"), null, { timeout: 30000 });
  // aynı teknikte en yeni kayıt önce (model sırası)
  const opt = page.locator(`[data-testid=atlas-picker-panel] [role=option][data-picker-kind=saved][data-picker-technique^='${techniquePrefix}']`).first();
  await opt.scrollIntoViewIfNeeded();
  if ((await opt.getAttribute("aria-selected")) === "true") {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    return "active";
  }
  await opt.click();
  await page.waitForTimeout(1200);
  // Masa kipinde masada açık kayıtlı satır → masa sekmesine geçilir (eski şerit davranışı); değişmez kayıt için çağıran
  // başlıktaki "Kayıtlı analizi aç" düğmesini kullanır.
  if ((await page.locator("[data-testid=astro-saved-analysis]").count()) === 0) return "active";
  return "opened";
}

// main #710 (05.11.2026): uzman yüzeyinde (/astroloji) her girişte "Gökyüzü Atlası — Bilgilendirme" penceresi açılır ve
// "Tamam"a basılana kadar tıklamaları keser. Eski betikler bunu bilmiyordu → Playwright yer belirleyici işleyicisi pencere
// görünürse "Tamam"a basar (yalnız bilgilendirme; veri / istek yok).
async function dismissAtlasDevNotice(page) {
  await page.addLocatorHandler(page.locator('[data-testid="atlas-development-notice"]'), async () => {
    await page.locator('[data-testid="atlas-development-notice-ok"]').click();
  });
}

module.exports = { openBenchAnalysis, revealHeaderActions, openSavedViaPicker, dismissAtlasDevNotice };
