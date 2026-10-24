// UPAGRAHA KUTUP GÜNÜ — KISMİ SONUÇ (24.10.2026): ekran + akış regresyonu (Playwright Chromium). YEREL; sahte DB + sahte sağlayıcı.
// GERÇEK sağlayıcı çağrılmaz: dev-fake-backend, ürün konum verisindeki Tromsø (gn-3133895, 69,6489°K) için 2024-06-21 12:00 kutup günü
// GERÇEK yanıtını (fixtures/golden/vedic-upagraha-kutup-tromso.json; zaman tabanlı liste boş, 5 Güneş türevli nokta) BİREBİR gövdeyle döndürür.
// Önkoşul / çalıştırma: vedik-noktalar-ui.e2e.cjs ile aynı (yerel next + dev-fake-backend).
//   node scripts/astrology/upagraha-kutup-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   1) API: profil (Ali Örnek danışanı, Tromsø kutup günü) → Upagraha 1 istek, KABUL, kısmi işaret, 0 + 5 nokta; tekrar 0 istek;
//      kaydet → Word / PDF (kısmi not var, zaman tabanlı tablo yok)
//   2) Kayıtlı analiz 1366×768 + 768×1024 + 390×844: "Kısmi sonuç" rozeti + not görünür, zaman tabanlı tablo YOK, Güneş türevli 5 satır,
//      yatay taşma yok, Word/PDF iner; sağlayıcı adı / iç jargon yok.   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
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
const JARGON = /\broxy\b|golden|fixture|şema-örneği|\/vedic-astrology\//i;
const NOTE = "doğum gününde bu yerde güneş doğmadığı ya da batmadığı için";

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
  // ── 1) API
  const pr = await api("/profiles", { label: "Kutup günü örnek — Tromsø", clientId: "11111111-1111-4111-8111-111111111111", birthDate: "2024-06-21", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: "gn-3133895" });
  const pid = pr.j?.profile?.id;
  ok("profil: Tromsø (gn-3133895) kutup günü", typeof pid === "string", JSON.stringify(pr.j).slice(0, 200));
  const sel = { technique: "vedic.upagraha", options: { ayanamsa: "lahiri" } };
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [sel] });
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [sel], confirmNewRequests: plan.j?.plan?.newRequestCount ?? 0 });
  const it = run.j?.results?.[0];
  const t = it?.view?.technical;
  ok("API: 1 istek; sonuç KABUL; kısmi işaret; zaman tabanlı 0, Güneş türevli 5 (GERÇEK yanıt)", plan.j?.plan?.newRequestCount === 1 && it?.ok === true && t?.partial?.reason === "sun_does_not_rise_or_set" && t?.timeBased?.length === 0 && t?.sunBased?.length === 5, JSON.stringify(it ?? run.j).slice(0, 300));
  const again = await api("/engine/plan", { profileId: pid, revision: 1, selections: [sel] });
  ok("aynı seçim: 0 yeni istek (önbellek)", again.j?.plan?.newRequestCount === 0, JSON.stringify(again.j?.plan).slice(0, 200));
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: sel.technique, options: it?.view?.options ?? sel.options, saveRequestId: randomUUID(), includeProviderInterp: true });
  const aid = sv.j?.analysisId;
  ok("kayıt", typeof aid === "string", JSON.stringify(sv.j).slice(0, 200));
  for (const fmt of ["docx", "pdf"]) {
    const r = await api(`/analyses/${aid}/report?format=${fmt}`, null, true);
    const buf = Buffer.from(await r.arrayBuffer());
    ok(`rapor ${fmt}: 200`, r.status === 200 && buf.length > 5000, `${r.status} ${buf.length}`);
    if (OUT) fs.writeFileSync(path.join(OUT, `kutup.${fmt}`), buf);
    if (fmt === "docx" && r.status === 200) {
      const text = await docxText(buf);
      const want = ["Upagrahalar — hesaplanan duyarlı noktalar", "Kısmi sonuç", NOTE, "Güneş türevli (Aprakasha / Dhuma grubu)", "Dhuma", "Upaketu"];
      ok(`Word: ${want.join(" · ")}; zaman tabanlı tablo yok`, want.every((x) => text.includes(x)) && !text.includes("Zaman tabanlı (Kala-velā / Gulika türü)") && !JARGON.test(text) && !text.includes("undefined"), want.filter((x) => !text.includes(x)).join(", "));
    }
  }

  // ── 2) Kayıtlı analiz — 1366×768, 768×1024, 390×844
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const [w, hh] of [
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    const tag = `${w}x${hh}`;
    const { ctx, page } = await newPage(browser, w, hh);
    await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
    const item = page.locator(`[data-saved-item="${aid}"]`);
    await item.waitFor({ timeout: 120000 }).catch(() => {});
    ok(`${tag}: kayıt danışan dosyasında görünür`, await item.isVisible().catch(() => false));
    await item.click().catch(() => {});
    const sec = page.locator("[data-testid=astro-upagraha-panel]").first();
    await sec.waitFor({ timeout: 60000 }).catch(() => {});
    ok(`${tag}: panel görünür`, await sec.isVisible().catch(() => false));
    ok(`${tag}: "Kısmi sonuç" rozeti + not görünür`, (await page.locator("[data-testid=astro-upagraha-partial-badge]").first().isVisible().catch(() => false)) && (await page.locator("[data-testid=astro-upagraha-partial]").first().innerText().catch(() => "")).includes(NOTE));
    ok(`${tag}: zaman tabanlı tablo YOK; Güneş türevli 5 satır`, (await page.locator("[data-testid=astro-upagraha-time]").count()) === 0 && (await page.locator("[data-testid=astro-upagraha-sun] tbody tr").count()) === 5);
    const m = await page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    ok(`${tag}: yatay taşma yok`, m.dw <= m.vw + 1, JSON.stringify(m));
    const body = await page.locator("body").innerText();
    ok(`${tag}: sağlayıcı adı / iç jargon yok`, !JARGON.test(body));
    if (OUT) await page.screenshot({ path: path.join(OUT, `kutup-${tag}.png`), fullPage: true });
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
  console.log(`\nupagraha-kutup-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
