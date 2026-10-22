// ATLAS YENİ TEKNİKLER (2026-10-22) — KP ruling planets ZAMAN TARAMASI (kp.ruling_interval): ekran + akış regresyonu (Playwright
// Chromium). YEREL; sahte DB + sahte sağlayıcı (KATI mod: birebir golden gövdeye GERÇEK yanıt — dev-fake-backend strictMatch;
// golden B = İstanbul 01.11.2026 07:00–08:00 yerel, 10 dk). GERÇEK sağlayıcı YOK.
// Önkoşul: dasha-panchanga-ui.e2e.cjs ile aynı (yerel next + dev-fake-backend; "Ali Örnek" profili doğum yeri İstanbul).
// Çalıştırma: node scripts/astrology/kp-ruling-interval-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   1) API: tarama (1 birim, doğum verisi yok) · kutup engeli · yaz saati geçişi engeli (Berlin) — 0 istek → kaydet → aynı seçim
//      0 yeni istek → Word/PDF 200 + içerik
//   2) Seçici (1366×768): KP sekmesi → KP ruling planets zaman taraması → süre/adım alanları, an sayısı, yöntem notu
//   3) Kayıtlı analiz 1366×768 + 768×1024 + 390×844: tablo 7 satır, değişim anları (gün lordu), yöntem uyarısı, satır ayrıntısı;
//      yatay taşma yok; sağlayıcı adı yok; Word/PDF iner.   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
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
const SEL = { technique: "kp.ruling_interval", options: { atUtc: "2026-11-01T04:00", durationMinutes: 60, intervalMinutes: 10, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null } };

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
async function docxText(buf) {
  const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml").async("string");
  return xml.replace(/<[^>]+>/g, " ");
}

