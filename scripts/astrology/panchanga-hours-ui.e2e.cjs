// ATLAS YENİ TEKNİKLER (2026-10-22) — Janma Panchanga "Gezegen saatleri (Hora) + Choghadiya" seçeneği: ekran + akış regresyonu
// (Playwright Chromium). YEREL; sahte DB + sahte sağlayıcı (KATI mod: birebir golden gövdeye GERÇEK yanıt — dev-fake-backend
// strictMatch; hora/choghadiya golden'ları İstanbul 2026-11-01 +3). GERÇEK sağlayıcı YOK.
// Önkoşul: dasha-panchanga-ui.e2e.cjs ile aynı (yerel next + dev-fake-backend).
// Çalıştırma: node scripts/astrology/panchanga-hours-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   1) API: hora + choghadiya (yalnız seçenek; 3 birim) · Ayrıntılı ile birlikte (4 birim) · kutup engeli (0 istek) → kaydet →
//      aynı seçim 0 yeni istek → Word/PDF 200 + içerik
//   2) Seçici (1366×768): Vedik sekmesi → Janma Panchanga → "Gezegen saatleri…" kutusu; işaretlenince gün + yer alanları görünür
//   3) Kayıtlı analiz 1366×768 + 768×1024 + 390×844: hora 12+12, choghadiya 8+8 satır, olumlu/olumsuz metni; yatay taşma yok;
//      sağlayıcı adı yok; Word/PDF iner.   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const JSZip = require("jszip");
const [ORIGIN = "http://localhost:3961", OUT = ""] = process.argv.slice(2);
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
const DAY = "2026-11-01";

async function newPage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 640, hasTouch: w < 640, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true });
  const host = new URL(ORIGIN).hostname;
  await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: host, path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: host, path: "/" }]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  return { ctx, page: await ctx.newPage() };
}
async function runSel(pid, sel) {
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [sel] });
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [sel], confirmNewRequests: plan.j?.plan?.newRequestCount ?? 0 });
  return { plan, run, it: run.j?.results?.[0] };
}
async function docxText(buf) {
  const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml").async("string");
  return xml.replace(/<[^>]+>/g, " ");
}

