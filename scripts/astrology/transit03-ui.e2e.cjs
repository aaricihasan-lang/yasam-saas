// TRANSİT-03 (2026-10-17) — KP Transit zaman aralığı ekran testi (Playwright Chromium). YEREL; sahte DB + sahte Roxy.
// Veri: 92 gün Ay Sub-Lord bölümü GERÇEK golden'dır (kp-sublord-moon-92d; düzeltme işareti dahil). Arayüz akışındaki 30 günlük
// Ay+Güneş ve 3 günlük kayıt/rapor gövdelerinin golden'ı yok → sahte arka uç FAKE_ROXY_KP_SYNTH=1 ile SENTETİK yanıt verir
// (bağımsız astronomi; gerçek sağlayıcı sonucu DEĞİLDİR). O bölümler arayüz/akış/sınır davranışını doğrular.
// Çalıştırma: node scripts/astrology/transit03-ui.e2e.cjs <genişlik> <yükseklik> <fake-backend.log> [android] [port]
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");

const [W = "1366", H = "860", LOG = "", UA = "", PORT = "3941"] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const mobile = width < 640;
const android = UA === "android";
const tag = `${width}px${android ? " Android-UA" : ""}`;
const ORIGIN = `http://localhost:${PORT}`;
const BASE = `${ORIGIN}/admin/astroloji`;
const API = `${ORIGIN}/api/admin/astroloji`;
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const HDR = { "content-type": "application/json", "x-admin-id": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}`, origin: ORIGIN };
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
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch {
    /* ikili */
  }
  return { status: r.status, json, buf };
};

(async () => {
  const prof = await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`);
  const pid = prof.json?.profiles?.[0]?.id;
  ok("hazırlık: profil", typeof pid === "string");
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
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
  page.on("dialog", (d) => void d.dismiss());

  await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("[data-portal=new]", { timeout: 120000 });
  await page.locator("[data-portal=new]").first().click();
  await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.locator("[data-testid=atlas-client-trigger]").first().click();
  await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill("Ali Örnek");
  await page.waitForTimeout(900);
  await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${pid}"]`).click();
  await page.waitForTimeout(1200);
  await page.locator("[data-system=kp]").first().click();
  await page.waitForTimeout(400);
  await page.locator("button[data-technique='kp.transit']").first().click();
  await page.locator("[data-technique-focus='kp.transit']").first().click();
  await page.waitForTimeout(400);
  const settings = page.locator("[data-testid=atlas-technique-settings]").first();
  ok("KP transit: iki kip (Tek an / Zaman aralığı)", (await settings.locator("[data-kp-mode]").count()) === 2);
  await settings.locator("[data-kp-mode=range]").check();
  await page.waitForTimeout(300);
  const range = settings.locator("[data-testid=astro-kp-range]");
  // TRANSİT-01 dersi (#428): tarih alanı .fill() ile değil KLAVYEYLE rakam rakam da yazılır; ara değerler ("0002-10-07")
  // çökme üretmez, alanda uyarı + Başlat kapalı, plan isteğine geçersiz başlangıç GİTMEZ.
  const badPlan = [];
  page.on("request", (r) => {
    if (!r.url().includes("/engine/plan") || r.method() !== "POST") return;
    for (const s of JSON.parse(r.postData() || "{}").selections ?? []) {
      const d = s.options?.range?.startDate;
      if (typeof d === "string" && !/^(1[6-9]|2[0-5])\d\d-\d\d-\d\d$|^2600-/.test(d)) badPlan.push(d);
    }
  });
  const startIn = range.locator('input[aria-label="KP aralık başlangıcı"]');
  await startIn.fill("");
  await page.waitForTimeout(400);
  ok("boş başlangıç: alanda uyarı + Başlat kapalı", (await range.locator("[data-testid=astro-kp-range-date-issue]").isVisible()) && (await page.locator("[data-testid=astro-run]").isDisabled()));
  await startIn.click({ position: { x: 10, y: 10 } });
  await page.keyboard.type("0710", { delay: 60 });
  let typedOk = true;
  for (const [i, k] of ["2", "0", "2", "6"].entries()) {
    await page.keyboard.type(k, { delay: 60 });
    await page.waitForTimeout(450);
    if (i < 3) {
      const warn = await range.locator("[data-testid=astro-kp-range-date-issue]").isVisible();
      const dis = await page.locator("[data-testid=astro-run]").isDisabled();
      if (!warn || !dis) {
        typedOk = false;
        console.log(`   ara değer ${await startIn.inputValue()}: uyarı=${warn} başlat-kapalı=${dis}`);
      }
    }
  }
  await page.waitForTimeout(800);
  ok("başlangıç yılı rakam rakam: çökme yok; ara değerlerde uyarı + Başlat kapalı", typedOk && errors.length === 0, errors[0] ?? "");
  ok("tamamlanınca 2026-10-07, uyarı kalkar", (await startIn.inputValue()) === "2026-10-07" && !(await range.locator("[data-testid=astro-kp-range-date-issue]").count()), await startIn.inputValue());
  ok("plan isteklerine geçersiz başlangıç gitmedi", badPlan.length === 0, badPlan.slice(0, 3).join(", "));
  await startIn.fill("2026-10-07");
  await range.locator('select[aria-label="KP aralık süresi"]').selectOption("30");
  await range.locator("[data-kp-kind=positions]").check();
  await page.waitForTimeout(300);
  ok("konum tablosu >7 gün → açık uyarı", /en çok 7 gün/.test(await range.locator("[data-testid=astro-kp-range-note]").innerText()));
  await range.locator("[data-kp-kind=positions]").uncheck();
  await page.waitForTimeout(300);
  const note = await range.locator("[data-testid=astro-kp-range-note]").innerText();
  ok("istek ön izlemesi: 2 gezegen × 2 tür = 4", /Tahmini 4 sağlayıcı isteği/.test(note), note.slice(0, 80));
  await page.waitForTimeout(1500);
  const h0 = hits();
  await page.locator("[data-testid=astro-run]").click();
  await page.waitForSelector("[data-testid=astro-desk-save]", { timeout: 120000 });
  await page.waitForTimeout(1500);
  if (LOG) ok("çalıştırma ≤ 4 sağlayıcı isteği (önizlemeyle tutarlı)", hits() - h0 <= 4, String(hits() - h0));
  await page.waitForSelector("[data-testid=astro-kp-timing-panel]", { timeout: 30000 });
  ok("Sub-Lord + Rasi bölümleri", (await page.locator("[data-testid=astro-kp-sublord]").count()) === 1 && (await page.locator("[data-testid=astro-kp-rasi]").count()) === 1);
  const head = (await page.locator("[data-testid=astro-kp-timing-panel]").textContent()) ?? "";
  ok("başlık: aralık (UTC günleri) + KP-Newcomb + Batı açıları yok notu", /07\.10\.2026 – 05\.11\.2026/.test(head) && /KP-Newcomb/.test(head) && /Batı açıları/.test(head), head.slice(0, 140));
  ok("30 gün Ay: >100 Sub-Lord satırı → sayfalama ('daha göster')", await page.locator("[data-testid=astro-kp-sublord] [data-testid=astro-kp-more]").isVisible());
  await page.locator("[data-testid=astro-kp-sublord] [data-testid=astro-kp-more]").click();
  await page.waitForTimeout(300);
  const firstTime = async () => ((await page.locator("[data-testid=astro-kp-sublord] li, [data-testid=astro-kp-sublord] tbody tr").first().textContent()) ?? "").trim();
  const t1 = await firstTime();
  await page.locator('select[aria-label="KP aralık gösterim saat dilimi (sonuç)"]').selectOption("UTC");
  await page.waitForTimeout(300);
  const t2 = await firstTime();
  ok("gösterim saat dilimi değişince saatler değişir (GMT+3 → UTC)", t1 !== t2 && /GMT\+3/.test(t1) && /UTC/.test(t2), `${t1.slice(0, 40)} | ${t2.slice(0, 40)}`);
  await page.locator('select[aria-label="KP aralık gezegen filtresi"]').selectOption("sun");
  await page.waitForTimeout(300);
  const sunCount = await page.locator("[data-testid=astro-kp-sublord] h4").innerText();
  ok("gezegen filtresi (Güneş) satırları daraltır", /\((\d+)\)/.test(sunCount) && Number(/\((\d+)\)/.exec(sunCount)[1]) < 100, sunCount);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok("sayfada yatay taşma yok", !over);

  // Kayıt + rapor (API): 3 günlük aralık + konum tablosu
  const opts = { range: { startDate: "2026-10-07", days: 3, planets: ["sun", "moon"], kinds: ["sublord", "rasi", "positions"], intervalMinutes: 360 }, ayanamsa: "kp-newcomb", nodeType: "mean", displayTz: "Europe/Istanbul" };
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ technique: "kp.transit", options: opts }] });
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [{ technique: "kp.transit", options: plan.json.plan.selections[0].options }], confirmNewRequests: plan.json.plan.newRequestCount });
  ok("API çalıştırma tamam (eksik parça yok)", run.status === 200 && run.json.results[0].ok && run.json.results[0].view.technical.missing.length === 0, String(run.status));
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: "kp.transit", options: run.json.results[0].view.options, saveRequestId: randomUUID() });
  ok("KP zaman aralığı analizi kaydedildi", sv.status === 201, String(sv.status));
  if (sv.json?.analysisId) {
    const d = await api(`/analyses/${sv.json.analysisId}/report?format=docx`);
    const p = await api(`/analyses/${sv.json.analysisId}/report?format=pdf`);
    ok("Word (PK) + PDF (%PDF-) indirilir", d.status === 200 && d.buf.slice(0, 2).toString() === "PK" && p.status === 200 && p.buf.slice(0, 5).toString() === "%PDF-");
  }
  // GERÇEK 92 gün Ay sub-lord (golden; sahte arka uç birebir gövdeyle gerçek yanıtı verir): düzeltilen satır işareti görünür.
  const real = { range: { startDate: "2026-10-01", days: 92, planets: ["moon"], kinds: ["sublord"] }, ayanamsa: "kp-newcomb", nodeType: "mean", displayTz: "Europe/Istanbul" };
  const rp = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ technique: "kp.transit", options: real }] });
  const rr = await api("/engine/run", { profileId: pid, revision: 1, selections: [{ technique: "kp.transit", options: rp.json.plan.selections[0].options }], confirmNewRequests: rp.json.plan.newRequestCount });
  const rok = rr.status === 200 && rr.json.results[0].ok;
  ok("gerçek 92 gün Ay sub-lord yanıtı işlendi (824 geçiş)", rok && rr.json.results[0].view.technical.sublord[0].changes.length === 824, String(rr.status));
  if (rok) {
    const rs = await api("/analyses", { profileId: pid, revision: 1, technique: "kp.transit", options: rr.json.results[0].view.options, saveRequestId: randomUUID() });
    await page.goto(`${BASE}#danisan/${pid}`, { waitUntil: "load", timeout: 180000 });
    await page.waitForSelector(`[data-saved-item="${rs.json.analysisId}"]`, { timeout: 120000 });
    await page.locator(`[data-saved-item="${rs.json.analysisId}"]`).click();
    await page.waitForSelector("[data-testid=astro-kp-timing-panel]", { timeout: 60000 });
    await page.waitForTimeout(600);
    ok("kayıtlı analizde düzeltme açıklaması görünür", await page.locator("[data-testid=astro-kp-corrected-note]").isVisible());
    if (!mobile) ok("düzeltilen satırda '* sağlayıcı verisi düzeltildi' işareti", (await page.locator("[data-kp-corrected]").count()) >= 1);
    else ok("mobil kartta '*' işareti", /→ KP \d+ \([^)]*\) \*/.test((await page.locator("[data-testid=astro-kp-sublord] li").allInnerTexts()).join("\n")));
  }
  ok("konsol hatası yok", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(`\ntransit03-ui [${tag}]: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
