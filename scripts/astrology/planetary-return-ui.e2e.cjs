// GEZEGEN DÖNÜŞLERİ (2026-10-22) — ekran + akış regresyonu (Playwright Chromium). YEREL; sahte DB + sahte sağlayıcı (KATI mod;
// GERÇEK sağlayıcı YOK). Sahte arka uç yalnız 4 gerçek golden gövdesini BİREBİR tanır (Ali Örnek = sentetik A 1990-07-15 14:30 İstanbul):
//   Satürn 2049 (1. kavuşum), Jüpiter 2025–26 (2. — geri hareketli — kavuşum), Mars 2028 Londra, Merkür 2026 Whole Sign.
// Önkoşul: yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>,
//          ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2) + dev-fake-backend.
// Çalıştırma: node scripts/astrology/planetary-return-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü] [fake.log]
//   • API: plan (planInfo: Jüpiter kümesinde 3 kavuşum; ileri / geri / ileri) → çalıştır (Jüpiter 2. + Satürn 1.) → kaydet → aç
//     (0 yeni sağlayıcı isteği) → Word/PDF 200 (çark görseli + dönüş anı UTC + doğum yeri yerel saati + kavuşum + tutarlılık + tablolar)
//   • Sonuç masası (1366): gezegen / hedef tarih / kavuşum seçimi (sunucu planından 3 kavuşum) → panel + çark; önbellekte → 0 istek
//   • Kayıtlı analiz 1366×768, 768×1024, 390×844: panel + çark görünür ve taşmıyor; tablolar; yöntem notu; sağlayıcı adı yok.
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
const PR = (planet, approxDate, crossing = 1, houseSystem = "placidus", returnLocationId = null) => ({ technique: "western.planetary_return", options: { planet, approxDate, crossing, houseSystem, returnLocationId } });
const JUP = PR("jupiter", "2025-12-01", 2);
const SAT = PR("saturn", "2049-02-01", 1);
const VIEWS = [
  [1366, 768],
  [768, 1024],
  [390, 844],
];

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

const wheelStats = (page) =>
  page.evaluate(() => {
    const svg = [...document.querySelectorAll("svg")].find((s) => /dönüşü çarkı/.test(s.getAttribute("aria-label") ?? "") && s.getBoundingClientRect().width > 0);
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { w: r.width, left: r.left, right: r.right, vw: document.documentElement.clientWidth, label: svg.getAttribute("aria-label") };
  });

