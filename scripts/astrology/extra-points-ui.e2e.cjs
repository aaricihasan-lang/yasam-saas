// EK NOKTALAR (2026-10-22) — ekran + akış regresyonu (Playwright Chromium). YEREL; sahte DB + sahte sağlayıcı (KATI mod; GERÇEK
// sağlayıcı YOK). Sahte arka uç golden'ları otomatik tanır (fixtures/golden/extra-*.json; strictMatch birebir gövde + lang=tr):
// Ali Örnek (1990-07-15 14:30 İstanbul) için Placidus asteroit + Lilith + lot yanıtı vardır.
// Önkoşul: yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>,
//          ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2) + dev-fake-backend
//          **FAKE_NATAL_REAL_GOLDEN=1** ile (natal tutarlılık denetimi — ortalama Lilith / Şans Noktası — gerçek natal golden'la yapılır).
// Çalıştırma: node scripts/astrology/extra-points-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü] [fake.log]
//   • API: natal önbellekte → plan yalnız seçilen bölümler (en çok 3); natal sağlayıcıya GİTMEZ; natalFrame + natalCheck uyumlu
//   • yalnız Lilith seçimi → 1 birim; aynı seçim 2. kez → 0 istek
//   • kaydet → aç (0 yeni istek) → Word/PDF 200; Word metninde üç bölüm, ortalama/gerçek Lilith ayrı, Zafer yöntem notu, sağlayıcı adı yok
//   • Sonuç masası (1366): teknik seçimi + bölüm kutuları → sonuç; 0 yeni istek (önbellek)
//   • Kayıtlı analiz 1366×768, 768×1024, 390×844: natal çark + ek noktalar katmanı, üç tablo, yatay taşma yok, sağlayıcı adı yok
//   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const JSZip = require("jszip");
const [ORIGIN = "http://localhost:3961", OUT = "", LOG = ""] = process.argv.slice(2);
if (OUT) fs.mkdirSync(OUT, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`);
};
const API = `${ORIGIN}/api/admin/astroloji`;
const T = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const H = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": T, cookie: `yasam_admin_session=${T}`, origin: ORIGIN };
const api = async (p, b, raw = false) => {
  const r = await fetch(`${API}${p}`, { method: b ? "POST" : "GET", headers: H, body: b ? JSON.stringify(b) : undefined });
  if (raw) return r;
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return { s: r.status, j };
};
const logText = () => (LOG && fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : null);
const hits = () => {
  const t = logText();
  return t === null ? null : (t.match(/^fake roxy #\d+/gm) ?? []).length;
};
const natalHits = () => {
  const t = logText();
  return t === null ? null : (t.match(/^fake roxy #\d+ \/astrology\/natal-chart/gm) ?? []).length;
};
const ALL = ["asteroids", "lots", "lilith"];
const EP = (sections = ALL) => ({ technique: "western.extra_points", options: { sections, houseSystem: "placidus" } });
const NATAL = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
const VIEWS = [
  [1366, 768],
  [768, 1024],
  [390, 844],
];
const BAD = /roxy|golden|fixture|\/astrology\/(asteroids|arabic-lots|lilith)|undefined|\[object Object\]/i;

async function newPage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 640, hasTouch: w < 640, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  const host = new URL(ORIGIN).hostname;
  await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: host, path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: host, path: "/" }]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  return { ctx, page: await ctx.newPage() };
}

/** Ek noktalar paneli ölçümü (çark + tablolar + taşma). */
const panelStats = (page) =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-testid="astro-extra-points"]')].find((x) => x.getBoundingClientRect().width > 0);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const svg = el.querySelector('[data-testid="astro-extra-wheel-svg"]');
    const sr = svg ? svg.getBoundingClientRect() : null;
    return {
      right: r.right,
      dw: document.documentElement.scrollWidth,
      vw: document.documentElement.clientWidth,
      asteroids: el.querySelectorAll("[data-asteroid]").length,
      lots: el.querySelectorAll("[data-lot]").length,
      lilith: [...el.querySelectorAll("[data-lilith]")].map((x) => x.getAttribute("data-lilith")),
      extraPoints: svg ? svg.querySelectorAll("[data-extra-point]").length : 0,
      natalBodies: svg ? svg.querySelectorAll("[data-natal-body]").length : 0,
      natalLilithInner: svg ? svg.querySelectorAll('[data-natal-body="lilith"]').length : -1,
      svgW: sr ? sr.width : 0,
      svgLeft: sr ? sr.left : 0,
      svgRight: sr ? sr.right : 0,
      checks: el.querySelector('[data-testid="astro-extra-natal-check"]')?.innerText ?? "",
      text: el.innerText,
    };
  });

(async () => {
  // ── 1) API akışı
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  const nPlan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [NATAL] });
  ok("hazırlık: Ali'nin natal sonucu önbellekte (0 yeni istek)", nPlan.j?.plan?.newRequestCount === 0, JSON.stringify(nPlan.j?.plan ?? nPlan.j).slice(0, 200));
  const p1 = await api("/engine/plan", { profileId: pid, revision: 1, selections: [EP(["lilith"])] });
  ok("plan: yalnız Lilith seçimi → 1 birim (natal plana girmez)", p1.j?.plan?.selections?.[0]?.unitCount === 1 && p1.j.plan.units.every((u) => u.technique === "western.extra_points"), JSON.stringify(p1.j?.plan?.units ?? p1.j).slice(0, 200));
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [EP()] });
  const nreq = plan.j?.plan?.newRequestCount;
  ok("plan: üç bölüm → en çok 3 yeni istek", typeof nreq === "number" && nreq <= 3 && plan.j.plan.selections[0].unitCount === 3, String(nreq));
  const h0 = hits();
  const nh0 = natalHits();
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [EP()], confirmNewRequests: nreq });
  const v = run.j?.results?.[0]?.view;
  ok("run: ek noktalar hesaplandı (golden)", run.j?.results?.[0]?.ok === true, JSON.stringify(run.j).slice(0, 240));
  if (LOG) ok("run: natal sağlayıcıya GÖNDERİLMEDİ; yalnız plan kadar istek", natalHits() === nh0 && hits() - h0 === nreq, `toplam +${hits() - h0}, natal +${natalHits() - nh0}`);
  const t = v?.technical;
  ok("teknik: 4 asteroit + 7 lot + ortalama/gerçek Lilith ayrı", t?.asteroids?.bodies?.length === 4 && t?.lots?.lots?.length === 7 && t?.lilith?.mean?.variant === "mean" && t?.lilith?.true?.variant === "true");
  ok("natal katmanı: natalFrame (önbellekteki natal) + tutarlılık", !!t?.natalFrame && t.natalFrame.houses.length === 12 && !!t?.natalCheck, t?.natalFrame ? "" : "çerçeve yok — dev-fake-backend FAKE_NATAL_REAL_GOLDEN=1 ile başlatılmalı");
  ok("tutarlılık: ortalama Lilith ve Şans Noktası natal ile uyumlu (FAKE_NATAL_REAL_GOLDEN=1)", t?.natalCheck?.meanLilith?.status === "consistent" && t?.natalCheck?.fortune?.status === "consistent", JSON.stringify(t?.natalCheck ?? null));
  ok("Zafer Noktası: yöntem farkı işaretli (traditional=false)", t?.lots?.lots?.find((l) => l.id === "victory")?.traditional === false);
  const h1 = hits();
  const again = await api("/engine/run", { profileId: pid, revision: 1, selections: [EP()] });
  if (LOG) ok("aynı seçim 2. kez: 0 yeni istek", again.j?.results?.[0]?.ok === true && hits() === h1, `${h1} → ${hits()}`);
  const s = await api("/analyses", { profileId: pid, revision: 1, technique: "western.extra_points", options: v?.options ?? EP().options, saveRequestId: randomUUID() });
  const id = s.j?.analysisId;
  ok("kayıt", typeof id === "string", JSON.stringify(s.j).slice(0, 200));
  const h2 = hits();
  const a = await api(`/analyses/${id}`);
  ok("arşivden aç: üç bölüm + natal çerçeve snapshot'ta", a.j?.analysis?.technical?.lots?.lots?.length === 7 && !!a.j?.analysis?.technical?.natalFrame, `${a.s}`);
  for (const fmt of ["docx", "pdf"]) {
    const r = await api(`/analyses/${id}/report?format=${fmt}`, null, true);
    const buf = Buffer.from(await r.arrayBuffer());
    ok(`rapor ${fmt}: 200`, r.status === 200 && buf.length > 10000, `${r.status} ${buf.length} bayt`);
    if (OUT) fs.writeFileSync(path.join(OUT, `ek-noktalar.${fmt}`), buf);
    if (fmt === "docx" && r.status === 200) {
      const zip = await JSZip.loadAsync(buf);
      const text = (await zip.file("word/document.xml").async("string")).replace(/<[^>]+>/g, "");
      const want = ["Asteroitler", "Ceres", "Vesta", "Ortalama Kara Ay Lilith (ortalama apoje)", "Gerçek Kara Ay Lilith (osculating apoje)", "Hermetik lotlar", "Şans Noktası (Fortuna)", "Zafer Noktası (Victory)", "Yöntem farkı", "Natal harita ile tutarlılık"];
      ok("Word: üç bölüm + ayrı Lilith + Zafer notu + tutarlılık", want.every((x) => text.includes(x)), `eksik=${want.filter((x) => !text.includes(x)).join(",")}`);
      ok("Word: sağlayıcı adı / iç jargon yok", !BAD.test(text));
    }
  }
  if (LOG) ok("arşivden açma + rapor: 0 sağlayıcı isteği", hits() === h2, `${h2} → ${hits()}`);

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

  // ── 2) Sonuç masası (1366): teknik + bölüm kutuları → sonuç; 0 yeni istek (önbellekte)
  {
    const { ctx, page } = await newPage(browser, 1366, 768);
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    await page.goto(`${ORIGIN}/admin/astroloji`, { waitUntil: "load", timeout: 240000 });
    await page.waitForSelector("[data-portal=new]", { timeout: 120000 });
    await page.locator("[data-portal=new]").first().click();
    await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.locator("[data-testid=atlas-client-trigger]").first().click();
    await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill("Ali Örnek");
    await page.waitForTimeout(900);
    await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${pid}"]`).click();
    await page.waitForTimeout(1200);
    const b = page.locator("button[data-technique='western.extra_points']").first();
    ok("masa: teknik listede ('Ek noktalar')", (await b.count()) === 1);
    if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
    await page.waitForTimeout(300);
    await page.locator("[data-technique-focus='western.extra_points']").first().click();
    await page.waitForTimeout(600);
    const boxes = page.locator("[data-testid=astro-extra-points-params] input[data-extra-section]");
    ok("masa: üç bölüm kutusu (varsayılan işaretli)", (await boxes.count()) === 3 && (await boxes.evaluateAll((xs) => xs.every((x) => x.checked))));
    await page.waitForTimeout(1500);
    const h3 = hits();
    await page.locator("[data-testid=astro-run]").click();
    await page.waitForSelector("[data-testid=astro-result-view]", { timeout: 90000 });
    await page.waitForTimeout(2500);
    if (LOG) ok("masa: önbellekteki sonuç → 0 yeni sağlayıcı isteği", hits() === h3, `${h3} → ${hits()}`);
    const tab = page.locator("[data-tab-key^='western.extra_points|']").first();
    if (await tab.count()) await tab.click().catch(() => {});
    await page.waitForTimeout(1500);
    const st = await panelStats(page);
    ok("masa: panel + çark katmanı + tablolar", !!st && st.asteroids === 4 && st.lots === 7 && st.lilith.join(",") === "mean,true" && st.extraPoints === 13, JSON.stringify(st && { a: st.asteroids, l: st.lots, li: st.lilith, x: st.extraPoints }));
    if (OUT) await page.screenshot({ path: path.join(OUT, "masa-ek-noktalar-1366x768.png"), fullPage: true });
    ok("masa: sayfa hatası yok", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ── 3) Kayıtlı analiz — 3 ekran
  for (const [w, h] of VIEWS) {
    const tag = `${w}x${h}`;
    const { ctx, page } = await newPage(browser, w, h);
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
    const item = page.locator(`[data-saved-item="${id}"]`);
    await item.waitFor({ timeout: 120000 });
    await item.click();
    await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 60000 });
    await page.waitForTimeout(2500);
    let st = await panelStats(page);
    if (!st) {
      const techTab = page.getByRole("tab", { name: /Teknik/ }).first();
      if (await techTab.count()) await techTab.click();
      await page.waitForTimeout(1000);
      st = await panelStats(page);
    }
    ok(`${tag}: ek noktalar paneli`, !!st);
    ok(`${tag}: natal çark + 13 ek nokta (iç halkada natal Lilith tekrar çizilmez)`, !!st && st.extraPoints === 13 && st.natalBodies >= 10 && st.natalLilithInner === 0, JSON.stringify(st && { x: st.extraPoints, n: st.natalBodies, nl: st.natalLilithInner }));
    ok(`${tag}: çark ekrana sığıyor`, !!st && st.svgW > 150 && st.svgLeft >= -1 && st.svgRight <= st.vw + 1, JSON.stringify(st && { w: st.svgW, l: st.svgLeft, r: st.svgRight, vw: st.vw }));
    ok(`${tag}: asteroit (4) + lot (7) + Lilith (ortalama, gerçek) tabloları`, !!st && st.asteroids === 4 && st.lots === 7 && st.lilith.join(",") === "mean,true");
    ok(`${tag}: natal tutarlılık kutusu 'Uyumlu'`, !!st && /Uyumlu/.test(st.checks), st?.checks.slice(0, 160));
    ok(`${tag}: Zafer yöntem farkı notu`, !!st && /Zafer Noktası \(Victory\)/.test(st.text) && /Yöntem farkı/.test(st.text));
    ok(`${tag}: yatay taşma yok`, !!st && st.dw <= st.vw + 1 && st.right <= st.vw + 1, JSON.stringify(st && { dw: st.dw, vw: st.vw, right: st.right }));
    ok(`${tag}: sağlayıcı adı / iç jargon yok`, !!st && !BAD.test(st.text));
    ok(`${tag}: sayfa hatası yok`, errs.length === 0, errs.join(" | "));
    if (OUT) await page.screenshot({ path: path.join(OUT, `kayitli-ek-noktalar-${tag}.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
  console.log(`\nextra-points-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
