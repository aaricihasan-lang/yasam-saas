// ATLAS — DEKLİNASYON PARALELLERİ (aylık; 2026-10-22): ekran + akış regresyonu (Playwright Chromium). YEREL; sahte DB + sahte sağlayıcı.
// GERÇEK sağlayıcı YOK ve bu uç için GERÇEK golden YOK: sahte arka uç FAKE_ROXY_SCHEMA_EXAMPLES=1 ile yalnız BİREBİR gövdeye
// OpenAPI ŞEMA-ÖRNEĞİ yanıtını döner (fixtures/schema/declination-parallels-monthly.json; gerçek yanıt DEĞİL — tek olay, biçim örneği).
// Tohum: "Ali Örnek — natal" (sentetik A, İstanbul).
// Önkoşul: yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>,
//          ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2) + dev-fake-backend
//          (FAKE_ROXY_SCHEMA_EXAMPLES=1).
// Çalıştırma: node scripts/astrology/declination-parallels-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   1) API: Mart 2026 · orb 1,5° · gerçek düğüm → 1 istek; 1 temas (Venüs ∥ Satürn); aynı seçim 0 istek; gösterim saat dilimi
//      değişince 0 istek; kaydet → aç (0 istek) → Word / PDF 200 + içerik (UTC + yerel saat, yöntem; sağlayıcı adı / ham uç yok)
//   2) Seçici (1366×768): Batı sekmesinde teknik; ay / orb / saat dilimi alanları; açıklama
//   3) Kayıtlı analiz 1366×768 + 768×1024 + 390×844: özet, filtreler, ay şeridi, tablo; filtre "Kontraparalel" → 0 satır notu;
//      yatay taşma yok; Word/PDF iner; sağlayıcı adı / iç jargon yok.   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
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
const JARGON = /\broxy\b|golden|fixture|parallels\/monthly|Saturno/i;

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
  return xml.replace(/<[^>]+>/g, " ").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

