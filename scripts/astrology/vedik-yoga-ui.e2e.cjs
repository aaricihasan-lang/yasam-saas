// ATLAS ROXY KALAN (2026-10-22) — Vedik YOGA denetim tablosu (D1 içinde): ekran + akış regresyonu (Playwright Chromium). YEREL;
// sahte DB + sahte sağlayıcı (KATI mod: dev-fake-backend strictMatch yalnız BİREBİR gövdeye D1 gerçek yanıtını döndürür).
// GERÇEK sağlayıcı YOK. Ayrı yoga isteği YOKTUR: yoga tablosu kayıtlı D1 verisinden türetilir (tespit ucu MÜKERRER).
// Tohum: "Ali Örnek — natal" (sentetik A, İstanbul).
// Önkoşul: yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>,
//          ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2) + dev-fake-backend.
// Çalıştırma: node scripts/astrology/vedik-yoga-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   1) API: D1 plan ≤1 istek (yalnız D1 ucu) → çalıştır → aynı seçim 0 istek; kaydet → aç (0 istek); Word / PDF 200 + yoga
//      işaretleri (Yoga denetim tablosu, Oluşum kuralı, Bağımsız denetim, Ruchaka, Pasha, Raja Yoga notu); sağlayıcı adı yok
//   2) Kayıtlı D1 analizi 1366×768 + 768×1024 + 390×844: yoga tablosu görünür; varsayılan görünüm 5 kart (oluşan/bastırılan);
//      "Tüm denetimler" 48 kart; Ruchaka "Oluşuyor" + "Uyumlu"; Raja sözlük notu; uyuşmazlık 0; yatay taşma yok; Word/PDF iner.
//   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
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
const api = async (p, b, raw = false, method = null) => {
  const r = await fetch(`${API}${p}`, { method: method ?? (b ? "POST" : "GET"), headers: H, body: b ? JSON.stringify(b) : undefined });
  if (raw) return r;
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return { s: r.status, j };
};
const JARGON = /\broxy\b|golden|fixture|\/vedic-astrology\//i;

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
  return xml.replace(/<[^>]+>/g, " ").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

