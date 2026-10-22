// VEDİK NOKTALAR (22.10.2026) — Upagrahalar + Graha Asta / Udaya: ekran + akış regresyonu (Playwright Chromium). YEREL; sahte DB + sahte
// sağlayıcı. GERÇEK sağlayıcı YOK ve bu iki uç için GERÇEK yanıt da YOK: dev-fake-backend FAKE_SCHEMA_FIXTURES=1 ile ŞEMA-ÖRNEĞİ
// fixture'larını (scripts/astrology/fixtures/schema; gerçek yanıt DEĞİL) yalnız BİREBİR gövdeyle döndürür. Vedik D1 golden'ı gerçektir.
// Tohum: "Ali Örnek — natal" (sentetik A, İstanbul) + "Saat bilinmeyen" profil.
// Önkoşul: yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>, ROXY_API_KEY=local-fake-roxy-key,
//          ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2) + dev-fake-backend (FAKE_SCHEMA_FIXTURES=1).
// Çalıştırma: node scripts/astrology/vedik-noktalar-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   1) API: Vedik D1 (gerçek golden) → Upagraha 1 istek (ev sütunu D1'den, 0 ek istek); Heliakal 1 istek (doğum günü + doğum yeri);
//      aynı seçim 0 istek; saatsiz profil: Upagraha TIME_REQUIRED (0 istek), Heliakal hesaplanır; kaydet → aç (0 istek) → Word / PDF
//   2) Seçici (1366×768): Vedik sekmesinde iki teknik; Heliakal'da gün + gözlem yeri alanı
//   3) Kayıtlı analiz 1366×768 + 768×1024 + 390×844: iki upagraha tablosu (6 + 5), heliakal tablo (6 graha), yatay taşma yok,
//      Word/PDF iner; sağlayıcı adı / iç jargon yok.   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
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
const JARGON = /\broxy\b|golden|fixture|şema-örneği|\/vedic-astrology\//i;

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
  const ids = {};
  // ── 1) API
  const d1 = await runSel(pid, { technique: "vedic.d1", options: { ayanamsa: "lahiri" } });
  ok("API Vedik D1 (bağlam için)", d1.it?.ok === true, JSON.stringify(d1.it ?? d1.run.j).slice(0, 200));
  const uSel = { technique: "vedic.upagraha", options: { ayanamsa: "lahiri" } };
  const hSel = { technique: "vedic.heliacal", options: { date: null, placeLocationId: null } };
  const u = await runSel(pid, uSel);
  const ut = u.it?.view?.technical;
  ok("API Upagraha: 1 istek; 6 + 5 nokta; D1'den ev (Gulika 2. ev), Güneş tutarlı", u.plan.j?.plan?.newRequestCount === 1 && u.it?.ok === true && ut?.timeBased?.length === 6 && ut?.sunBased?.length === 5 && ut?.d1?.sunConsistent === true && ut.timeBased.find((p) => p.id === "gulika")?.house === 2, JSON.stringify(u.it ?? u.run.j).slice(0, 300));
  const h = await runSel(pid, hSel);
  const ht = h.it?.view?.technical;
  ok("API Heliakal: 1 istek; 6 graha; Jüpiter astada; gün 1990-07-15; ofset +3", h.plan.j?.plan?.newRequestCount === 1 && h.it?.ok === true && ht?.grahas?.length === 6 && ht.grahas.find((g) => g.id === "jupiter")?.visible === false && ht.date === "1990-07-15" && ht.place?.utcOffsetHours === 3, JSON.stringify(h.it ?? h.run.j).slice(0, 300));
  const again = await api("/engine/plan", { profileId: pid, revision: 1, selections: [uSel, hSel] });
  ok("aynı seçimler: 0 yeni istek (önbellek)", again.j?.plan?.newRequestCount === 0, JSON.stringify(again.j?.plan).slice(0, 200));
  const noTime = (await api(`/profiles?q=${encodeURIComponent("Saat bilinmeyen")}`)).j.profiles[0].id;
  const nt = await api("/engine/plan", { profileId: noTime, revision: 1, selections: [uSel] });
  ok("saatsiz profil: Upagraha TIME_REQUIRED, 0 istek", nt.j?.plan?.selections?.[0]?.blocked?.code === "TIME_REQUIRED" && nt.j?.plan?.newRequestCount === 0, JSON.stringify(nt.j?.plan?.selections?.[0] ?? nt.j).slice(0, 200));
  const ntH = await api("/engine/plan", { profileId: noTime, revision: 1, selections: [hSel] });
  ok("saatsiz profil: Heliakal engellenmez (doğum anı kullanılmaz)", ntH.j?.plan?.selections?.[0]?.blocked == null, JSON.stringify(ntH.j?.plan?.selections?.[0] ?? ntH.j).slice(0, 200));
  for (const [key, sel, it] of [["upa", uSel, u.it], ["hel", hSel, h.it]]) {
    const sv = await api("/analyses", { profileId: pid, revision: 1, technique: sel.technique, options: it?.view?.options ?? sel.options, saveRequestId: randomUUID(), includeProviderInterp: true });
    ids[key] = sv.j?.analysisId;
    ok(`kayıt ${key}`, typeof ids[key] === "string", JSON.stringify(sv.j).slice(0, 200));
  }
  for (const [key, want] of [
    ["upa", ["Upagrahalar — hesaplanan duyarlı noktalar", "Zaman tabanlı (Kala-velā / Gulika türü)", "Güneş türevli (Aprakasha / Dhuma grubu)", "fiziksel gök cismi değildir", "Otomatik yorum yok"]],
    ["hel", ["Graha Asta / Udaya — 15.07.1990", "Udaya (heliakal doğuş)", "Surya Siddhanta", "yanık (asta)", "Otomatik yorum yok"]],
  ]) {
    for (const fmt of ["docx", "pdf"]) {
      const r = await api(`/analyses/${ids[key]}/report?format=${fmt}`, null, true);
      const buf = Buffer.from(await r.arrayBuffer());
      ok(`rapor ${key} ${fmt}: 200`, r.status === 200 && buf.length > 5000, `${r.status} ${buf.length}`);
      if (OUT) fs.writeFileSync(path.join(OUT, `${key}.${fmt}`), buf);
      if (fmt === "docx" && r.status === 200) {
        const text = await docxText(buf);
        ok(`Word ${key}: ${want.join(" · ")}`, want.every((x) => text.includes(x)) && !JARGON.test(text) && !text.includes("undefined"), want.filter((x) => !text.includes(x)).join(", "));
      }
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
    for (const id of ["vedic.upagraha", "vedic.heliacal"]) ok(`seçici: ${id} Vedik sekmesinde`, await page.locator(`button[data-technique='${id}']`).first().isVisible().catch(() => false));
    await page.locator("button[data-technique='vedic.heliacal']").first().click();
    await page.waitForTimeout(300);
    await page.locator("[data-technique-focus='vedic.heliacal']").first().click();
    await page.waitForTimeout(800);
    ok("seçici Heliakal: gün + gözlem yeri alanı", (await page.locator("[data-testid=astro-heliacal-params]").first().isVisible().catch(() => false)) && (await page.locator("input[aria-label='Heliakal değerlendirme günü']").first().isVisible().catch(() => false)));
    const body = await page.locator("body").innerText();
    ok("seçici: sağlayıcı adı / iç jargon yok", !JARGON.test(body));
    if (OUT) await page.screenshot({ path: path.join(OUT, "secici-1366.png"), fullPage: true });
    await ctx.close();
  }

  // ── 3) Kayıtlı analizler — 1366×768, 768×1024, 390×844
  for (const [w, hh] of [
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    const tag = `${w}x${hh}`;
    const { ctx, page } = await newPage(browser, w, hh);
    for (const [key, testid] of [["upa", "astro-upagraha-panel"], ["hel", "astro-heliacal-panel"]]) {
      await page.goto("about:blank");
      await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
      const item = page.locator(`[data-saved-item="${ids[key]}"]`);
      await item.waitFor({ timeout: 120000 }).catch(() => {});
      ok(`${tag} ${key}: kayıt danışan dosyasında görünür`, await item.isVisible().catch(() => false));
      await item.click().catch(() => {});
      const sec = page.locator(`[data-testid=${testid}]`).first();
      await sec.waitFor({ timeout: 60000 }).catch(() => {});
      ok(`${tag} ${key}: panel görünür`, await sec.isVisible().catch(() => false));
      if (key === "upa") {
        ok(`${tag} upa: iki tablo 6 + 5 satır`, (await page.locator("[data-testid=astro-upagraha-time] tbody tr").count()) === 6 && (await page.locator("[data-testid=astro-upagraha-sun] tbody tr").count()) === 5);
        const txt = await sec.innerText().catch(() => "");
        ok(`${tag} upa: gök cismi değil notu + ev sütunu`, txt.includes("fiziksel gök cismi değildir") && txt.includes("2. ev"), txt.slice(0, 200));
      } else {
        ok(`${tag} hel: 6 graha satırı; Jüpiter astada`, (await page.locator("[data-testid=astro-heliacal-table] tbody tr").count()) === 6 && (await page.locator("[data-heliacal=jupiter] [data-heliacal-state=asta]").count()) === 1);
      }
      const m = await page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
      ok(`${tag} ${key}: yatay taşma yok`, m.dw <= m.vw + 1, JSON.stringify(m));
      const body = await page.locator("body").innerText();
      ok(`${tag} ${key}: sağlayıcı adı / iç jargon yok`, !JARGON.test(body));
      if (OUT) await page.screenshot({ path: path.join(OUT, `kayitli-${key}-${tag}.png`), fullPage: true });
      for (const [tid, ext, magic] of [["astro-report-docx", "docx", "PK"], ["astro-report-pdf", "pdf", "%PDF-"]]) {
        const b = page.locator(`[data-testid=${tid}]`).first();
        if (!(await b.isVisible().catch(() => false))) {
          ok(`${tag} ${key}: ${ext} düğmesi görünür`, false);
          continue;
        }
        const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), b.click()]);
        const buf = fs.readFileSync(await dl.path());
        ok(`${tag} ${key}: ${ext} iner ve geçerli`, buf.subarray(0, magic.length).toString() === magic && buf.length > 5000, `${buf.length}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\nvedik-noktalar-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
