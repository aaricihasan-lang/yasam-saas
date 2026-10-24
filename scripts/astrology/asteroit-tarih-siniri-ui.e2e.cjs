// ASTEROİT TARİH SINIRI (2026-10-24) — ekran + akış regresyonu (Playwright Chromium). YEREL; sahte DB + sahte sağlayıcı (KATI mod;
// GERÇEK sağlayıcı YOK). Sentetik profil 1560-06-15 12:00 İstanbul (asteroit doğrulanmış kapsamın dışında; ürün aralığı 1550–2100).
// Çalıştırma: node scripts/astrology/asteroit-tarih-siniri-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü] [fake.log]
//   • API: plan üç bölüm → 2 yeni istek (lot + Lilith), skippedSections = asteroit + gerekçe; yalnız asteroit → NO_UNIT
//   • run: sahte sağlayıcı günlüğünde asteroit ucuna İSTEK YOK
//   • Yeni analiz hazırlık ekranı (teknik ayrıntısı) 1366×768, 768×1024, 390×844: "Hesaplanmayacak bölüm — Asteroitler: …" görünür, yatay taşma yok, marka yok
//   • Tamamen engelli seçim (Tromsø + Placidus): her gerekçe ayrıntı alanında tam bir kez, amber liste yok, alt konsolun arkasında kalmaz
//   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
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
const api = async (p, b) => {
  const r = await fetch(`${API}${p}`, { method: b ? "POST" : "GET", headers: H, body: b ? JSON.stringify(b) : undefined });
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return { s: r.status, j };
};
const logText = () => (LOG && fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : null);
const astHits = () => {
  const t = logText();
  return t === null ? null : (t.match(/^fake roxy[^\n]*\/astrology\/asteroids/gm) ?? []).length;
};
const EP = (sections) => ({ technique: "western.extra_points", options: { sections, houseSystem: "placidus" } });
const VIEWS = [
  [1366, 768],
  [768, 1024],
  [390, 844],
];
const BAD = /roxy|golden|fixture|\/astrology\/(asteroids|arabic-lots|lilith)|undefined|\[object Object\]/i;

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