(async () => {
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  // ── 1) API
  const sel = { technique: "vedic.d1", options: { ayanamsa: "lahiri" } };
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [sel] });
  const n = plan.j?.plan?.newRequestCount;
  ok("API D1 plan: en çok 1 yeni istek (ayrı yoga isteği yok)", n === 0 || n === 1, JSON.stringify(plan.j?.plan ?? plan.j).slice(0, 300));
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [sel], confirmNewRequests: n ?? 0 });
  const it = run.j?.results?.[0];
  const yogas = it?.view?.technical?.yogas ?? [];
  ok("API D1: 48 yoga denetimi; oluşan 5 (Sunapha, Chandra Mangala, Ruchaka, Daridra, Pasha)", it?.ok === true && yogas.length === 48 && yogas.filter((y) => y.present).map((y) => y.id).join(",") === "sunapha,chandramangala,ruchaka,daridra,pasa", JSON.stringify(it ?? run.j).slice(0, 300));
  const again = await api("/engine/plan", { profileId: pid, revision: 1, selections: [sel] });
  ok("aynı seçim: 0 yeni istek (önbellek)", again.j?.plan?.newRequestCount === 0, JSON.stringify(again.j?.plan).slice(0, 200));
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: sel.technique, options: it?.view?.options ?? sel.options, saveRequestId: randomUUID(), includeProviderInterp: true });
  const aid = sv.j?.analysisId;
  ok("kayıt D1", typeof aid === "string", JSON.stringify(sv.j).slice(0, 200));
  const an = await api(`/analyses/${aid}`);
  ok("kayıtlı D1 açılır (48 yoga)", an.j?.analysis?.technical?.yogas?.length === 48);
  const after = await api("/engine/plan", { profileId: pid, revision: 1, selections: [sel] });
  ok("arşivden açma sonrası: 0 yeni istek", after.j?.plan?.newRequestCount === 0);
  const want = ["Yoga denetim tablosu", "Oluşum kuralı", "İlgili graha · bhava", "Bağımsız denetim", "Ruchaka", "Pasha", "Raja Yoga", "Ekol notları"];
  for (const fmt of ["docx", "pdf"]) {
    const r = await api(`/analyses/${aid}/report?format=${fmt}`, null, true);
    const buf = Buffer.from(await r.arrayBuffer());
    ok(`rapor D1 ${fmt}: 200`, r.status === 200 && buf.length > 5000, `${r.status} ${buf.length}`);
    if (OUT) fs.writeFileSync(path.join(OUT, `d1-yoga.${fmt}`), buf);
    if (fmt === "docx" && r.status === 200) {
      const text = await docxText(buf);
      ok(`Word D1: ${want.join(" · ")}`, want.every((x) => text.includes(x)) && !JARGON.test(text) && !text.includes("undefined"), want.filter((x) => !text.includes(x)).join(", "));
    }
  }

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  // ── 2) Kayıtlı D1 — 1366×768, 768×1024, 390×844
  for (const [w, h] of [
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    const tag = `${w}x${h}`;
    const { ctx, page } = await newPage(browser, w, h);
    await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
    const item = page.locator(`[data-saved-item="${aid}"]`);
    await item.waitFor({ timeout: 120000 }).catch(() => {});
    ok(`${tag}: kayıt danışan dosyasında görünür`, await item.isVisible().catch(() => false));
    await item.click().catch(() => {});
    const sec = page.locator("[data-testid=astro-vedic-yoga-table]").first();
    await sec.waitFor({ timeout: 60000 }).catch(() => {});
    ok(`${tag}: yoga denetim tablosu görünür (D1 paneli içinde)`, (await sec.isVisible().catch(() => false)) && (await page.locator("[data-testid=astro-vedic-d1-panel] [data-testid=astro-vedic-yoga-table]").count()) === 1);
    const formed = await sec.locator("[data-yoga-id]").count();
    ok(`${tag}: varsayılan görünüm 5 kart (oluşan/bastırılan)`, formed === 5, String(formed));
    const ru = sec.locator("[data-yoga-id=ruchaka]").first();
    ok(`${tag}: Ruchaka Oluşuyor + Uyumlu + Mars 7. ev`, (await ru.getAttribute("data-yoga-status")) === "present" && (await ru.getAttribute("data-yoga-check")) === "consistent" && (await ru.innerText().catch(() => "")).includes("Mars"));
    await sec.locator("[data-yoga-filter=all]").first().click().catch(() => {});
    await page.waitForTimeout(300);
    const all = await sec.locator("[data-yoga-id]").count();
    ok(`${tag}: "Tüm denetimler" 48 kart`, all === 48, String(all));
    ok(`${tag}: uyuşmazlık 0`, (await sec.locator("[data-yoga-check=inconsistent]").count()) === 0);
    const txt = await sec.innerText().catch(() => "");
    ok(`${tag}: oluşum kuralı + sözlük notu (Raja Yoga hesaplanmış gösterilmez)`, txt.includes("Oluşum kuralı") && txt.includes("Raja Yoga") && (await sec.locator("[data-yoga-id=raja]").count()) === 0);
    const m = await page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    ok(`${tag}: yatay taşma yok`, m.dw <= m.vw + 1, JSON.stringify(m));
    const body = await page.locator("body").innerText();
    ok(`${tag}: sağlayıcı adı / iç jargon yok`, !JARGON.test(body));
    if (OUT) await page.screenshot({ path: path.join(OUT, `d1-yoga-${tag}.png`), fullPage: true });
    for (const [tid, ext, magic] of [["astro-report-docx", "docx", "PK"], ["astro-report-pdf", "pdf", "%PDF-"]]) {
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
  console.log(`\nvedik-yoga-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
