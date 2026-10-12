// Transit / Sinastri çift halkası — UYGULAMA İÇİ yerel uçtan uca (Playwright; sahte DB + sahte Roxy; GERÇEK Roxy YOK).
// Önkoşul: next dev 3931 + dev-fake-backend (FAKE_ROXY_RELABEL=1). Kullanım: node wheels-ui.e2e.cjs [genişlik] [yükseklik] [fake.log]
//   U1 sonuç masası: natal + transit hesaplanınca transit sekmesinde Roxy çift halka çizilir; künye Türkçe
//   U2 transit, natali olmayan doğum verisinde: harita ÇİZİLMEZ, açık neden gösterilir, ek istek yok
//   U3 kayıtlı transit + sinastri (arşivden): harita 0 Roxy isteğiyle aynı verilerle çizilir; sinastride ev çizgisi yok
//   U4 masa / kayıtlı görünümde harita verisi aynı; mobilde taşma yok; yakınlaştırma (Odak modu) açılır
//   U5 diğer haritalar bozulmadı: natal çark çizilir
const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const [W = "390", H = "844", LOG = ""] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const mobile = width < 640;
const BASE = "http://localhost:3931/admin/astroloji";
const API = "http://localhost:3931/api/admin/astroloji";
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const HDR = { "content-type": "application/json", "x-admin-id": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}` };
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} [${width}px] ${n}${x ? ` — ${x}` : ""}`);
};
const hits = () => (LOG ? (readFileSync(LOG, "utf8").match(/^fake roxy #\d+/gm) ?? []).length : null);
const natalHits = () => (LOG ? (readFileSync(LOG, "utf8").match(/^fake roxy #\d+.*natal-chart/gm) ?? []).length : null);
const api = async (path, body) => {
  const r = await fetch(`${API}${path}`, { method: body ? "POST" : "GET", headers: HDR, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const NATAL = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
const TRANSIT = { technique: "western.transit", options: { date: "2026-10-07", time: "12:00", timezone: "Europe/Istanbul", nodeType: "true" } };

async function wheelStats(page, testId) {
  return page.evaluate(async (testId) => {
    const host = document.querySelector(`[data-testid="${testId}"]`);
    const el = host?.querySelector("roxy-transit-wheel, roxy-synastry-chart");
    if (!el) return null;
    await el.updateComplete;
    const svg = el.shadowRoot?.querySelector('svg[part="chart"]');
    if (!svg) return { svg: false };
    const r = svg.getBoundingClientRect();
    return {
      svg: true,
      glyphs: svg.querySelectorAll("text.natal-glyph, text.transit-glyph, text.p1, text.p2").length,
      cusps: svg.querySelectorAll("line.house-cusp").length,
      titles: [...svg.querySelectorAll("text.natal-glyph title, text.transit-glyph title, text.p1 title, text.p2 title")].map((t) => t.textContent).sort().join("|"),
      right: r.right,
      w: r.width,
    };
  }, testId);
}

(async () => {
  const stamp = Date.now().toString(36);
  const mk = async (label, birthDate, birthTime, loc) => (await api("/profiles", { label: `${label} ${stamp}`, birthDate, birthTime, timeKnown: true, timeAccuracy: "exact_record", locationId: loc })).json.profile.id;
  const pa = await mk("UAT Çark A", "1990-07-15", "14:30", "tr-34-istanbul");
  const pb = await mk("UAT Çark B", "1988-03-21", "06:45", "tr-06-ankara");
  const pc = await mk("UAT Çark Natalsiz", "1977-01-02", "03:04", "tr-34-istanbul");
  // Kayıtlı analizler (arşivden açma testi): natal + transit + sinastri.
  const SYN = { technique: "western.synastry", options: { partnerProfileId: pb, houseSystem: "placidus", nodeType: "true" } };
  const plan = await api("/engine/plan", { profileId: pa, revision: 1, selections: [NATAL, TRANSIT, SYN] });
  const run = await api("/engine/run", { profileId: pa, revision: 1, selections: plan.json.plan.selections.map((s, i) => ({ technique: s.technique, options: s.options ?? [NATAL, TRANSIT, SYN][i].options })), confirmNewRequests: plan.json.plan.newRequestCount });
  const res = run.json.results;
  ok("hazırlık: natal + transit + sinastri hesaplandı (sahte Roxy)", res.every((r) => r.ok), res.map((r) => `${r.technique}:${r.ok ? "ok" : r.code}`).join(","));
  ok("transit görünümüne natal çerçeve eklendi (aynı doğum verisi)", !!res[1].view.technical.natalFrame);
  const saved = {};
  for (const r of res) saved[r.technique] = (await api("/analyses", { profileId: pa, revision: 1, technique: r.technique, options: r.view.options, saveRequestId: crypto.randomUUID() })).json.analysisId;

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
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

  // ── U1: sonuç masası (natal + transit önbellekte → 0 yeni istek)
  const pickClient = async (pid, q) => {
    // UAT 2. tur (madde G): modüle yeni girişte ana ekran açılır (görünüm hash'i yeniden açılmaz) → ana ekrandan girilir.
    await page.goto(BASE, { waitUntil: "load", timeout: 120000 });
    await page.waitForSelector("[data-portal=new]", { timeout: 90000 });
    await page.locator("[data-portal=new]").first().click();
    await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
    await page.waitForTimeout(1200);
    await page.locator("[data-testid=atlas-client-trigger]").first().click();
    await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill(q);
    await page.waitForTimeout(900);
    await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${pid}"]`).click();
    await page.waitForTimeout(1000);
  };
  await pickClient(pa, `Çark A ${stamp}`);
  await page.locator("button[data-technique='western.transit']").first().click();
  await page.waitForTimeout(400);
  const h0 = hits();
  await page.waitForTimeout(1500);
  await page.locator("[data-testid=astro-run]").click();
  await page.waitForSelector("[data-testid=astro-result-view]", { timeout: 90000 });
  await page.waitForTimeout(2500);
  const u1 = await wheelStats(page, "astro-roxy-transit-wheel");
  ok("U1 sonuç masasında transit çift halka çizildi", !!u1?.svg && u1.glyphs >= 28, JSON.stringify(u1 && { glyphs: u1.glyphs, cusps: u1.cusps }));
  ok("U1 natal ev cusp'ları (12)", u1?.cusps === 12);
  ok("U1 Türkçe künye: iç natal / dış transit", /İç halka: .*natal .*Dış halka: transit/.test(await page.locator("[data-testid=astro-roxy-transit-caption]").first().innerText().catch(() => "")));
  ok("U1 çizim taşmıyor", !!u1 && u1.right <= width + 1, u1 && `${u1.right}`);
  if (LOG) ok("U1 harita için ek Roxy isteği yok (transit + natal önbellekte)", hits() - h0 <= 1, `${hits() - h0}`);
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "."}/wheel-ui-${width}-transit-desk.png` });
  // Teknik ayrıntı: açı tablosu duruyor
  await page.getByRole("tab", { name: /Teknik ayrıntı/ }).first().click();
  await page.waitForTimeout(500);
  ok("U1 Teknik ayrıntı sekmesinde transit açı tablosu", (await page.locator("text=Transit → natal açılar").count()) > 0);

  // ── U2: natali olmayan doğum verisi → harita yok, neden açık
  const h1 = hits();
  const n1 = natalHits();
  await pickClient(pc, `Natalsiz ${stamp}`);
  // Teknik seçimi danışan değişince korunur → yalnız seçili değilse işaretle.
  const tb = page.locator("button[data-technique='western.transit']").first();
  if ((await tb.getAttribute("aria-pressed")) !== "true") await tb.click();
  await page.waitForTimeout(1500);
  await page.locator("[data-testid=astro-run]").click();
  await page.waitForSelector("[data-testid=astro-result-view]", { timeout: 90000 });
  await page.waitForTimeout(2000);
  ok("U2 natal yokken çift halka ÇİZİLMEZ", (await page.locator("[data-testid=astro-roxy-transit-wheel]").count()) === 0);
  // UAT 2. tur (madde E): owner'ın metni + Natal'ı hesaplama düğmesi (plan/onay; kendiliğinden hesap YOK).
  ok("U2 açık neden gösterilir", /Transit çift halkalı haritası için uyumlu Natal \(Doğum\) analizi gerekiyor/.test(await page.locator("[data-testid=astro-wheel-gap]").first().innerText().catch(() => "")));
  ok("U2 'Natal'ı hesapla (önce plan gösterilir)' düğmesi var, kendiliğinden hesap yok", (await page.locator("[data-testid=astro-wheel-gap-natal]").count()) > 0 && (await page.locator("[data-testid=atlas-add-technique]").count()) === 0);
  if (LOG) ok("U2 natal İSTENMEZ (en çok 1 transit isteği; önbellekteyse 0)", natalHits() === n1 && hits() - h1 <= 1, `toplam +${hits() - h1}, natal +${natalHits() - n1}`);

  // ── U3: arşivden kayıtlı transit + sinastri
  const openSaved = async (id) => {
    await page.goto(`${BASE}#danisan/${pa}`, { waitUntil: "load" });
    await page.waitForSelector("[data-testid=astro-client-file-analyses]", { timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.locator(`[data-saved-item="${id}"]`).click();
    await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 60000 });
    await page.waitForTimeout(2500);
  };
  const h2 = hits();
  await openSaved(saved["western.transit"]);
  const u3t = await wheelStats(page, "astro-roxy-transit-wheel");
  ok("U3 arşivden transit: çift halka çizildi", !!u3t?.svg && u3t.cusps === 12, JSON.stringify(u3t && { glyphs: u3t.glyphs, cusps: u3t.cusps }));
  ok("U4 masa ile arşiv aynı haritayı gösterir (sembol + derece ipuçları)", !!u1 && !!u3t && u1.titles === u3t.titles);
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "."}/wheel-ui-${width}-transit-saved.png` });
  const focus = page.locator("[data-testid=atlas-chart-expand]");
  if (await focus.count()) {
    await focus.first().click();
    await page.waitForTimeout(800);
    ok("U4 Odak modu (büyütme) haritayı açar", (await page.locator("[data-testid=atlas-chart-overlay] roxy-transit-wheel").count()) > 0);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  } else ok("U4 Odak modu düğmesi", mobile, "mobilde yakınlaştırma dokunmatik (ChartViewport)");
  await openSaved(saved["western.synastry"]);
  const u3s = await wheelStats(page, "astro-roxy-synastry-wheel");
  ok("U3 arşivden sinastri: çift halka çizildi (2 × 14 cisim)", !!u3s?.svg && u3s.glyphs === 28, JSON.stringify(u3s && { glyphs: u3s.glyphs }));
  ok("U3 sinastride ev çizgisi YOK", u3s?.cusps === 0);
  ok("U3 sinastri künyesi: dış = analizin sahibi, iç = karşı taraf", new RegExp(`Dış halka \\(¹\\): UAT Çark A ${stamp} · İç halka \\(²\\): UAT Çark B ${stamp}`).test(await page.locator("[data-testid=astro-roxy-synastry-caption]").first().innerText().catch(() => "")));
  ok("U3 sinastri çizimi taşmıyor", !!u3s && u3s.right <= width + 1);
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "."}/wheel-ui-${width}-synastry-saved.png` });
  if (LOG) ok("U3 arşivden açmak 0 Roxy isteği", hits() === h2, `${h2} → ${hits()}`);

  // ── U5: natal çark bozulmadı
  await openSaved(saved["western.natal"]);
  ok("U5 natal çark çiziliyor", (await page.locator("[data-testid=astro-saved-analysis] svg").count()) > 0 && (await page.locator("[data-testid=astro-roxy-transit-wheel], [data-testid=astro-roxy-synastry-wheel]").count()) === 0);

  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(`\nwheels ui: ${pass} PASS / ${fail} FAIL (${width}×${height})`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("HATA", e);
  process.exit(2);
});
