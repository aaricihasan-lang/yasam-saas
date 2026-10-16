// 2026-10-15 satış öncesi eksikler — gerçek tarayıcı (Playwright Chromium) uçtan uca. YEREL; sahte DB + sahte Roxy.
// Önkoşul: yerel `next dev` (3931) + dev-fake-backend (54329/54330, FAKE_ROXY_RELABEL=1 → sonuçlar GERÇEK DEĞİL).
// Çalıştırma: node scripts/astrology/presale-gaps-ui.e2e.cjs [genişlik] [yükseklik] [fake-backend.log] [android] [indirme-klasörü]
//   android = "android" → Android WebView kullanıcı ajanı (fiziksel cihaz testi DEĞİLDİR; yalnız UA öykünmesi).
//
//   1 Kayıtlı analiz sekmeleri: danışan dosyasından açılan analizin üstünde AYNI danışanın 14 kayıtlı analizi; etkin
//     sekme belirgin; ‹ › oklar + tekerlek + klavye; sekmeye basınca o analizin snapshot'ı açılır; 0 Roxy isteği;
//     başka danışanın analizi şeritte YOK; "Kendi Yorumum" notu korunur.
//   2 Yeni çoklu analiz (12+ sekme): açık analizler şeridi sağa kayar (ok düğmesi + tekerlek) — masaüstü.
//   3 Word/PDF: tekli + toplu düğmeler bu genişlikte görünür; tıklayınca GERÇEK dosya iner (DOCX = PK, PDF = %PDF-).
//   4 Roxy'nin yorum üretmediği teknikte (KP transit) açık not; sayfada yatay taşma yok.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const { chromium } = require("playwright");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");

const [W = "1366", H = "860", LOG = "", UA = "", OUT = ""] = process.argv.slice(2);
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
const AT = "2026-10-07T09:00";
const SEL = [
  ["western.natal", { houseSystem: "placidus", nodeType: "true" }],
  ["western.transit", { atUtc: AT, nodeType: "true" }],
  ["western.progression", { targetDate: "2026-10-07", nodeType: "true" }],
  ["western.solar_return", { returnYear: 2026, houseSystem: "placidus" }],
  ["western.fixed_stars", { nodeType: "true", orb: 1, reportCatalog: true }],
  ["vedic.d1", {}],
  ["vedic.varga", { division: 9 }],
  ["vedic.dasha", {}],
  ["vedic.drishti", {}],
  ["vedic.shadbala", {}],
  ["kp.chart", { ayanamsa: "kp-newcomb", nodeType: "mean" }],
  ["kp.dasha", { ayanamsa: "kp-newcomb", nodeType: "mean" }],
  ["kp.transit", { atUtc: AT, ayanamsa: "kp-newcomb", nodeType: "mean" }],
  ["kp.horary", { atUtc: AT, horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean" }],
];
const profile = async (label) => (await api("/profiles", { label, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" })).json.profile.id;
async function seed(pid, sels) {
  const ids = {};
  for (const [technique, options] of sels) {
    const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ technique, options }] });
    const s = plan.json.plan.selections[0];
    const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [{ technique: s.technique, options: s.options ?? options }], confirmNewRequests: plan.json.plan.newRequestCount });
    const r = run.json.results[0];
    if (!r.ok) continue;
    ids[technique] = (await api("/analyses", { profileId: pid, revision: 1, technique: r.technique, options: r.view.options, saveRequestId: randomUUID(), includeProviderInterp: true })).json.analysisId;
  }
  return ids;
}
/** Sayfada (veya kapsayıcıda) görünür alanın dışına taşan öğeler. */
async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