(async () => {
  // ── 1) API akışı
  const label = `Asteroit Sınır ${Date.now().toString(36)}`;
  const cr = await api("/profiles", { label, birthDate: "1560-06-15", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" });
  const pid = cr.j?.profile?.id;
  ok("hazırlık: sentetik 1560 profili oluşturuldu", typeof pid === "string", JSON.stringify(cr.j).slice(0, 200));
  const p3 = await api("/engine/plan", { profileId: pid, revision: 1, selections: [EP(["asteroids", "lots", "lilith"])] });
  const sk = p3.j?.plan?.selections?.[0]?.info?.skippedSections ?? [];
  ok("plan: üç bölüm → 2 yeni istek (lot + Lilith); asteroit birimi yok", p3.j?.plan?.newRequestCount === 2 && p3.j.plan.units.every((u) => u.endpoint !== "/astrology/asteroids"), JSON.stringify(p3.j?.plan ?? p3.j).slice(0, 240));
  ok("plan: skippedSections = asteroit + açık gerekçe", sk.length === 1 && sk[0].section === "asteroids" && /30 Aralık 1599/.test(sk[0].reason) && !BAD.test(sk[0].reason), JSON.stringify(sk));
  const p1 = await api("/engine/plan", { profileId: pid, revision: 1, selections: [EP(["asteroids"])] });
  ok("plan: yalnız asteroit → NO_UNIT + gerekçe, 0 istek", p1.j?.plan?.newRequestCount === 0 && p1.j?.plan?.selections?.[0]?.blocked?.code === "NO_UNIT" && /30 Aralık 1599/.test(p1.j.plan.selections[0].blocked.error), JSON.stringify(p1.j?.plan?.selections?.[0]).slice(0, 240));
  const a0 = astHits();
  await api("/engine/run", { profileId: pid, revision: 1, selections: [EP(["asteroids", "lots", "lilith"])], confirmNewRequests: 2 });
  if (LOG) ok("run: sahte sağlayıcıya asteroit isteği GİTMEDİ", astHits() === a0, `${a0} → ${astHits()}`);

  // ── 2) Teknik ekle penceresi — 3 ekran
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const [w, h] of VIEWS) {
    const tag = `${w}x${h}`;
    const { ctx, page } = await newPage(browser, w, h);
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    await page.goto(`${ORIGIN}/admin/astroloji`, { waitUntil: "load", timeout: 240000 });
    await page.waitForSelector("[data-portal=new]", { timeout: 120000 });
    await page.locator("[data-portal=new]").first().click();
    await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.locator("[data-testid=atlas-client-trigger]").first().click();
    await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill(label);
    await page.waitForTimeout(900);
    await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${pid}"]`).click();
    await page.waitForTimeout(1200);
    const b = page.locator("button[data-technique='western.extra_points']").first();
    ok(`${tag}: teknik listede ('Ek noktalar')`, (await b.count()) === 1);
    if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
    await page.waitForTimeout(300);
    await page.locator("[data-technique-focus='western.extra_points']").first().click();
    const sel = page.locator("[data-testid=atlas-focus-skipped]");
    await sel.first().waitFor({ timeout: 60000 }).catch(() => {});
    const info = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[data-testid="atlas-focus-skipped"]')].find((x) => x.getBoundingClientRect().width > 0);
      return el
        ? { text: el.innerText, sections: [...el.querySelectorAll("[data-skipped-section]")].map((x) => x.getAttribute("data-skipped-section")), right: el.getBoundingClientRect().right, dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }
        : null;
    });
    ok(`${tag}: "Hesaplanmayacak bölüm — Asteroitler" + gerekçe görünür`, !!info && info.sections.join(",") === "asteroids" && /Asteroitler/.test(info.text) && /30 Aralık 1599/.test(info.text) && /Lot ve Lilith/.test(info.text), JSON.stringify(info));
    ok(`${tag}: yatay taşma yok`, !!info && info.dw <= info.vw + 1 && info.right <= info.vw + 1, JSON.stringify(info && { dw: info.dw, vw: info.vw, r: info.right }));
    ok(`${tag}: marka / iç jargon yok`, !!info && !BAD.test(info.text));
    ok(`${tag}: sayfa hatası yok`, errs.length === 0, errs.join(" | "));
    if (OUT) await page.screenshot({ path: path.join(OUT, `asteroit-sinir-pencere-${tag}.png`), fullPage: false });
    await ctx.close();
  }

  // ── 3) Tamamen engelli seçim (Tromsø + Placidus, üç bölümün üçü de atlanır): gerekçeler TEK kez, hiçbiri kaybolmaz,
  //    alt konsolun arkasında kalmaz (24.10 entegrasyon provası P3 bulgusu).
  const plabel = `Asteroit Kutup ${Date.now().toString(36)}`;
  const pc = await api("/profiles", { label: plabel, birthDate: "1990-05-10", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: "gn-3133895" });
  const ppid = pc.j?.profile?.id;
  const pp = await api("/engine/plan", { profileId: ppid, revision: 1, selections: [EP(["asteroids", "lots", "lilith"])] });
  const psel = pp.j?.plan?.selections?.[0];
  const reasons = [...new Set((psel?.info?.skippedSections ?? []).map((x) => x.reason))];
  ok("kutup: plan NO_UNIT, üç bölüm atlanıyor", psel?.blocked?.code === "NO_UNIT" && (psel?.info?.skippedSections ?? []).length === 3 && reasons.length >= 2, JSON.stringify(psel).slice(0, 300));
  for (const [w, h] of VIEWS) {
    const tag = `kutup ${w}x${h}`;
    const { ctx, page } = await newPage(browser, w, h);
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    await page.goto(`${ORIGIN}/admin/astroloji`, { waitUntil: "load", timeout: 240000 });
    await page.waitForSelector("[data-portal=new]", { timeout: 120000 });
    await page.locator("[data-portal=new]").first().click();
    await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.locator("[data-testid=atlas-client-trigger]").first().click();
    await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill(plabel);
    await page.waitForTimeout(900);
    await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${ppid}"]`).click();
    await page.waitForTimeout(1200);
    const b = page.locator("button[data-technique='western.extra_points']").first();
    if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
    await page.waitForTimeout(300);
    await page.locator("[data-technique-focus='western.extra_points']").first().click();
    await page.locator("[data-testid=atlas-focus-status]").first().waitFor({ timeout: 60000 }).catch(() => {});
    await page.waitForFunction(() => /hesaplanamaz|tanımsız/i.test([...document.querySelectorAll('[data-testid="atlas-focus-status"]')].map((x) => x.innerText).join(" ")), null, { timeout: 60000 }).catch(() => {});
    const m = await page.evaluate((rs) => {
      const vis = (el) => !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
      const st = [...document.querySelectorAll('[data-testid="atlas-focus-status"]')].find(vis);
      // Teknik ayrıntı alanı: durum satırını içeren ve ayarlar kartını da kapsayan en yakın kap.
      let area = st;
      while (area && !area.querySelector('[data-testid="atlas-params-card"]')) area = area.parentElement;
      const text = area ? area.innerText : "";
      const count = (s) => text.split(s).length - 1;
      const amber = [...document.querySelectorAll('[data-testid="atlas-focus-skipped"]')].filter(vis).length;
      // Alt konsolun arkasında kalma: her gerekçe öğesi ortalanacak biçimde kaydırıldığında (sayfa ve iç kaydırma kabı) görünür
      // alt konsol (fixed, yüksekliği > 0) ile kesişmemeli. Kaydırma alanı yetersizse öğe aşağıda kalır ve konsolla kesişir.
      const els = [st, ...document.querySelectorAll('[data-testid="atlas-focus-skipped"]')].filter(vis);
      const con = [...document.querySelectorAll('[data-testid="atlas-console"] *')].filter((x) => vis(x) && getComputedStyle(x).pointerEvents !== "none");
      let overlap = 0;
      for (const e of els) {
        e.scrollIntoView({ block: "center", inline: "nearest" });
        const r = e.getBoundingClientRect();
        for (const c of con) {
          const q = c.getBoundingClientRect();
          const h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
          const wv = Math.min(r.right, q.right) - Math.max(r.left, q.left);
          if (h > 1 && wv > 1) overlap = Math.max(overlap, Math.round(h));
        }
      }
      return { counts: rs.map(count), amber, overlap, area: !!area, st: st ? st.innerText.slice(0, 600) : null };
    }, reasons);
    ok(`${tag}: her gerekçe ayrıntı alanında EN AZ bir kez (kaybolmaz)`, m.area && m.counts.length >= 2 && m.counts.every((c) => c >= 1), JSON.stringify(m.counts));
    ok(`${tag}: her gerekçe ayrıntı alanında EN ÇOK bir kez (tekrar yok)`, m.area && m.counts.every((c) => c <= 1), JSON.stringify(m.counts));
    ok(`${tag}: tamamen engelli seçimde amber "Hesaplanmayacak bölüm" listesi gösterilmez`, m.amber === 0, `amber=${m.amber}`);
    ok(`${tag}: gerekçeler kaydırınca alt konsolun arkasında kalmaz`, m.overlap === 0, `overlap=${m.overlap}px`);
    ok(`${tag}: atlanan üç bölümün adı gerekçeyle birlikte görünür`, !!m.st && /Asteroitler/.test(m.st) && /Hermetik lot/.test(m.st) && /Lilith/.test(m.st), (m.st || "").slice(0, 300));
    ok(`${tag}: marka / iç jargon yok`, !!m.st && !BAD.test(m.st));
    ok(`${tag}: sayfa hatası yok`, errs.length === 0, errs.join(" | "));
    if (OUT) {
      await page.locator("[data-testid=atlas-focus-status]").first().scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: path.join(OUT, `asteroit-kutup-engelli-${w}.png`), fullPage: false });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\nasteroit-tarih-siniri-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