(async () => {
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  // ── 1) API
  const hSel = { technique: "vedic.panchanga", options: { ayanamsa: "lahiri", detailDate: DAY, placeLocationId: null, hours: true } };
  const h = await runSel(pid, hSel);
  const hs = h.it?.view?.technical?.hours;
  ok("plan: hora + choghadiya seçeneği → 3 birim (temel + 2)", (h.plan.j?.plan?.selections?.[0]?.unitCount ?? 0) === 3, JSON.stringify(h.plan.j?.plan?.selections?.[0]).slice(0, 200));
  ok("API hora: 12 + 12, 1. gündüz horası Güneş 07:35–08:27", h.it?.ok === true && hs?.hora?.day?.length === 12 && hs.hora.night.length === 12 && hs.hora.day[0].lord === "sun" && hs.hora.day[0].start === "2026-11-01T07:35:00", JSON.stringify(hs ?? h.run.j).slice(0, 300));
  ok("API choghadiya: 8 + 8, gündüz 4. dilim Amrit (olumlu)", hs?.choghadiya?.day?.length === 8 && hs.choghadiya.night.length === 8 && hs.choghadiya.day[3].name === "amrit" && hs.choghadiya.day[3].effect === "good");
  const both = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ technique: "vedic.panchanga", options: { ayanamsa: "lahiri", detail: true, detailDate: DAY, placeLocationId: null, hours: true } }] });
  ok("plan: Ayrıntılı + hora/choghadiya → 4 birim", both.j?.plan?.selections?.[0]?.unitCount === 4, JSON.stringify(both.j?.plan?.selections?.[0]).slice(0, 200));
  const polar = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ technique: "vedic.panchanga", options: { ayanamsa: "lahiri", detailDate: "2026-12-21", placeLocationId: "gn-3133895", hours: true } }] });
  ok("kutup yeri (Tromsø): PANCHANGA_POLAR, 0 istek", polar.j?.plan?.selections?.[0]?.blocked?.code === "PANCHANGA_POLAR" && polar.j?.plan?.newRequestCount === 0, JSON.stringify(polar.j?.plan?.selections?.[0] ?? polar.j).slice(0, 200));
  const off = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ technique: "vedic.panchanga", options: { ayanamsa: "lahiri" } }] });
  ok("seçenek kapalı: 1 birim (eski davranış)", off.j?.plan?.selections?.[0]?.unitCount === 1);
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: hSel.technique, options: h.it?.view?.options ?? hSel.options, saveRequestId: randomUUID(), includeProviderInterp: true });
  const id = sv.j?.analysisId;
  ok("kayıt", typeof id === "string", JSON.stringify(sv.j).slice(0, 200));
  const again = await api("/engine/plan", { profileId: pid, revision: 1, selections: [hSel] });
  ok("aynı seçim: 0 yeni istek (önbellek)", again.j?.plan?.newRequestCount === 0, JSON.stringify(again.j?.plan).slice(0, 200));
  for (const fmt of ["docx", "pdf"]) {
    const r = await api(`/analyses/${id}/report?format=${fmt}`, null, true);
    const buf = Buffer.from(await r.arrayBuffer());
    ok(`rapor ${fmt}: 200`, r.status === 200 && buf.length > 5000, `${r.status} ${buf.length}`);
    if (OUT) fs.writeFileSync(path.join(OUT, `hora-choghadiya.${fmt}`), buf);
    if (fmt === "docx" && r.status === 200) {
      const text = await docxText(buf);
      const want = ["Gezegen saatleri (Hora) ve Choghadiya", "Gündüz 1", "Gece 12", "Amrit", "olumlu", "olumsuz", "Kaldani"];
      ok(`Word: ${want.join(" · ")}`, want.every((s) => text.includes(s)) && !/roxy/i.test(text) && !text.includes("undefined"), want.filter((s) => !text.includes(s)).join(", "));
    }
  }

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  // ── 2) Seçici (1366×768)
  {
    const { ctx, page } = await newPage(browser, 1366, 768);
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
    await page.locator("[role=tablist] button[data-system=vedic]").first().click();
    await page.waitForTimeout(500);
    await page.locator("button[data-technique='vedic.panchanga']").first().click();
    await page.waitForTimeout(300);
    await page.locator("[data-technique-focus='vedic.panchanga']").first().click();
    await page.waitForTimeout(800);
    const tog = page.locator("[data-panchanga-hours=toggle]").first();
    ok("seçici: 'Gezegen saatleri (Hora) ve Choghadiya' kutusu görünür", await tog.isVisible().catch(() => false));
    await tog.check().catch(() => {});
    await page.waitForTimeout(400);
    ok("seçici: kutu işaretlenince gün alanı görünür", await page.locator("[data-testid=astro-panchanga-detail-params] input[type=date]").first().isVisible().catch(() => false));
    const txt = await page.locator("[data-testid=astro-panchanga-detail-params]").first().innerText().catch(() => "");
    ok("seçici: ek 2 istek bilgisi", txt.includes("ek 2 istek"), txt.slice(0, 200));
    if (OUT) await page.screenshot({ path: path.join(OUT, "secici-1366.png"), fullPage: true });
    await ctx.close();
  }
  // ── 3) Kayıtlı analiz — 1366 / 768 / 390
  for (const [w, hh] of [
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    const tag = `${w}x${hh}`;
    const { ctx, page } = await newPage(browser, w, hh);
    await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
    const item = page.locator(`[data-saved-item="${id}"]`);
    await item.waitFor({ timeout: 120000 }).catch(() => {});
    ok(`${tag}: kayıt danışan dosyasında görünür`, await item.isVisible().catch(() => false));
    await item.click().catch(() => {});
    const sec = page.locator("[data-testid=astro-vedic-panchanga-hours]").first();
    await sec.waitFor({ timeout: 60000 }).catch(() => {});
    ok(`${tag}: Hora + Choghadiya bölümü görünür`, await sec.isVisible().catch(() => false));
    const cnt = async (t) => page.locator(`[data-testid=${t}] tbody tr`).count();
    const [hd, hn, cd, cn] = [await cnt("astro-hora-day"), await cnt("astro-hora-night"), await cnt("astro-choghadiya-day"), await cnt("astro-choghadiya-night")];
    ok(`${tag}: hora 12 + 12, choghadiya 8 + 8 satır`, hd === 12 && hn === 12 && cd === 8 && cn === 8, `${hd}/${hn}/${cd}/${cn}`);
    const st = await sec.innerText().catch(() => "");
    ok(`${tag}: olumlu / olumsuz metni ve 07:35 – 08:27`, st.includes("olumlu") && st.includes("olumsuz") && st.includes("07:35 – 08:27"), st.slice(0, 200));
    const m = await page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    ok(`${tag}: yatay taşma yok`, m.dw <= m.vw + 1, JSON.stringify(m));
    const body = await page.locator("body").innerText();
    ok(`${tag}: sağlayıcı adı / 'golden' / ham uç adı yok`, !/\broxy\b|golden|fixture|\/panchang\//i.test(body));
    if (OUT) await page.screenshot({ path: path.join(OUT, `kayitli-hora-${tag}.png`), fullPage: true });
    for (const [tid, ext, magic] of [
      ["astro-report-docx", "docx", "PK"],
      ["astro-report-pdf", "pdf", "%PDF-"],
    ]) {
      const b = page.locator(`[data-testid=${tid}]`).first();
      if (!(await b.isVisible().catch(() => false))) {
        ok(`${tag}: ${ext} düğmesi görünür`, false);
        continue;
      }
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), b.click()]);
      const buf = fs.readFileSync(await dl.path());
      ok(`${tag}: ${ext} iner ve geçerli`, buf.subarray(0, magic.length).toString() === magic && buf.length > 5000, `${buf.length}`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\npanchanga-hours-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