(async () => {
  // ── 1) API akışı
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [JUP, SAT] });
  const pj = plan.j?.plan;
  const jupInfo = pj?.selections?.[0]?.info?.planetaryReturns ?? [];
  ok("plan: Jüpiter kümesinde 3 kavuşum (ileri / geri / ileri)", jupInfo.length === 3 && jupInfo.map((x) => x.motion).join(",") === "direct,retrograde,direct", JSON.stringify(jupInfo));
  ok("plan: en çok 2 yeni istek", typeof pj?.newRequestCount === "number" && pj.newRequestCount <= 2, String(pj?.newRequestCount));
  // Sağlayıcı istek gövdesi alanları plana girmez. Dönüş konumu (returnLocation: etiket + koordinat) Solar/Lunar Return ile AYNI
  // mevcut tasarım gereği normalize seçenekte bulunur (yetkili uzmanın kendi danışanı) — bu denetimin kapsamı dışıdır.
  ok("plan: sağlayıcı istek gövdesi istemciye gitmez", !JSON.stringify(pj).includes("approximateDate") && !JSON.stringify(pj).includes("\"birthTime\""));
  const h0 = hits();
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [JUP, SAT], confirmNewRequests: pj?.newRequestCount });
  const res = run.j?.results ?? [];
  ok("run: Jüpiter (2. kavuşum) + Satürn hesaplandı (golden)", res.length === 2 && res.every((r) => r.ok), res.map((r) => `${r.technique}:${r.ok ? "ok" : r.code}`).join(","));
  if (LOG) ok("run: yalnız plan kadar sağlayıcı isteği", hits() - h0 === pj?.newRequestCount, `+${hits() - h0}`);
  const jv = res[0]?.view;
  ok("Jüpiter: geri hareketli kavuşum + dönüş anı UTC", jv?.technical?.requested?.motion === "retrograde" && jv?.technical?.returnUtc === "2025-12-22T11:49:05Z", JSON.stringify(jv?.technical?.requested));
  const ids = {};
  for (const [key, sel, v] of [
    ["jupiter", JUP, jv],
    ["saturn", SAT, res[1]?.view],
  ]) {
    const s = await api("/analyses", { profileId: pid, revision: 1, technique: sel.technique, options: v?.options ?? sel.options, saveRequestId: randomUUID() });
    ids[key] = s.j?.analysisId;
    ok(`kayıt ${key}`, typeof s.j?.analysisId === "string", JSON.stringify(s.j).slice(0, 200));
  }
  const h1 = hits();
  for (const key of ["jupiter", "saturn"]) {
    const a = await api(`/analyses/${ids[key]}`);
    ok(`arşivden aç ${key}: teknik snapshot`, a.j?.analysis?.technical?.planet === key, String(a.s));
    for (const fmt of ["docx", "pdf"]) {
      const r = await api(`/analyses/${ids[key]}/report?format=${fmt}`, null, true);
      const buf = Buffer.from(await r.arrayBuffer());
      ok(`rapor ${key} ${fmt}: 200`, r.status === 200 && buf.length > 20000, `${r.status} ${buf.length} bayt`);
      if (OUT) fs.writeFileSync(path.join(OUT, `gezegen-donusu-${key}.${fmt}`), buf);
      if (fmt === "docx" && r.status === 200) {
        const zip = await JSZip.loadAsync(buf);
        const media = Object.keys(zip.files).filter((x) => x.startsWith("word/media/") && !x.endsWith("/")).length;
        const text = (await zip.file("word/document.xml").async("string")).replace(/<[^>]+>/g, "");
        const want = key === "jupiter" ? ["Jüpiter dönüşü", "2. kavuşum / 3", "geri hareket", "22.12.2025 11:49 UTC", "doğum yeri yerel saati", "Tutarlılık", "Dönüş haritası gezegenleri", "Ev başlangıçları", "Yöntem: gezegen dönüşü"] : ["Satürn dönüşü", "1. kavuşum / 3", "08.02.2049 11:39 UTC", "yaklaşık 29,5 yıl"];
        ok(`Word ${key}: çark görseli + alanlar`, media >= 1 && want.every((x) => text.includes(x)), `media=${media} eksik=${want.filter((x) => !text.includes(x)).join(",")}`);
        ok(`Word ${key}: sağlayıcı adı / ham alan yok`, !/roxy/i.test(text) && !text.includes("undefined") && !text.includes("approximateCycle") && !text.includes("~12 years"));
      }
    }
  }
  if (LOG) ok("arşivden açma + rapor: 0 sağlayıcı isteği", hits() === h1, `${h1} → ${hits()}`);

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

  // ── 2) Sonuç masası (1366): gezegen / tarih / kavuşum seçimi → panel; önbellekte → 0 yeni istek
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
    const b = page.locator("button[data-technique='western.planetary_return']").first();
    // Ekle düğmesi yalnız simgelidir; teknik adı aria-label'da ve yanındaki odak düğmesinde yazar.
    const focusBtn = page.locator("[data-technique-focus='western.planetary_return']").first();
    ok("masa: teknik seçicide 'Gezegen dönüşleri'", (await b.count()) === 1 && /Gezegen dönüşleri/.test((await b.getAttribute("aria-label")) ?? "") && /Gezegen dönüşleri/.test(await focusBtn.innerText()));
    if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
    await page.waitForTimeout(300);
    await page.locator("[data-technique-focus='western.planetary_return']").first().click();
    await page.waitForTimeout(600);
    await page.locator("[data-testid=astro-pr-planet]").first().selectOption("jupiter");
    await page.locator("[data-testid=astro-pr-date]").first().fill("2025-12-01");
    await page.waitForTimeout(2200);
    const radios = page.locator("[data-testid=astro-pr-crossings] input[data-pr-crossing]");
    ok("masa: sunucu planından 3 kavuşum listelendi", (await radios.count()) === 3, String(await radios.count()));
    const loopNote = await page.locator("[data-testid=astro-pr-loop-note]").first().innerText().catch(() => "");
    ok("masa: retro döngüsü notu", /3 kavuşum/.test(loopNote), loopNote.slice(0, 80));
    await page.locator("[data-testid=astro-pr-crossings] input[data-pr-crossing='2']").first().check();
    await page.waitForTimeout(1800);
    const h2 = hits();
    await page.locator("[data-testid=astro-run]").click();
    await page.waitForSelector("[data-testid=astro-result-view]", { timeout: 90000 });
    await page.waitForTimeout(2500);
    if (LOG) ok("masa: önbellekteki sonuç → 0 yeni sağlayıcı isteği", hits() === h2, `${h2} → ${hits()}`);
    const tab = page.locator("[data-tab-key^='western.planetary_return|']").first();
    if (await tab.count()) await tab.click().catch(() => {});
    await page.waitForTimeout(1500);
    const w = await wheelStats(page);
    ok("masa: dönüş çarkı görünür", !!w && w.w > 150 && /Jüpiter dönüşü/.test(w.label ?? ""), JSON.stringify(w));
    if (OUT) await page.screenshot({ path: path.join(OUT, "masa-gezegen-donusu-1366x768.png") });
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
    const item = page.locator(`[data-saved-item="${ids.jupiter}"]`);
    await item.waitFor({ timeout: 120000 });
    await item.click();
    await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 60000 });
    await page.waitForTimeout(2500);
    const ws = await wheelStats(page);
    ok(`${tag}: çark görünür ve ekrana sığıyor`, !!ws && ws.w > 150 && ws.left >= -1 && ws.right <= ws.vw + 1, JSON.stringify(ws));
    if (OUT) await page.screenshot({ path: path.join(OUT, `kayitli-gezegen-donusu-cark-${tag}.png`) });
    const techTab = page.getByRole("tab", { name: /Teknik ayrıntı/ }).first();
    if (await techTab.count()) await techTab.click();
    await page.waitForTimeout(800);
    const panel = page.locator("[data-testid=astro-planetary-return-panel]").first();
    ok(`${tag}: panel görünür`, (await panel.count()) === 1 && (await panel.isVisible()));
    const txt = await panel.innerText().catch(() => "");
    for (const want of ["Jüpiter dönüşü", "2. kavuşum / 3", "geri hareket", "22.12.2025 11:49 UTC", "Tutarlılık denetimi", "Dönüş haritası gök cisimleri", "Ev başlangıçları", "Açılar"]) ok(`${tag}: "${want}"`, txt.includes(want));
    const m = await page.evaluate(() => {
      const el = document.querySelector("[data-testid=astro-planetary-return-panel]");
      const r = el?.getBoundingClientRect();
      return { dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, right: r ? r.right : 0 };
    });
    ok(`${tag}: yatay taşma yok`, m.dw <= m.vw + 1 && m.right <= m.vw + 1, JSON.stringify(m));
    ok(`${tag}: sağlayıcı adı / ham alan yok`, !/roxy/i.test(txt) && !txt.includes("approximateCycle") && !txt.includes("undefined"));
    ok(`${tag}: sayfa hatası yok`, errs.length === 0, errs.join(" | "));
    if (OUT) await page.screenshot({ path: path.join(OUT, `kayitli-gezegen-donusu-teknik-${tag}.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
  console.log(`\nplanetary-return-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