(async () => {
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  // ── 1) API
  const sel = { technique: "western.declination_parallels", options: { month: "2026-03", orb: 1.5, nodeType: "true", displayTz: "Europe/Istanbul" } };
  const r = await runSel(pid, sel);
  ok("API plan: 1 yeni istek", r.plan.j?.plan?.newRequestCount === 1, JSON.stringify(r.plan.j?.plan ?? r.plan.j).slice(0, 300));
  const t = r.it?.view?.technical;
  ok("API: 1 temas (Venüs ∥ Satürn, 14.03.2026 09:42 UTC)", r.it?.ok === true && t?.contacts?.length === 1 && t.contacts[0].a === "venus" && t.contacts[0].b === "saturn" && t.contacts[0].exactUtc === "2026-03-14T09:42Z", JSON.stringify(r.it ?? r.run.j).slice(0, 300));
  ok("API: yanıtta sağlayıcı yerelleştirilmiş metni yok", !JSON.stringify(r.run.j ?? {}).includes("Saturno"));
  const again = await api("/engine/plan", { profileId: pid, revision: 1, selections: [sel, { ...sel, options: { ...sel.options, displayTz: "America/New_York" } }] });
  ok("aynı ay + orb (gösterim saat dilimi farklı): 0 yeni istek", again.j?.plan?.newRequestCount === 0, JSON.stringify(again.j?.plan).slice(0, 200));
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: sel.technique, options: r.it?.view?.options ?? sel.options, saveRequestId: randomUUID(), includeProviderInterp: true });
  const id = sv.j?.analysisId;
  ok("kayıt", typeof id === "string", JSON.stringify(sv.j).slice(0, 200));
  const an = await api(`/analyses/${id}`);
  ok("kayıtlı analiz: teknik veri + gösterim saat dilimi", an.j?.analysis?.technical?.contacts?.length === 1 && an.j.analysis.params?.displayTz === "Europe/Istanbul");
  const want = ["Deklinasyon paralelleri — Mart 2026", "14.03.2026 09:42 UTC", "14.03.2026 12:42", "Paralel", "Venüs", "Satürn", "−12,4183°", "Yöntem: deklinasyon paralelleri", "Ay dahil değildir"];
  for (const fmt of ["docx", "pdf"]) {
    const rr = await api(`/analyses/${id}/report?format=${fmt}`, null, true);
    const buf = Buffer.from(await rr.arrayBuffer());
    ok(`rapor ${fmt}: 200`, rr.status === 200 && buf.length > 5000, `${rr.status} ${buf.length}`);
    if (OUT) fs.writeFileSync(path.join(OUT, `deklinasyon.${fmt}`), buf);
    if (fmt === "docx" && rr.status === 200) {
      const text = await docxText(buf);
      ok(`Word: ${want.join(" · ")}`, want.every((x) => text.includes(x)) && !JARGON.test(text) && !text.includes("undefined"), want.filter((x) => !text.includes(x)).join(", "));
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
    await page.locator("[role=tablist] button[data-system=western]").first().click();
    await page.waitForTimeout(500);
    const id0 = "western.declination_parallels";
    ok("seçici: teknik Batı sekmesinde", await page.locator(`button[data-technique='${id0}']`).first().isVisible().catch(() => false));
    await page.locator(`button[data-technique='${id0}']`).first().click();
    await page.waitForTimeout(300);
    await page.locator(`[data-technique-focus='${id0}']`).first().click();
    await page.waitForTimeout(800);
    ok("seçici: ay + orb + saat dilimi alanları", (await page.locator("[data-testid=astro-declination-params] [data-dp=month]").first().isVisible().catch(() => false)) && (await page.locator("[data-testid=astro-declination-params] [data-dp=orb] option").count()) === 3);
    const note = await page.locator("[data-testid=astro-declination-month-note]").first().innerText().catch(() => "");
    ok("seçici: ay notu (tek istek, UTC)", note.includes("tek istek") && note.includes("UTC"), note);
    const body = await page.locator("body").innerText();
    ok("seçici: sağlayıcı adı / iç jargon yok", !JARGON.test(body));
    if (OUT) await page.screenshot({ path: path.join(OUT, "secici-1366.png"), fullPage: true });
    await ctx.close();
  }

  // ── 3) Kayıtlı analiz — 1366×768, 768×1024, 390×844
  for (const [w, h] of [
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    const tag = `${w}x${h}`;
    const { ctx, page } = await newPage(browser, w, h);
    await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
    const item = page.locator(`[data-saved-item="${id}"]`);
    await item.waitFor({ timeout: 120000 }).catch(() => {});
    ok(`${tag}: kayıt danışan dosyasında görünür`, await item.isVisible().catch(() => false));
    await item.click().catch(() => {});
    const sec = page.locator("[data-testid=astro-declination-panel]").first();
    await sec.waitFor({ timeout: 60000 }).catch(() => {});
    ok(`${tag}: panel görünür`, await sec.isVisible().catch(() => false));
    const summary = await page.locator("[data-testid=astro-declination-summary]").first().innerText().catch(() => "");
    ok(`${tag}: özet 1 temas`, summary.startsWith("1 temas"), summary);
    ok(`${tag}: tablo 1 satır (paralel)`, (await page.locator("[data-testid=astro-declination-table] tbody tr[data-dp-row=parallel]").count()) === 1);
    ok(`${tag}: ay şeridi 31 gün`, (await page.locator("[data-testid=astro-declination-strip] li").count()) === 31);
    const tableText = await page.locator("[data-testid=astro-declination-table]").first().innerText().catch(() => "");
    ok(`${tag}: UTC + yerel saat sütunu`, tableText.includes("14.03.2026 09:42") && tableText.includes("14.03.2026 12:42"), tableText.slice(0, 200));
    await page.locator("[data-dp-filter=type]").first().selectOption("contraparallel");
    await page.waitForTimeout(300);
    ok(`${tag}: filtre kontraparalel → 0 / 1`, (await page.locator("[data-testid=astro-declination-count]").first().innerText().catch(() => "")).startsWith("0 / 1"));
    await page.locator("[data-dp-filter=type]").first().selectOption("all");
    ok(`${tag}: yöntem + kapsam metni`, (await page.locator("[data-testid=astro-declination-method]").first().isVisible().catch(() => false)) && (await page.locator("[data-testid=astro-declination-scope]").first().isVisible().catch(() => false)));
    const m = await page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    ok(`${tag}: yatay taşma yok`, m.dw <= m.vw + 1, JSON.stringify(m));
    const body = await page.locator("body").innerText();
    ok(`${tag}: sağlayıcı adı / iç jargon yok`, !JARGON.test(body));
    if (OUT) await page.screenshot({ path: path.join(OUT, `kayitli-${tag}.png`), fullPage: true });
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
  console.log(`\ndeclination-parallels-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
