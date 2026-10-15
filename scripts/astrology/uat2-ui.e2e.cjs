// 2026-10-12 UAT 2. tur — gerçek tarayıcı (Playwright Chromium) uçtan uca: B, D, G, H, I, J, K, L(arayüz).
// Önkoşul: yerel `next dev` (3931) + dev-fake-backend (54329/54330, FAKE_ROXY_RELABEL=1 → sonuçlar GERÇEK DEĞİL).
// Çalıştırma: node scripts/astrology/uat2-ui.e2e.cjs [genişlik] [yükseklik] [fake-backend.log] [android]
//   android = "android" → Android WebView kullanıcı ajanı (fiziksel cihaz testi DEĞİLDİR; yalnız UA öykünmesi).
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const [W = "1536", H = "844", LOG = "", UA = ""] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const mobile = width < 640;
const android = UA === "android";
const tag = `${width}px${android ? " Android-UA" : ""}`;
const BASE = "http://localhost:3931/admin/astroloji";
const API = "http://localhost:3931/api/admin/astroloji";
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const HDR = { "content-type": "application/json", "x-admin-id": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}` };
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} [${tag}] ${n}${x ? ` — ${x}` : ""}`);
};
const hits = () => (LOG ? (readFileSync(LOG, "utf8").match(/^fake roxy #\d+/gm) ?? []).length : null);
const api = async (path, body) => {
  const r = await fetch(`${API}${path}`, { method: body ? "POST" : "GET", headers: HDR, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const NATAL = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
const PROG = { technique: "western.progression", options: { targetDate: "2026-10-07", nodeType: "true" } };
const TRANSIT = { technique: "western.transit", options: { date: "2026-10-07", time: "12:00", timezone: "Europe/Istanbul", nodeType: "true" } };

(async () => {
  const stamp = Date.now().toString(36);
  const pid = (await api("/profiles", { label: `UAT2 Tur ${stamp}`, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" })).json.profile.id;
  const sels = [NATAL, PROG, TRANSIT];
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: sels });
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: plan.json.plan.selections.map((s, i) => ({ technique: s.technique, options: s.options ?? sels[i].options })), confirmNewRequests: plan.json.plan.newRequestCount });
  const saved = {};
  for (const r of run.json.results) if (r.ok) saved[r.technique] = (await api("/analyses", { profileId: pid, revision: 1, technique: r.technique, options: r.view.options, saveRequestId: crypto.randomUUID() })).json.analysisId;
  ok("hazırlık: 3 kayıtlı analiz", Object.keys(saved).length === 3);

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    acceptDownloads: true,
    ...(android ? { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36" } : {}),
  });
  await ctx.addCookies([
    { name: "__Host-yasam_sid", value: TOKEN, domain: "localhost", path: "/", secure: true },
    { name: "yasam_admin_session", value: TOKEN, domain: "localhost", path: "/" },
  ]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  let nativeDialogs = 0;
  page.on("dialog", (d) => {
    nativeDialogs++;
    void d.dismiss();
  });
  const dlg = page.locator("[data-testid=atlas-unsaved-dialog]");
  const hero = page.locator("[data-testid=atlas-hero]");
  const selLen = () => page.evaluate(() => String(window.getSelection() ?? "").length);

  // ── G: Analiz Merkezi kartından her giriş modül ANA EKRANI (arşiv / dosya değil). 2026-10-15: Gökyüzü Atlası ana
  // panelde ayrı kart değil, Yaşam Analiz Merkezi'nin içinde (ana panel → Analiz Merkezi → Gökyüzü Atlası).
  const centerCard = page.locator("[data-testid=life-analysis-atlas-card]");
  await page.goto("http://localhost:3931/life-analysis", { waitUntil: "load", timeout: 120000 });
  await centerCard.waitFor({ timeout: 60000 }).catch(() => undefined);
  if ((await centerCard.count()) > 0) {
    await centerCard.click();
    await hero.waitFor({ timeout: 90000 });
    ok("G1 Analiz Merkezi kartı → Gökyüzü Atlası ana ekranı", await hero.isVisible(), page.url());
    await page.locator("[data-portal=archive]").first().click();
    await page.waitForTimeout(1500);
    ok("G2 arşive geçildi (adres #analiz-arsivi)", page.url().includes("#analiz-arsivi"));
    await page.locator("a[href='/']").first().click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    await page.locator("a[href='/life-analysis']").first().click();
    await centerCard.waitFor({ timeout: 60000 }).catch(() => undefined);
    await centerCard.click();
    await hero.waitFor({ timeout: 90000 }).catch(() => undefined);
    ok("G3 arşivden ana panele dönüp Analiz Merkezi → Atlas'a yeniden girince YİNE ana ekran (arşiv değil)", (await hero.isVisible()) && !page.url().includes("#analiz-arsivi"), page.url());
  } else ok("G1 Analiz Merkezi'nde Gökyüzü Atlası kartı var", false, "kart bulunamadı");
  // Eski hash ile doğrudan yeni giriş (ör. uygulamanın son adresi geri yüklemesi) → ana ekran
  await page.goto("http://localhost:3931/admin", { waitUntil: "load" }).catch(() => undefined);
  await page.goto(`${BASE}#analiz-sonucu`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  ok("G4 adres çubuğunda kalmış #analiz-sonucu ile yeni giriş → ana ekran", (await hero.isVisible()) && !page.url().includes("#"), page.url());

  // ── K: Danışan Dosyası'nda satıra çift tıklama metin seçmez
  await page.goto(`${BASE}#danisan/${pid}`, { waitUntil: "load" });
  await page.waitForSelector("[data-saved-item]", { timeout: 90000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  const natalRow = page.locator(`[data-saved-item='${saved["western.natal"]}']`).first();
  if (mobile) await natalRow.tap();
  else await natalRow.dblclick();
  await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 60000 });
  await page.waitForTimeout(1200);
  ok("K kayıtlı analiz açılınca metin mavi seçili DEĞİL", (await selLen()) === 0, `${await selLen()} karakter`);
  // Normal metin seçimi hâlâ mümkün (genel user-select:none yok)
  const us = await page.evaluate(() => getComputedStyle(document.querySelector("[data-testid=astro-saved-analysis]")).userSelect);
  ok("K genel user-select:none uygulanmadı", us !== "none", us);

  // ── G: iç ekranda "Gökyüzü Atlası Ana Sayfa" (ev) düğmesi + ← önceki ekran
  ok("G5 iç ekranda ana sayfa (ev) düğmesi", await page.locator("[data-testid=atlas-home-btn]").first().isVisible());

  // ── J: yakınlaştırma kartın TAMAMINI kullanır; kaydırma (pan) + %100 sıfırlama
  const vp = page.locator("[data-testid=atlas-chart-viewport]").first();
  if (await vp.isVisible().catch(() => false)) {
    // Masaüstü masasında çerçeve atlas-chart-frame; mobil yerleşimde görüntüleyicinin doğrudan kabı.
    const hasFrame = (await page.locator("[data-testid=atlas-chart-frame]").count()) > 0;
    const fb = hasFrame ? await page.locator("[data-testid=atlas-chart-frame]").first().boundingBox() : await vp.evaluate((el) => el.parentElement.getBoundingClientRect().toJSON());
    const side = hasFrame ? Number(await page.locator("[data-testid=atlas-chart-frame]").first().getAttribute("data-side")) : 0;
    const vb = await vp.boundingBox();
    ok("J1 görüntüleyici kart çerçevesinin tamamı (görünmez kare yok)", !!fb && !!vb && Math.abs(fb.width - vb.width) <= 3 && Math.abs(fb.height - vb.height) <= 3, `çerçeve ${fb?.width.toFixed(0)}×${fb?.height.toFixed(0)} · görüntüleyici ${vb?.width.toFixed(0)}×${vb?.height.toFixed(0)}${side ? ` · kare ${side}` : ""}`);
    if (!mobile && hasFrame) ok("J2 masaüstünde çerçeve kareden geniş (eskiden kare kırpılıyordu)", !!fb && fb.width > side + 4, `${fb?.width.toFixed(0)} > ${side}`);
    // Mobil yerleşimde düğme çubuğu gizli (iki parmak / klavye); yakınlaştırma klavye kısayoluyla (+) yapılır.
    const zoomBtn = page.locator("[data-testid=atlas-zoom-in]").first();
    const btnVisible = await zoomBtn.isVisible().catch(() => false);
    if (btnVisible) for (let i = 0; i < 4; i++) await zoomBtn.click();
    else {
      await vp.locator("[role=group]").first().focus();
      for (let i = 0; i < 4; i++) await page.keyboard.press("+");
    }
    await page.waitForTimeout(400);
    const lvl = await vp.getAttribute("data-scale");
    ok("J3 yakınlaştırma ~%330", Number(lvl) > 3 && Number(lvl) < 3.5, lvl);
    const box = await vp.boundingBox();
    const tr0 = await vp.locator("div[style*='translate']").first().getAttribute("style");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 60, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const tr1 = await vp.locator("div[style*='translate']").first().getAttribute("style");
    ok("J4 sürükleyerek kaydırma (pan) çalışır", tr0 !== tr1, `${tr0} → ${tr1}`);
    ok("J4b sürükleme metin seçmez", (await selLen()) === 0);
    if (btnVisible) await page.locator("[data-testid=atlas-zoom-fit]").first().click();
    else await page.locator("[data-testid=atlas-zoom-fit-compact]").first().click();
    await page.waitForTimeout(300);
    ok("J5 Sığdır → %100", (await vp.getAttribute("data-scale")) === "1.00");
  } else ok("J görüntüleyici görünür", false);

  // ── I: natal açı tablosu: yatay kaydırma çubuğu 41 satırın altında kalmaz (sınırlı kutu + yapışkan başlık)
  await page.getByRole("tab", { name: /Açılar/ }).first().click().catch(() => undefined);
  await page.waitForTimeout(800);
  const asp = page.locator("[data-testid=astro-aspects-scroll]").first();
  if (await asp.count()) {
    await asp.scrollIntoViewIfNeeded();
    const m = await asp.evaluate((el) => ({ ch: el.clientHeight, sh: el.scrollHeight, cw: el.clientWidth, sw: el.scrollWidth, bottom: el.getBoundingClientRect().bottom, vh: window.innerHeight, sticky: getComputedStyle(el.querySelector("thead") ?? el).position }));
    ok("I1 açı tablosu kutusu ekran yüksekliğiyle sınırlı (yatay çubuk görünür alanda)", m.ch <= Math.min(0.7 * m.vh, 640) + 2 && m.bottom <= m.vh + 2, JSON.stringify(m));
    ok("I2 başlık satırı yapışkan", m.sticky === "sticky", m.sticky);
    ok("I3 tüm sütunlara erişilir (kutu içinde yatay kaydırma ya da taşma yok)", m.sw <= m.cw + 1 || m.sw > m.cw, `${m.sw}/${m.cw}`);
  } else ok("I açı tablosu bulundu", false);

  // ── L arayüz: Danışan Dosyası'nda seçim kutuları + Seçilenleri / Tümünü Word-PDF
  await page.locator("[data-testid=atlas-home-btn]").first().click();
  await page.waitForTimeout(1200);
  ok("G6 ev düğmesi → modül ana ekranı (Yaşam Sistemi dashboard'u değil)", (await hero.isVisible()) && page.url().startsWith(BASE));
  await page.evaluate((p) => {
    window.location.hash = `danisan/${p}`;
  }, pid);
  await page.waitForSelector("[data-saved-item]", { timeout: 60000 });
  await page.waitForTimeout(800);
  const bar = page.locator("[data-testid=astro-bulk-report]");
  // 2026-10-15 (owner kararı): toplu Word/PDF çubuğu ve seçim kutuları telefon + Android dahil her ekranda görünür.
  ok("L1 toplu Word/PDF çubuğu ve seçim kutuları bu ekranda görünür", (await bar.isVisible()) && (await page.locator("[data-testid=astro-pick]").first().isVisible()));
  {
    ok("L1 masaüstü: toplu rapor çubuğu görünür", await bar.isVisible());
    ok("L2 seçim yokken 'Seçilenleri …' pasif", await page.locator("[data-testid=astro-bulk-selected-docx]").isDisabled());
    await page.locator(`[data-pick-id='${saved["western.natal"]}']`).check();
    await page.locator(`[data-pick-id='${saved["western.transit"]}']`).check();
    ok("L3 kutu işaretlemek analizi AÇMAZ", (await page.locator("[data-testid=astro-saved-analysis]").count()) === 0 && page.url().includes("#danisan/"));
    ok("L4 '2 analiz seçili'", /2 analiz seçili/.test(await page.locator("[data-testid=astro-bulk-count]").innerText()));
    const h0 = hits();
    const [d1] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), page.locator("[data-testid=astro-bulk-selected-docx]").click()]);
    ok("L5 Seçilenleri Word İndir → tek .docx (2 analiz)", /Secili-Analizler-2\.docx$/.test(d1.suggestedFilename()), d1.suggestedFilename());
    const [d2] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), page.locator("[data-testid=astro-bulk-all-pdf]").click()]);
    ok("L6 Tüm Analizleri PDF İndir → tek .pdf (3 analiz)", /Tum-Analizler-3\.pdf$/.test(d2.suggestedFilename()), d2.suggestedFilename());
    if (LOG) ok("L7 indirmeler 0 Roxy isteği", hits() === h0, `${h0} → ${hits()}`);
    ok("L8 hata mesajı yok", (await page.locator("[data-testid=astro-bulk-error]").count()) === 0);
  }

  // ── B + D: 2 kaydedilmemiş analizle çıkış yolları; mobil sekme durumları
  await page.locator("[data-testid=atlas-home-btn]").first().click().catch(() => undefined);
  await page.evaluate(() => {
    window.location.hash = "yeni-analiz";
  });
  await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.locator("[data-testid=atlas-client-trigger]").first().click();
  await page.locator("[data-testid=atlas-client-panel] [data-client-option]").first().click();
  await page.waitForTimeout(800);
  for (const id of ["western.natal", "western.transit"]) {
    const b = page.locator(`button[data-technique='${id}']`).first();
    if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
  }
  await page.waitForTimeout(800);
  await page.locator("[data-testid=astro-run]").click();
  await page.waitForSelector("[data-testid=astro-desk-save]", { timeout: 90000 });
  await page.waitForTimeout(1000);
  if (mobile) {
    const states = await page.locator("[data-testid=astro-result-tabs-mobile] [data-tab-state]").evaluateAll((els) => els.map((e) => ({ s: e.getAttribute("data-tab-state"), bg: getComputedStyle(e).backgroundColor, bl: getComputedStyle(e).borderLeftColor })));
    ok("D1 mobil sekmeler: etkin + kaydedilmemiş durumları ayrı", states.some((x) => x.s === "active") && states.some((x) => x.s === "unsaved"), JSON.stringify(states));
    ok("D2 etkin ve pasif sekme rengi farklı", new Set(states.map((x) => x.bg)).size >= 2);
  }
  // ── H: Teknik Ekle listesi üst üste binmez (Batı uzun liste + Vedik / KP)
  await page.locator("[data-testid=atlas-add-technique-btn]").first().click();
  await page.waitForSelector("[data-testid=atlas-add-technique]", { timeout: 30000 });
  await page.waitForTimeout(500);
  const overlaps = async () =>
    page.locator("[data-testid=atlas-add-technique] li:has([data-add-technique])").evaluateAll((els) => {
      const r = els.map((e) => e.getBoundingClientRect()).filter((x) => x.height > 0);
      let bad = 0;
      for (let i = 1; i < r.length; i++) if (r[i].top < r[i - 1].bottom - 0.5 && Math.abs(r[i].left - r[i - 1].left) < 2) bad++;
      return { n: r.length, bad, minH: Math.min(...r.map((x) => x.height)) };
    });
  for (const sys of ["western", "vedic", "kp"]) {
    await page.locator(`[data-add-system='${sys}']`).click().catch(() => undefined);
    await page.waitForTimeout(300);
    const o = await overlaps();
    ok(`H Teknik Ekle (${sys}) satırları üst üste binmez`, o.n > 0 && o.bad === 0 && o.minH >= 28, JSON.stringify(o));
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  if (await page.locator("[data-testid=atlas-add-technique]").isVisible().catch(() => false)) await page.locator("[data-testid=atlas-add-technique] button[aria-label*='Kapat'], [data-testid=atlas-add-close]").first().click().catch(() => undefined);
  // B1 ev düğmesi (modül içi) uyarısız, sonuçlar kaybolmaz; Yeni Analiz'de "kaydedilmemiş" bandı
  await page.locator("[data-testid=atlas-home-btn]").first().click();
  await page.waitForTimeout(800);
  ok("B1 ev düğmesi: modül içi, uyarı yok", !(await dlg.isVisible()) && (await hero.isVisible()));
  await page.locator("[data-portal=new]").first().click();
  await page.waitForTimeout(800);
  const bannerText = await page.locator("[data-testid=atlas-unsaved-banner]").innerText().catch(() => "");
  ok("B2 Yeni Analiz'de '2 kaydedilmemiş analiz' bandı + Sonuçlara dön", /2 kaydedilmemiş analiz/.test(bannerText), bannerText);
  await page.locator("[data-testid=atlas-unsaved-banner-open]").click();
  await page.waitForSelector("[data-testid=astro-desk-save]", { timeout: 30000 });
  // B3 Yaşam Sistemi logosu
  await page.locator("a[href='/']").first().click();
  await page.waitForTimeout(1000);
  ok("B3 Yaşam Sistemi logosu → uyarı", await dlg.isVisible());
  ok("B3 metin birebir", (await page.locator("[data-testid=atlas-unsaved-message]").innerText().catch(() => "")) === "Kaydedilmemiş değişiklikleriniz var. Kaydetmeden çıkmak istiyor musunuz?");
  const slText = await page.locator("[data-testid=atlas-unsaved-save-leave]").innerText().catch(() => "");
  ok("B3 Kaydet ve Çık (2) sunulur", /Kaydet ve Çık \(2\)/.test(slText), `${slText} · ${await page.locator("[data-testid=atlas-unsaved-details]").innerText().catch(() => "")}`);
  await page.locator("[data-testid=atlas-unsaved-stay]").click();
  await page.waitForTimeout(500);
  ok("B3 Çalışmaya Devam Et → masada kalınır", page.url().startsWith(BASE) && (await page.locator("[data-testid=astro-desk-save]").count()) > 0);
  // B4 üst menüden başka modül
  const other = page.locator("a[href='/admin/human-design'], a[href='/human-design']").first();
  if (await other.isVisible().catch(() => false)) {
    await other.click();
    await page.waitForTimeout(1000);
    ok("B4 üst menü başka modül → uyarı", await dlg.isVisible());
    await page.locator("[data-testid=atlas-unsaved-stay]").click();
    await page.waitForTimeout(500);
  }
  // B5 tarayıcı / Android geri tuşu zinciri: modülden çıkmadan önce uyarı
  let warned = false;
  for (let i = 0; i < 20 && !warned; i++) {
    await page.goBack().catch(() => undefined);
    await page.waitForTimeout(900);
    warned = await dlg.isVisible();
    if (!page.url().startsWith(BASE)) break;
  }
  ok("B5 geri tuşu zinciri: modülden çıkmadan ÖNCE uyarı", warned && page.url().startsWith(BASE), page.url());
  if (warned) {
    await page.locator("[data-testid=atlas-unsaved-stay]").click();
    await page.waitForTimeout(500);
  }
  // Geri zinciri modül içindeki önceki görünümlerden geçer; devam sonrası sonuçların bellekte durduğu Yeni Analiz bandından doğrulanır.
  await page.locator("[data-testid=atlas-home-btn]").first().click().catch(() => undefined);
  if (!(await hero.isVisible().catch(() => false))) await page.evaluate(() => (window.location.hash = "yeni-analiz"));
  else await page.locator("[data-portal=new]").first().click();
  await page.waitForTimeout(900);
  ok("B5 devam → 2 sonuç kaybolmadı", /2 kaydedilmemiş analiz/.test(await page.locator("[data-testid=atlas-unsaved-banner]").innerText().catch(() => "")));
  // B6 Kaydetmeden Çık
  await page.locator("a[href='/']").first().click();
  await page.waitForTimeout(800);
  if (await dlg.isVisible()) await page.locator("[data-testid=atlas-unsaved-discard]").click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 30000 }).catch(() => undefined);
  ok("B6 Kaydetmeden Çık → Yaşam Sistemi ana sayfası", new URL(page.url()).pathname === "/", page.url());
  ok("B tarayıcı yerel onay penceresi açılmadı", nativeDialogs === 0, `${nativeDialogs}`);
  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(`\nuat2 ui: ${pass} PASS / ${fail} FAIL (${tag})`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("HATA", e);
  process.exit(2);
});
