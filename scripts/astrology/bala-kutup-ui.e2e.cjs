// SHADBALA / BHAVA BALA KUTUP GÜNÜ UYARISI (24.10.2026): ekran + akış regresyonu (Playwright Chromium). YEREL; sahte DB + sahte sağlayıcı.
// GERÇEK sağlayıcı çağrılmaz: dev-fake-backend (katı kip), ürün konum verisindeki Tromsø (gn-3133895) için 2024-06-21 12:00 kutup günü
// GERÇEK Shadbala ve Bhava Bala yanıtlarını (fixtures/golden/vedic-*-kutup-tromso.json) BİREBİR gövdeyle döndürür. Kontrol: Ali Örnek
// (İstanbul 1990, mevcut golden) — uyarı YOK.
//   node scripts/astrology/bala-kutup-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   1) API: Tromsø profili → Shadbala + Bhava Bala (1'er istek, KABUL; teknik veride kutup alanı YOK), kaydet → Word/PDF uyarı VAR;
//      İstanbul kontrolü → Word/PDF uyarı YOK
//   2) Çalışma alanı 1366×768: Tromsø canlı sonuç → uyarı görünür (Shadbala)
//   3) Kayıtlı analiz 1366×768 + 768×1024 + 390×844: Tromsø Shadbala + Bhava Bala → uyarı + panel; İstanbul → uyarı yok, panel var;
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
const PROBE = "klasik tanımla hesaplanamaz";
const SELS = { shadbala: { technique: "vedic.shadbala", options: { ayanamsa: "lahiri" } }, bala: { technique: "vedic.bhava_bala", options: { ayanamsa: "lahiri" } } };
const PANEL = { shadbala: "astro-vedic-shadbala-panel", bala: "astro-vedic-bhava-bala-panel" };

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
  return xml.replace(/<[^>]+>/g, " ").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
}
async function runSave(pid, sel) {
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [sel] });
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [sel], confirmNewRequests: plan.j?.plan?.newRequestCount ?? 0 });
  const it = run.j?.results?.[0];
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: sel.technique, options: it?.view?.options ?? sel.options, saveRequestId: randomUUID(), includeProviderInterp: true });
  return { plan, it, aid: sv.j?.analysisId };
}

