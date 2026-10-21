// ATLAS YENİ TEKNİKLER (2026-10-22) — Vedik eşleştirme (Gun Milan + Manglik) ve Sade Sati: ekran + akış regresyonu (Playwright
// Chromium). YEREL; sahte DB + sahte sağlayıcı (KATI mod: yalnız BİREBİR golden gövdeye GERÇEK yanıt — dev-fake-backend strictMatch
// yeni golden'ları (vedic-gun-milan / vedic-manglik-a / vedic-manglik-b / vedic-sadhesati) klasördeki tüm golden'larla birlikte okur).
// GERÇEK sağlayıcı YOK. Tohum: "Ali Örnek — natal" (sentetik A, İstanbul) + "Sentetik B — Ankara" (sinastri golden'ının 2. kişisi).
// Önkoşul: yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>,
//          ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2) + dev-fake-backend.
// Çalıştırma: node scripts/astrology/vedik-eslesme-sadesati-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   1) API: Gun Milan (A + B) 3 istek → 25,5 / 36, Manglik iki kişi; Sade Sati 1 istek → doruk; aynı seçim 0 istek; karşı taraf
//      saatsiz → TIME_REQUIRED (0 istek); kaydet → aç (0 istek) → Word / PDF 200 + içerik (sağlayıcı adı yok, teknik bölümde hüküm yok)
//   2) Seçici (1366×768): Vedik sekmesinde iki yeni teknik; Gun Milan'da karşı taraf alanı + açıklama; Sade Sati açıklaması
//   3) Kayıtlı analiz 1366×768 + 768×1024 + 390×844: koota tablosu, dosha, Manglik iki kart, Sade Sati evre şeridi; yatay taşma yok;
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
  const pb = (await api(`/profiles?q=${encodeURIComponent("Sentetik B")}`)).j.profiles[0].id;
  const ids = {};
  // ── 1) API
  const gSel = { technique: "vedic.gun_milan", options: { partnerProfileId: pb, ayanamsa: "lahiri" } };
  const sSel = { technique: "vedic.sade_sati", options: { ayanamsa: "lahiri" } };
  const g = await runSel(pid, gSel);
  ok("API Gun Milan plan: 3 yeni istek (uyum + Manglik A + Manglik B)", g.plan.j?.plan?.newRequestCount === 3, JSON.stringify(g.plan.j?.plan ?? g.plan.j).slice(0, 300));
  const gt = g.it?.view?.technical;
  ok("API Gun Milan: 25,5 / 36, 8 koota, Bhakoot iptal, Manglik A var / B yok", g.it?.ok === true && gt?.total === 25.5 && gt.kootas.length === 8 && gt.cancellations?.[0]?.dosha === "bhakoot" && gt.manglik?.person1?.present === true && gt.manglik?.person2?.present === false, JSON.stringify(g.it ?? g.run.j).slice(0, 300));
  ok("API Gun Milan teknik katmanında hüküm metni yok", !JSON.stringify(gt ?? {}).includes("tavsiye"));
  const s = await runSel(pid, sSel);
  const st = s.it?.view?.technical;
  ok("API Sade Sati: 1 istek; etkin, doruk evresi; değerlendirme günü bugün (UTC)", s.plan.j?.plan?.newRequestCount === 1 && s.it?.ok === true && st?.present === true && st.phase === "peak" && st.asOf === new Date().toISOString().slice(0, 10), JSON.stringify(s.it ?? s.run.j).slice(0, 300));
  const again = await api("/engine/plan", { profileId: pid, revision: 1, selections: [gSel, sSel] });
  ok("aynı seçimler: 0 yeni istek (önbellek)", again.j?.plan?.newRequestCount === 0, JSON.stringify(again.j?.plan).slice(0, 200));
  const noTime = (await api(`/profiles?q=${encodeURIComponent("Saat bilinmeyen")}`)).j.profiles[0].id;
  const nt = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ technique: "vedic.gun_milan", options: { partnerProfileId: noTime, ayanamsa: "lahiri" } }] });
  ok("karşı taraf saatsiz: TIME_REQUIRED, 0 istek", nt.j?.plan?.selections?.[0]?.blocked?.code === "TIME_REQUIRED" && nt.j?.plan?.newRequestCount === 0, JSON.stringify(nt.j?.plan?.selections?.[0] ?? nt.j).slice(0, 200));
  for (const [key, sel, it] of [["gun", gSel, g.it], ["sade", sSel, s.it]]) {
    const sv = await api("/analyses", { profileId: pid, revision: 1, technique: sel.technique, options: it?.view?.options ?? sel.options, saveRequestId: randomUUID(), includeProviderInterp: true });
    ids[key] = sv.j?.analysisId;
    ok(`kayıt ${key}`, typeof ids[key] === "string", JSON.stringify(sv.j).slice(0, 200));
  }
  const an = await api(`/analyses/${ids.gun}`);
  ok("kayıtlı Gun Milan: teknik + karşı taraf + yorum (yetkiyle)", an.j?.analysis?.technical?.total === 25.5 && an.j.analysis.profile?.partner?.label === "Sentetik B — Ankara" && an.j.analysis.interpretation?.visible === true);
  for (const [key, want] of [
    ["gun", ["Ashtakoot Gun Milan — teknik değerlendirme", "25,5 / 36", "Bhakoot Dosha — iptal", "Manglik (Kuja dosha) — iki kişi", "Yöntem: Ashtakoot", "Sentetik B — Ankara"]],
    ["sade", ["Sade Sati — değerlendirme günü", "Doruk evresi (Ay'dan 1. ev)", "Evre şeridi", "Kapsam: Hesaplama servisi yalnız değerlendirme günündeki durumu"]],
  ]) {
    for (const fmt of ["docx", "pdf"]) {
      const r = await api(`/analyses/${ids[key]}/report?format=${fmt}`, null, true);
      const buf = Buffer.from(await r.arrayBuffer());
      ok(`rapor ${key} ${fmt}: 200`, r.status === 200 && buf.length > 5000, `${r.status} ${buf.length}`);
      if (OUT) fs.writeFileSync(path.join(OUT, `${key}.${fmt}`), buf);
      if (fmt === "docx" && r.status === 200) {
        const text = await docxText(buf);
        ok(`Word ${key}: ${want.join(" · ")}`, want.every((x) => text.includes(x)) && !JARGON.test(text) && !text.includes("undefined"), want.filter((x) => !text.includes(x)).join(", "));
        if (key === "gun") {
          const iTech = text.indexOf("Teknik hesaplama sonuçları");
          const iRec = text.indexOf("Birleşim tavsiye edilir");
          ok("Word gun: hüküm cümlesi yalnız teknik bölümden SONRA, yorum bölümünde", iTech >= 0 && (iRec === -1 || iRec > text.indexOf("Otomatik Yorum")), `${iTech} ${iRec}`);
        }
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
    for (const id of ["vedic.gun_milan", "vedic.sade_sati"]) ok(`seçici: ${id} Vedik sekmesinde`, await page.locator(`button[data-technique='${id}']`).first().isVisible().catch(() => false));
    await page.locator("button[data-technique='vedic.gun_milan']").first().click();
    await page.waitForTimeout(300);
    await page.locator("[data-technique-focus='vedic.gun_milan']").first().click();
    await page.waitForTimeout(800);
    ok("seçici Gun Milan: karşı taraf alanı + açıklama", (await page.locator("select[aria-label='Karşı taraf profili']").first().isVisible().catch(() => false)) && (await page.locator("[data-testid=astro-gun-milan-params]").first().isVisible().catch(() => false)));
    await page.locator("button[data-technique='vedic.sade_sati']").first().click();
    await page.waitForTimeout(300);
    await page.locator("[data-technique-focus='vedic.sade_sati']").first().click();
    await page.waitForTimeout(800);
    ok("seçici Sade Sati: açıklama (değerlendirme günü)", await page.locator("[data-testid=astro-sade-sati-params]").first().isVisible().catch(() => false));
    const body = await page.locator("body").innerText();
    ok("seçici: sağlayıcı adı / iç jargon yok", !JARGON.test(body));
    if (OUT) await page.screenshot({ path: path.join(OUT, "secici-1366.png"), fullPage: true });
    await ctx.close();
  }

  // ── 3) Kayıtlı analizler — 1366×768, 768×1024, 390×844
  for (const [w, h] of [
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    const tag = `${w}x${h}`;
    const { ctx, page } = await newPage(browser, w, h);
    for (const [key, testid] of [["gun", "astro-gun-milan-panel"], ["sade", "astro-sade-sati-panel"]]) {
      await page.goto("about:blank");
      await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
      const item = page.locator(`[data-saved-item="${ids[key]}"]`);
      await item.waitFor({ timeout: 120000 }).catch(() => {});
      ok(`${tag} ${key}: kayıt danışan dosyasında görünür`, await item.isVisible().catch(() => false));
      await item.click().catch(() => {});
      const sec = page.locator(`[data-testid=${testid}]`).first();
      await sec.waitFor({ timeout: 60000 }).catch(() => {});
      ok(`${tag} ${key}: panel görünür`, await sec.isVisible().catch(() => false));
      if (key === "gun") {
        const rows = await page.locator("[data-testid=astro-gun-milan-table] tbody tr").count();
        ok(`${tag} gun: koota tablosu 8 satır`, rows === 8, String(rows));
        const total = await page.locator("[data-testid=astro-gun-milan-total]").first().innerText().catch(() => "");
        ok(`${tag} gun: toplam 25,5 / 36`, total.includes("25,5") && total.includes("36"), total);
        ok(`${tag} gun: Manglik iki kart`, (await page.locator("[data-testid=astro-manglik-1]").count()) === 1 && (await page.locator("[data-testid=astro-manglik-2]").count()) === 1);
        const panelText = await sec.innerText().catch(() => "");
        ok(`${tag} gun: teknik panelde hüküm cümlesi yok`, !panelText.includes("tavsiye"));
      } else {
        ok(`${tag} sade: evre şeridi 3 adım, doruk vurgulu`, (await page.locator("[data-testid=astro-sade-sati-timeline] li").count()) === 3 && (await page.locator("[data-testid=astro-sade-sati-phase-peak][aria-current=step]").count()) === 1);
        const status = await page.locator("[data-testid=astro-sade-sati-status]").first().innerText().catch(() => "");
        ok(`${tag} sade: durum metni`, status.includes("Sade Sati etkin") && status.includes("Doruk"), status);
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
  console.log(`\nvedik-eslesme-sadesati-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
