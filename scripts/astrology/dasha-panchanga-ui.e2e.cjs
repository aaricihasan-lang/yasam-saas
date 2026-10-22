// ATLAS P2 AŞAMA 2 (2026-10-21) — Dasha derinliği + Güncel dönem zinciri + Ayrıntılı Panchanga: ekran + akış regresyonu (Playwright
// Chromium). YEREL; sahte DB + sahte sağlayıcı (KATI mod: birebir golden gövdeye GERÇEK yanıt; golden'ı olmayan Sookshma/Prana yolları
// ve zincir anları golden'ları birebir üreten doğrulanmış modelden — dev-fake-backend strictMatch). GERÇEK sağlayıcı YOK.
// Önkoşul: yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>,
//          ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2) + dev-fake-backend.
// Çalıştırma: node scripts/astrology/dasha-panchanga-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   1) API: Vedik dasha 5 düzey (Moon → Rahu → Ketu → Moon) + zincir (01.11.2026 09:00 UTC) · KP major + zincir · Panchanga + ayrıntılı
//      (01.11.2026, doğum yeri) · kutup yeri engeli (0 istek) → kaydet → aç (0 istek) → Word/PDF 200 + içerik
//   2) Çalışma alanı (1366×768): Vedik dasha sonucu → drill-down Antardasha → Pratyantardasha → Sookshma → Prana (önbellekten, 0 istek)
//   3) Kayıtlı analiz 1366×768 + 390×844: güncel dönem zinciri tablosu (5 satır), Prana listesi, ayrıntılı Panchanga; yatay taşma yok;
//      sağlayıcı adı yok.   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
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
const AT = "2026-11-01T09:00";
const PATH = ["moon", "rahu", "ketu", "moon"];
const KEYS = ["mahadasha", "antardasha", "pratyantardasha", "sookshma"];
const pathOpts = (n) => Object.fromEntries([...KEYS.slice(0, n).map((k, i) => [k, PATH[i]]), ...(n < 1 ? [["mahadasha", null]] : []), ...(n < 2 ? [["antardasha", null]] : [])]);

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
  const ids = {};
  // ── 1) API: 5 düzey (her düzey ayrı sonuç; drill-down önbelleği) + zincir
  for (let n = 0; n <= 4; n++) {
    const sel = { technique: "vedic.dasha", options: { ayanamsa: "lahiri", ...pathOpts(n) } };
    const { it } = await runSel(pid, sel);
    const lv = ["mahadasha", "antardasha", "pratyantardasha", "sookshma", "prana"][n];
    ok(`API Vedik dasha düzey ${lv}: 9'a kadar dönem, düzey doğru`, it?.ok === true && it.view.technical.level === lv && it.view.technical.periods.length >= 1, JSON.stringify(it).slice(0, 200));
  }
  const vSel = { technique: "vedic.dasha", options: { ayanamsa: "lahiri", ...pathOpts(4), chainAtUtc: AT } };
  const v = await runSel(pid, vSel);
  const vc = v.it?.view?.technical?.current;
  ok("API Vedik Prana + güncel dönem zinciri: 5 halka Ay/Rahu/Ketu/Ay/Venüs", v.it?.ok === true && vc?.chain?.map((x) => x.lord).join() === "moon,rahu,ketu,moon,venus", JSON.stringify(vc ?? v.run.j).slice(0, 300));
  const kSel = { technique: "kp.dasha", options: { ayanamsa: "kp-newcomb", nodeType: "mean", mahadasha: null, antardasha: null, chainAtUtc: AT } };
  const k = await runSel(pid, kSel);
  const kc = k.it?.view?.technical?.current;
  ok("API KP major + zincir: 5 halka + ortak evler (Maha·Antar·Pratyantar = 6)", k.it?.ok === true && kc?.chain?.length === 5 && kc?.commonHouses?.dashaBhuktiAntara?.join() === "6", JSON.stringify(kc ?? k.run.j).slice(0, 300));
  const pSel = { technique: "vedic.panchanga", options: { ayanamsa: "lahiri", detail: true, detailDate: "2026-11-01", placeLocationId: null } };
  const p = await runSel(pid, pSel);
  const pd = p.it?.view?.technical?.detail;
  ok("API Ayrıntılı Panchanga: Pazar · 07:35 / 18:00 · Rahu Kaal 16:42–18:00", p.it?.ok === true && pd?.vara?.id === "sunday" && pd.sunrise === "2026-11-01T07:35:00" && pd.rahuKaal?.start === "2026-11-01T16:42:00", JSON.stringify(pd ?? p.run.j).slice(0, 300));
  const polar = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ technique: "vedic.panchanga", options: { ayanamsa: "lahiri", detail: true, detailDate: "2026-12-21", placeLocationId: "gn-3133895" } }] });
  ok("kutup yeri (Tromsø): engel PANCHANGA_POLAR, 0 istek", polar.j?.plan?.selections?.[0]?.blocked?.code === "PANCHANGA_POLAR" && polar.j?.plan?.newRequestCount === 0, JSON.stringify(polar.j?.plan?.selections?.[0] ?? polar.j).slice(0, 200));
  for (const [key, sel, it] of [["vedic", vSel, v.it], ["kp", kSel, k.it], ["panch", pSel, p.it]]) {
    const sv = await api("/analyses", { profileId: pid, revision: 1, technique: sel.technique, options: it?.view?.options ?? sel.options, saveRequestId: randomUUID(), includeProviderInterp: true });
    ids[key] = sv.j?.analysisId;
    ok(`kayıt ${key}`, typeof ids[key] === "string", JSON.stringify(sv.j).slice(0, 200));
  }
  const again = await api("/engine/plan", { profileId: pid, revision: 1, selections: [vSel, kSel, pSel] });
  ok("aynı seçimler: 0 yeni istek (önbellek)", again.j?.plan?.newRequestCount === 0, JSON.stringify(again.j?.plan).slice(0, 200));
  const an = await api(`/analyses/${ids.vedic}`);
  ok("kayıt tek düzey: periods = Prana listesi (9) + zincir 5 halka; alt düzey listeleri yok", an.j?.analysis?.technical?.level === "prana" && an.j.analysis.technical.periods.length === 9 && an.j.analysis.technical.current?.chain?.length === 5);
  for (const [key, want] of [["vedic", ["Güncel dönem zinciri", "Prana", "Sookshma", "Kalan (gün)"]], ["kp", ["Güncel dönem zinciri", "Ortak evler", "Significator evleri", "Teorik başlangıç"]], ["panch", ["Ayrıntılı Panchanga", "Rahu Kaal", "Brahma muhurta", "Tithi devatası", "Nakshatra sembolü"]]]) {
    for (const fmt of ["docx", "pdf"]) {
      const r = await api(`/analyses/${ids[key]}/report?format=${fmt}`, null, true);
      const buf = Buffer.from(await r.arrayBuffer());
      ok(`rapor ${key} ${fmt}: 200`, r.status === 200 && buf.length > 5000, `${r.status} ${buf.length}`);
      if (OUT) fs.writeFileSync(path.join(OUT, `${key}.${fmt}`), buf);
      if (fmt === "docx" && r.status === 200) {
        const text = await docxText(buf);
        ok(`Word ${key}: ${want.join(" · ")}`, want.every((s) => text.includes(s)) && !/roxy/i.test(text) && !text.includes("undefined"), want.filter((s) => !text.includes(s)).join(", "));
      }
    }
  }

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  // ── 2) Çalışma alanı drill-down (1366×768)
  {
    const { ctx, page } = await newPage(browser, 1366, 768);
    const posted = [];
    page.on("request", (r) => {
      if (r.url().includes("/engine/run") && r.method() === "POST") posted.push(r.postData() ?? "");
    });
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
    await page.locator("button[data-technique='vedic.dasha']").first().click();
    await page.waitForTimeout(300);
    await page.locator("[data-technique-focus='vedic.dasha']").first().click();
    await page.waitForTimeout(800);
    const chain = page.locator("[data-testid=astro-dasha-chain-params]").first();
    ok("seçici: güncel dönem zinciri alanı görünür (Ekleme / Şimdi / Seçilen an)", await chain.isVisible().catch(() => false));
    await page.locator("[data-testid=astro-run]").first().click();
    const panel = page.locator("[data-testid=astro-vedic-dasha-panel]").first();
    await panel.waitFor({ timeout: 120000 }).catch(() => {});
    ok("çalışma alanı: Mahadasha paneli", await panel.isVisible().catch(() => false));
    const levels = ["antardasha", "pratyantardasha", "sookshma", "prana"];
    let scope = page.locator("[data-testid=astro-vedic-dasha-level-mahadasha]").first();
    for (let i = 0; i < 4; i++) {
      const btn = scope.locator(`table [data-dasha-drill="${PATH[i]}"]`).first();
      await btn.click().catch(() => {});
      const child = page.locator(`[data-testid=astro-vedic-dasha-level-${levels[i]}]`).first();
      await child.waitFor({ timeout: 60000 }).catch(() => {});
      ok(`drill-down → ${levels[i]} açıldı`, await child.isVisible().catch(() => false));
      scope = child;
    }
    const pranaRows = await page.locator("[data-testid=astro-vedic-dasha-table-prana] tbody tr").count();
    ok("Prana tablosu 9 satır; alt dönem düğmesi yok", pranaRows === 9 && (await page.locator("[data-testid=astro-vedic-dasha-table-prana] [data-dasha-drill]").count()) === 0, String(pranaRows));
    ok("drill-down isteklerinde zincir seçeneği YOK (ek ücretli birim açılmaz)", posted.slice(1).every((b) => !b.includes("chainAtUtc") && !b.includes("chainNow")), posted.slice(1).join(" | ").slice(0, 300));
    const m = await page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    ok("1366 çalışma alanı yatay taşma yok", m.dw <= m.vw + 1, JSON.stringify(m));
    if (OUT) await page.screenshot({ path: path.join(OUT, "drill-1366.png"), fullPage: true });
    await ctx.close();
  }

  // ── 3) Kayıtlı analizler — 1366×768 ve 390×844
  for (const [w, h] of [
    [1366, 768],
    [390, 844],
  ]) {
    const tag = `${w}x${h}`;
    const { ctx, page } = await newPage(browser, w, h);
    for (const [key, testid] of [["vedic", "astro-dasha-chain"], ["kp", "astro-dasha-chain"], ["panch", "astro-vedic-panchanga-detail"]]) {
      // Her kayıt danışan dosyasından ayrı açılır (açık bir analizin üzerinde liste öğesi yoktur).
      await page.goto("about:blank");
      await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
      const item = page.locator(`[data-saved-item="${ids[key]}"]`);
      await item.waitFor({ timeout: 120000 }).catch(() => {});
      ok(`${tag} ${key}: kayıt danışan dosyasında görünür`, await item.isVisible().catch(() => false));
      await item.click().catch(() => {});
      const sec = page.locator(`[data-testid=${testid}]`).first();
      await sec.waitFor({ timeout: 60000 }).catch(() => {});
      ok(`${tag} ${key}: bölüm görünür`, await sec.isVisible().catch(() => false));
      if (testid === "astro-dasha-chain") {
        const rows = await page.locator("[data-testid=astro-dasha-chain-table] tbody tr").count();
        ok(`${tag} ${key}: zincir 5 satır (Mahadasha → Prana)`, rows === 5, String(rows));
        if (key === "kp") ok(`${tag} kp: ortak evler satırı`, await page.locator("[data-testid=astro-dasha-chain-common]").first().isVisible().catch(() => false));
      } else {
        const sun = await page.locator("[data-testid=astro-panchanga-sun]").first().innerText().catch(() => "");
        ok(`${tag} panchanga: gün doğumu/batımı 07:35 / 18:00`, sun.includes("07:35") && sun.includes("18:00"), sun);
      }
      const m = await page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
      ok(`${tag} ${key}: yatay taşma yok`, m.dw <= m.vw + 1, JSON.stringify(m));
      const body = await page.locator("body").innerText();
      ok(`${tag} ${key}: sağlayıcı adı / 'golden' yok`, !/\broxy\b|golden|fixture/i.test(body));
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
  console.log(`\ndasha-panchanga-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