(async () => {
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  // ── 1) API
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [SEL] });
  ok("plan: 1 birim", plan.j?.plan?.selections?.[0]?.unitCount === 1 && !plan.j?.plan?.selections?.[0]?.blocked, JSON.stringify(plan.j?.plan?.selections?.[0]).slice(0, 200));
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [SEL], confirmNewRequests: plan.j?.plan?.newRequestCount ?? 0 });
  const it = run.j?.results?.[0];
  const rows = it?.view?.technical?.rows ?? [];
  ok("API tarama: 7 an; 07:40'ta gün lordu Satürn → Güneş", it?.ok === true && rows.length === 7 && rows[3].dayLord === "saturn" && rows[4].dayLord === "sun", JSON.stringify(it ?? run.j).slice(0, 300));
  ok("API: yöntem = anın haritası; KP numarası alanı yok", it?.view?.technical?.method === "moment_chart" && !JSON.stringify(it?.view?.technical ?? {}).includes("kpNumber"));
  const polar = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ ...SEL, options: { ...SEL.options, placeLocationId: "gn-3133895" } }] });
  ok("kutup yeri (Tromsø): HOUSE_SYSTEM_POLAR, 0 istek", polar.j?.plan?.selections?.[0]?.blocked?.code === "HOUSE_SYSTEM_POLAR" && polar.j?.plan?.newRequestCount === 0);
  const dst = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ ...SEL, options: { ...SEL.options, atUtc: "2026-10-25T00:00", durationMinutes: 180, intervalMinutes: 30, placeLocationId: "de-berlin" } }] });
  ok("yaz/kış saati geçişi (Berlin 25.10.2026): KP_INTERVAL_OFFSET_CHANGE, 0 istek", dst.j?.plan?.selections?.[0]?.blocked?.code === "KP_INTERVAL_OFFSET_CHANGE" && dst.j?.plan?.newRequestCount === 0, JSON.stringify(dst.j?.plan?.selections?.[0]).slice(0, 200));
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: SEL.technique, options: it?.view?.options ?? SEL.options, saveRequestId: randomUUID(), includeProviderInterp: true });
  const id = sv.j?.analysisId;
  ok("kayıt", typeof id === "string", JSON.stringify(sv.j).slice(0, 200));
  const again = await api("/engine/plan", { profileId: pid, revision: 1, selections: [SEL] });
  ok("aynı seçim: 0 yeni istek (önbellek)", again.j?.plan?.newRequestCount === 0);
  for (const fmt of ["docx", "pdf"]) {
    const r = await api(`/analyses/${id}/report?format=${fmt}`, null, true);
    const buf = Buffer.from(await r.arrayBuffer());
    ok(`rapor ${fmt}: 200`, r.status === 200 && buf.length > 5000, `${r.status} ${buf.length}`);
    if (OUT) fs.writeFileSync(path.join(OUT, `kp-ruling-tarama.${fmt}`), buf);
    if (fmt === "docx" && r.status === 200) {
      const text = await docxText(buf);
      const want = ["Zaman aralığı taraması", "Değişim anları", "Tarama tablosu", "Ay zinciri 4 düzey", "KP numarası (1–249) verilmez"];
      ok(`Word: ${want.join(" · ")}`, want.every((s) => text.includes(s)) && !/roxy/i.test(text) && !text.includes("undefined"), want.filter((s) => !text.includes(s)).join(", "));
    }
  }

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  // ── 2) Seçici
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
    await page.locator("[role=tablist] button[data-system=kp]").first().click();
    await page.waitForTimeout(500);
    const card = page.locator("button[data-technique='kp.ruling_interval']").first();
    ok("seçici: KP sekmesinde 'KP ruling planets zaman taraması' kartı", await card.isVisible().catch(() => false));
    await card.click().catch(() => {});
    await page.waitForTimeout(300);
    await page.locator("[data-technique-focus='kp.ruling_interval']").first().click().catch(() => {});
    await page.waitForTimeout(800);
    const f = page.locator("[data-testid=astro-kp-ri-params]").first();
    ok("seçici: süre / adım alanları görünür", await f.isVisible().catch(() => false));
    const cnt = await page.locator("[data-testid=astro-kp-ri-count]").first().innerText().catch(() => "");
    ok("seçici: varsayılan 2 saat / 10 dk → 13 an · tek istek", cnt.includes("13 an"), cnt);
    const ft = await f.innerText().catch(() => "");
    ok("seçici: yöntem farkı notu (natal significator'lardan farklı)", ft.includes("FARKLI"), ft.slice(0, 200));
    if (OUT) await page.screenshot({ path: path.join(OUT, "kp-ri-secici-1366.png"), fullPage: true });
    await ctx.close();
  }
  // ── 3) Kayıtlı analiz
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
    const panel = page.locator("[data-testid=astro-kp-ruling-interval-panel]").first();
    await panel.waitFor({ timeout: 60000 }).catch(() => {});
    ok(`${tag}: tarama paneli görünür`, await panel.isVisible().catch(() => false));
    ok(`${tag}: yöntem uyarısı görünür`, (await page.locator("[data-testid=astro-kp-ri-method]").first().innerText().catch(() => "")).includes("natal"));
    const n = await page.locator("[data-testid=astro-kp-ri-table] tbody tr[data-kp-ri-row]").count();
    ok(`${tag}: tablo 7 satır`, n === 7, String(n));
    const chg = await page.locator("[data-testid=astro-kp-ri-changes]").first().innerText().catch(() => "");
    ok(`${tag}: değişim anlarında 07:40 gün lordu`, chg.includes("07:40") && chg.includes("gün lordu"), chg.slice(0, 200));
    await page.locator("[data-kp-ri-detail='4']").first().click().catch(() => {});
    ok(`${tag}: satır ayrıntısı (significator'lar) açılır`, (await page.locator("[data-kp-ri-detail-row='4']").first().innerText().catch(() => "")).includes("Significator"));
    const m = await page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    ok(`${tag}: yatay taşma yok (tablo kendi kutusunda kayar)`, m.dw <= m.vw + 1, JSON.stringify(m));
    const body = await page.locator("body").innerText();
    ok(`${tag}: sağlayıcı adı / 'golden' / ham uç adı yok`, !/\broxy\b|golden|fixture|ruling-planets-interval/i.test(body));
    if (OUT) await page.screenshot({ path: path.join(OUT, `kp-ri-kayitli-${tag}.png`), fullPage: true });
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
  console.log(`\nkp-ruling-interval-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