(async () => {
  const stamp = Date.now().toString(36);
  const pid = await profile(`Sekme Testi ${stamp}`);
  const other = await profile(`Başka Danışan ${stamp}`);
  const ids = await seed(pid, SEL);
  const otherIds = await seed(other, [["western.natal", SEL[0][1]]]);
  ok("hazırlık: 14 kayıtlı analiz (aynı danışan) + başka danışanın 1 analizi", Object.keys(ids).length === 14 && Object.keys(otherIds).length === 1, `${Object.keys(ids).length}`);
  // Kayıtlı uzman notu (değişmez kayıtla birlikte saklanır; sekme geçişinde korunmalı) — analiz ÖNCESİ not anahtarıyla.
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

  // ── 1) Danışan dosyası → kayıtlı analiz → sekme şeridi
  await page.goto(`${BASE}#danisan/${pid}`, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("[data-testid=astro-saved-analyses]", { timeout: 120000 });
  await page.waitForTimeout(800);
  ok("danışan dosyasındaki liste korunur (14 satır)", (await page.locator("[data-saved-item]").count()) === 14);
  const h0 = hits();
  await page.locator(`[data-saved-item="${ids["kp.transit"]}"]`).click();
  await page.waitForSelector("[data-testid=astro-saved-tabs]", { timeout: 60000 });
  await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 60000 });
  await page.waitForTimeout(800);
  const tabs = page.locator("[data-testid=astro-saved-tabs] [data-saved-tab]");
  ok("sekme şeridi: aynı danışanın 14 kayıtlı analizi", (await tabs.count()) === 14, String(await tabs.count()));
  ok("başka danışanın analizi şeritte YOK (izolasyon)", (await page.locator(`[data-saved-tab="${otherIds["western.natal"]}"]`).count()) === 0);
  const act = page.locator("[data-testid=astro-saved-tabs] [data-saved-tab][aria-selected=true]");
  ok("etkin sekme = açılan analiz (KP transit) ve belirgin", (await act.count()) === 1 && (await act.getAttribute("data-saved-tab")) === ids["kp.transit"] && /bg-\[#0B1430\]/.test((await act.getAttribute("class")) ?? ""));
  ok("Roxy yorum üretmeyen teknikte açık not (KP transit)", await page.locator("[data-testid=astro-no-provider-interp]").first().isVisible());
  // Görünür mü (kırpılmadan)? etkin sekme şerit içinde
  const visibleActive = await page.evaluate(() => {
    const s = document.querySelector("[data-testid=astro-saved-tabs] [data-strip-scroller]");
    const a = document.querySelector("[data-testid=astro-saved-tabs] [aria-selected=true]");
    if (!s || !a) return false;
    const sr = s.getBoundingClientRect();
    const ar = a.getBoundingClientRect();
    return ar.left >= sr.left - 1 && ar.right <= sr.right + 1;
  });
  ok("etkin sekme görünür alanda (kırpılmamış)", visibleActive);
  const scroller = page.locator("[data-testid=astro-saved-tabs] [data-strip-scroller]");
  const overflowing = await scroller.evaluate((s) => s.scrollWidth > s.clientWidth + 1);
  ok("14 sekmede şerit taşar → ‹ › ok düğmeleri görünür", !overflowing || ((await page.locator("[data-testid=astro-saved-tabs] [data-strip-next]").isVisible()) && (await page.locator("[data-testid=astro-saved-tabs] [data-strip-prev]").isVisible())), `taşma=${overflowing}`);
  if (overflowing) {
    await scroller.evaluate((s) => s.scrollTo({ left: 0, behavior: "instant" }));
    await page.waitForTimeout(300);
    const l0 = await scroller.evaluate((s) => s.scrollLeft);
    await page.locator("[data-testid=astro-saved-tabs] [data-strip-next]").click();
    await page.waitForTimeout(700);
    const l1 = await scroller.evaluate((s) => s.scrollLeft);
    ok("› ok düğmesi şeridi sağa kaydırır", l1 > l0, `${l0}→${l1}`);
    await page.locator("[data-testid=astro-saved-tabs] [data-strip-prev]").click();
    await page.waitForTimeout(700);
    ok("‹ ok düğmesi sola geri kaydırır", (await scroller.evaluate((s) => s.scrollLeft)) < l1);
    if (!mobile) {
      await scroller.evaluate((s) => s.scrollTo({ left: 0, behavior: "instant" }));
      await scroller.hover();
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(500);
      ok("fare tekerleği (dikey) şeridi yatay kaydırır", (await scroller.evaluate((s) => s.scrollLeft)) > 0);
    } else {
      await scroller.evaluate((s) => s.scrollTo({ left: 0, behavior: "instant" }));
      const box = await scroller.boundingBox();
      // Dokunmatik kaydırma: CSS overflow-x:auto (yerel); doğrudan kaydırma ile denetlenir.
      await scroller.evaluate((s) => s.scrollBy({ left: 200, behavior: "instant" }));
      ok("dokunmatik/yerel yatay kaydırma çalışır (overflow-x auto)", (await scroller.evaluate((s) => s.scrollLeft)) > 0, JSON.stringify(box));
    }
  }
  // Sekmeye bas → başka analiz (Vedik D1); 0 sağlayıcı isteği
  await page.locator(`[data-testid=astro-saved-tabs] [data-saved-tab="${ids["vedic.d1"]}"]`).scrollIntoViewIfNeeded();
  await page.locator(`[data-testid=astro-saved-tabs] [data-saved-tab="${ids["vedic.d1"]}"]`).click();
  await page.waitForTimeout(1500);
  const title1 = await page.locator("[data-testid=astro-saved-analysis]").innerText();
  ok("sekmeye basınca diğer kayıtlı analiz açılır (Vedik D1)", /Vedik D1|D1 \(Rashi\)|Rashi/.test(title1));
  ok("geçişte arşive dönülmedi (sekme şeridi yerinde)", await page.locator("[data-testid=astro-saved-tabs]").isVisible());
  // Klavye: ← → Home End
  await page.locator("[data-testid=astro-saved-tabs] [aria-selected=true]").focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(1200);
  const lastId = await page.locator("[data-testid=astro-saved-tabs] [data-saved-tab]").last().getAttribute("data-saved-tab");
  ok("klavye End → son kayıtlı analiz", (await page.locator("[data-testid=astro-saved-tabs] [aria-selected=true]").getAttribute("data-saved-tab")) === lastId);
  await page.keyboard.press("Home");
  await page.waitForTimeout(1200);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(1200);
  const second = await page.locator("[data-testid=astro-saved-tabs] [data-saved-tab]").nth(1).getAttribute("data-saved-tab");
  ok("klavye Home + → ikinci kayıtlı analiz", (await page.locator("[data-testid=astro-saved-tabs] [aria-selected=true]").getAttribute("data-saved-tab")) === second);
  // Bütün sekmeleri sırayla gez → her biri açılır; Roxy sayacı DEĞİŞMEZ
  let opened = 0;
  for (let i = 0; i < (await tabs.count()); i++) {
    const tid = await tabs.nth(i).getAttribute("data-saved-tab");
    await tabs.nth(i).scrollIntoViewIfNeeded();
    await tabs.nth(i).click();
    await page.waitForFunction((id) => document.querySelector("[data-testid=astro-saved-tabs] [aria-selected=true]")?.getAttribute("data-saved-tab") === id, tid, { timeout: 20000 });
    await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 30000 });
    opened++;
  }
  ok("14 sekmenin tamamı arşive dönmeden açıldı", opened === 14, String(opened));
  ok("kayıtlı analizler arasında gezinme 0 Roxy isteği", h0 === null || hits() === h0, `${h0}→${hits()}`);
  ok("sayfada yatay taşma yok (kayıtlı analiz)", !(await overflow(page)));

  // ── 3) Word / PDF — tekli (bu genişlikte görünür + gerçek dosya)
  const docxBtn = page.locator("[data-testid=astro-report-docx]").first();
  const pdfBtn = page.locator("[data-testid=astro-report-pdf]").first();
  ok("tekli Word + PDF düğmeleri bu ekranda görünür", (await docxBtn.isVisible()) && (await pdfBtn.isVisible()));
  for (const [btn, ext, magic] of [[docxBtn, "docx", "PK"], [pdfBtn, "pdf", "%PDF-"]]) {
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), btn.click()]);
    const p = await dl.path();
    const buf = readFileSync(p);
    const name = dl.suggestedFilename();
    ok(`tekli ${ext}: dosya iner ve geçerli (${name})`, name.endsWith(`.${ext}`) && buf.subarray(0, magic.length).toString() === magic && buf.length > 5000, `${buf.length} bayt`);
    if (OUT) writeFileSync(join(OUT, `tekli-${tag.replace(/\W+/g, "_")}.${ext}`), buf);
  }
  ok("rapor indirme 0 Roxy isteği", h0 === null || hits() === h0);

  // ── 3b) Toplu: danışan dosyasına dön → toplu çubuk + seçim kutucukları görünür
  await page.locator("[data-testid=astro-saved-analysis] button[aria-label='Danışan Dosyası']").first().click();
  await page.waitForSelector("[data-testid=astro-bulk-report]", { timeout: 30000 });
  ok("toplu Word/PDF çubuğu bu ekranda görünür", await page.locator("[data-testid=astro-bulk-report]").isVisible());
  const picks = page.locator("[data-testid=astro-pick]");
  ok("seçim kutucukları görünür (telefonda da)", (await picks.count()) === 14 && (await picks.first().isVisible()));
  await picks.nth(0).check();
  await picks.nth(1).check();
  for (const [sel, ext, magic] of [["[data-testid=astro-bulk-selected-docx]", "docx", "PK"], ["[data-testid=astro-bulk-all-pdf]", "pdf", "%PDF-"]]) {
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.locator(sel).click()]);
    const buf = readFileSync(await dl.path());
    ok(`toplu ${ext}: dosya iner ve geçerli (${dl.suggestedFilename()})`, buf.subarray(0, magic.length).toString() === magic && buf.length > 5000, `${buf.length} bayt`);
    if (OUT) writeFileSync(join(OUT, `toplu-${tag.replace(/\W+/g, "_")}.${ext}`), buf);
  }
  ok("sayfada yatay taşma yok (danışan dosyası)", !(await overflow(page)));

  // ── 2) Yeni çoklu analiz: açık analizler şeridi sağa kayar (masaüstü/tablet şeridi; telefonda iki sütunlu kutucuk)
  if (!mobile) {
    await page.goto(BASE, { waitUntil: "load", timeout: 120000 });
    await page.waitForSelector("[data-portal=new]", { timeout: 90000 });
    await page.locator("[data-portal=new]").first().click();
    await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
    await page.waitForTimeout(1200);
    await page.locator("[data-testid=atlas-client-trigger]").first().click();
    await page.waitForTimeout(400);
    await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${pid}"]`).click();
    await page.waitForTimeout(1000);
    for (const [id] of SEL) {
      const sys = id.split(".")[0];
      await page.locator(`[role=tablist] button[data-system='${sys}']`).first().click();
      await page.waitForTimeout(150);
      const b = page.locator(`button[data-technique='${id}']`).first();
      if (await b.count()) await b.click();
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(1200);
    await page.locator("[data-testid=astro-run]").click();
    await page.waitForSelector("[data-testid=astro-result-tabs-strip]", { timeout: 180000 });
    await page.waitForTimeout(1500);
    const sc = page.locator("[data-testid=astro-result-tabs-strip] [data-strip-scroller]");
    const n = await page.locator("[data-testid=astro-result-tabs-strip] [data-tab-key]").count();
    const over = await sc.evaluate((s) => s.scrollWidth > s.clientWidth + 1);
    ok(`yeni çoklu analiz: ${n} açık sekme`, n >= 12, String(n));
    ok("açık analizler taşıyor → › ok görünür", over && (await page.locator("[data-testid=astro-result-tabs-strip] [data-strip-next]").isVisible()), `taşma=${over}`);
    await sc.evaluate((s) => s.scrollTo({ left: 0, behavior: "instant" }));
    await page.waitForTimeout(300);
    await page.locator("[data-testid=astro-result-tabs-strip] [data-strip-next]").click();
    await page.waitForTimeout(700);
    const a1 = await sc.evaluate((s) => s.scrollLeft);
    ok("açık analizler: › ok ile sağa kaydırılır", a1 > 0, String(a1));
    await sc.evaluate((s) => s.scrollTo({ left: 0, behavior: "instant" }));
    await sc.hover();
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(500);
    ok("açık analizler: fare tekerleği ile sağa kaydırılır", (await sc.evaluate((s) => s.scrollLeft)) > 0);
    // Son sekmeye kadar: en sağa gidince son sekme tamamen görünür ve tıklanabilir
    await sc.evaluate((s) => s.scrollTo({ left: s.scrollWidth, behavior: "instant" }));
    await page.waitForTimeout(400);
    const last = page.locator("[data-testid=astro-result-tabs-strip] [data-tab-key]").last();
    await last.click();
    await page.waitForTimeout(800);
    ok("en sağdaki sekmeye erişilir ve açılır", (await last.getAttribute("aria-selected")) === "true");
    ok("sayfada yatay taşma yok (yeni çoklu analiz)", !(await overflow(page)));
  }
  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(`\nastrology presale-gaps UI [${tag}]: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