(async () => {
  // ── 1) API
  // Kontrol profili Tromsø profili OLUŞTURULMADAN önce seçilir (aynı danışana bağlı yeni profil aramada önce gelebilir).
  const ali = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j?.profiles?.[0]?.id;
  const aliD = ali ? await api(`/profiles/${ali}`) : null;
  const aliRev = aliD?.j?.profile?.revisions?.[0] ?? aliD?.j?.revisions?.[0] ?? null;
  ok("kontrol profili: Ali Örnek (İstanbul 1990-07-15)", typeof ali === "string" && (!aliRev || aliRev.birthDate === "1990-07-15"), JSON.stringify(aliRev ?? aliD?.j ?? {}).slice(0, 160));
  const pr = await api("/profiles", { label: "Kutup günü örnek — Tromsø (bala)", clientId: "11111111-1111-4111-8111-111111111111", birthDate: "2024-06-21", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: "gn-3133895" });
  const pid = pr.j?.profile?.id;
  ok("profil: Tromsø (gn-3133895) kutup günü; kontrolden farklı", typeof pid === "string" && pid !== ali, JSON.stringify(pr.j).slice(0, 200));
  const ids = { polar: {}, ctrl: {} };
  for (const [key, sel] of Object.entries(SELS)) {
    const p = await runSave(pid, sel);
    ok(`API Tromsø ${key}: 1 istek, KABUL, teknik veride kutup alanı yok`, p.plan.j?.plan?.newRequestCount === 1 && p.it?.ok === true && !JSON.stringify(p.it?.view?.technical ?? {}).includes("polar"), JSON.stringify(p.it ?? p.plan.j).slice(0, 240));
    ids.polar[key] = p.aid;
    const c = await runSave(ali, sel);
    ok(`API İstanbul ${key}: 0/1 istek, KABUL; Tromsø sonucundan farklı`, (c.plan.j?.plan?.newRequestCount ?? -1) <= 1 && c.it?.ok === true && c.it?.view?.id !== p.it?.view?.id, JSON.stringify(c.it ?? c.plan.j).slice(0, 240));
    ids.ctrl[key] = c.aid;
    for (const [grp, aid, want] of [["Tromsø", p.aid, true], ["İstanbul", c.aid, false]]) {
      for (const fmt of ["docx", "pdf"]) {
        const r = await api(`/analyses/${aid}/report?format=${fmt}`, null, true);
        const buf = Buffer.from(await r.arrayBuffer());
        ok(`rapor ${grp} ${key} ${fmt}: 200`, r.status === 200 && buf.length > 5000, `${r.status} ${buf.length}`);
        if (OUT) fs.writeFileSync(path.join(OUT, `${grp === "Tromsø" ? "kutup" : "kontrol"}-${key}.${fmt}`), buf);
        if (fmt === "docx" && r.status === 200) {
          const text = await docxText(buf);
          ok(`Word ${grp} ${key}: uyarı ${want ? "VAR" : "YOK"}; jargon yok`, text.includes(PROBE) === want && !JARGON.test(text) && !text.includes("undefined"));
        }
      }
    }
  }
  const again = await api("/engine/plan", { profileId: pid, revision: 1, selections: Object.values(SELS) });
  ok("aynı seçim: 0 yeni istek (önbellek)", again.j?.plan?.newRequestCount === 0, JSON.stringify(again.j?.plan).slice(0, 200));

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  // ── 2) Çalışma alanı (canlı sonuç) 1366×768
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
    await page.locator("button[data-technique='vedic.shadbala']").first().click();
    await page.waitForTimeout(300);
    await page.locator("[data-testid=astro-run]").first().click();
    const panel = page.locator(`[data-testid=${PANEL.shadbala}]`).first();
    await panel.waitFor({ timeout: 120000 }).catch(() => {});
    ok("çalışma alanı: Shadbala paneli", await panel.isVisible().catch(() => false));
    const n = page.locator("[data-testid=astro-bala-polar-notice]").first();
    ok("çalışma alanı: kutup uyarısı görünür", (await n.isVisible().catch(() => false)) && (await n.innerText().catch(() => "")).includes(PROBE));
    const m = await page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    ok("çalışma alanı 1366: yatay taşma yok", m.dw <= m.vw + 1, JSON.stringify(m));
    if (OUT) await page.screenshot({ path: path.join(OUT, "kutup-shadbala-calisma-1366.png"), fullPage: true });
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
    for (const [grp, prof, set, want] of [["Tromsø", pid, ids.polar, true], ["İstanbul", ali, ids.ctrl, false]]) {
      for (const key of Object.keys(SELS)) {
        await page.goto("about:blank");
        await page.goto(`${ORIGIN}/admin/astroloji#danisan/${prof}`, { waitUntil: "load", timeout: 240000 });
        const item = page.locator(`[data-saved-item="${set[key]}"]`);
        await item.waitFor({ timeout: 120000 }).catch(() => {});
        ok(`${tag} ${grp} ${key}: kayıt danışan dosyasında görünür`, await item.isVisible().catch(() => false));
        await item.click().catch(() => {});
        const sec = page.locator(`[data-testid=${PANEL[key]}]`).first();
        await sec.waitFor({ timeout: 60000 }).catch(() => {});
        ok(`${tag} ${grp} ${key}: panel görünür`, await sec.isVisible().catch(() => false));
        const n = page.locator("[data-testid=astro-bala-polar-notice]");
        const vis = (await n.count()) > 0 && (await n.first().isVisible().catch(() => false));
        ok(`${tag} ${grp} ${key}: kutup uyarısı ${want ? "VAR" : "YOK"}`, vis === want && (!want || (await n.first().innerText()).includes(PROBE)));
        const m = await page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
        ok(`${tag} ${grp} ${key}: yatay taşma yok`, m.dw <= m.vw + 1, JSON.stringify(m));
        ok(`${tag} ${grp} ${key}: sağlayıcı adı / iç jargon yok`, !JARGON.test(await page.locator("body").innerText()));
        if (OUT && want) await page.screenshot({ path: path.join(OUT, `kutup-${key}-${tag}.png`), fullPage: true });
        if (want && key === "bala") {
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
        }
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\nbala-kutup-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
