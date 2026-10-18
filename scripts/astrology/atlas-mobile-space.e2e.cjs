// Gökyüzü Atlası — mobil alan ölçümü (2026-10-17). YEREL; sahte DB + sahte Roxy (gerçek Roxy YOK, migration YOK).
// Çalıştırma: node scripts/astrology/atlas-mobile-space.e2e.cjs <genişlik> <yükseklik> <çıktı-klasörü> [android] [port] [baseline.json]
//   • Her ekranda ölçer: yatay taşma; büyük panellerin ekran kenarına uzaklığı (dış boşluk); metnin kenara en yakın
//     mesafesi (okunabilirlik güvenli boşluğu); metin taşıyan kutuların iç içe derinliği; ekran görüntüsü.
//   • genişlik ≥ 640 (tablet/masaüstü): data-testid'li görünür öğelerin geometrisini kaydeder; baseline.json verilirse
//     birebir karşılaştırır (masaüstü/tablet görünümü DEĞİŞMEMELİ).
//   • genişlik < 640: kabul ölçütleri — taşma yok, panel dış boşluğu ≤ 4 px, metin kenar boşluğu ≥ 8 px.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const { chromium } = require("playwright");
const { mkdirSync, writeFileSync, readFileSync, existsSync } = require("node:fs");
const { randomUUID } = require("node:crypto");

const [W = "390", H = "844", OUT = "", UA = "", PORT = "3942", BASE_JSON = ""] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const mobile = width < 640;
const android = UA === "android";
const tag = `${width}px${android ? " Android-UA" : ""}`;
const ORIGIN = `http://localhost:${PORT}`;
const BASE = `${ORIGIN}/admin/astroloji`;
const API = `${ORIGIN}/api/admin/astroloji`;
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const HDR = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}`, origin: ORIGIN };
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} [${tag}] ${n}${x ? ` — ${x}` : ""}`);
};
const api = async (path, body) => {
  const r = await fetch(`${API}${path}`, { method: body ? "POST" : "GET", headers: HDR, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await r.json();
  } catch {
    /* boş */
  }
  return { status: r.status, json };
};

/** Sayfa içi ölçüm (tarayıcıda çalışır). */
function measureInPage() {
  const vw = document.documentElement.clientWidth;
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const alpha = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return 0;
    const p = m[1].split(/[ ,/]+/).filter(Boolean);
    return p.length >= 4 ? Number(p[3]) : 1;
  };
  const isCard = (el) => {
    if (!["DIV", "SECTION", "ARTICLE", "LI", "DL", "UL", "OL", "TABLE", "DETAILS", "FORM", "HEADER", "ASIDE", "FIELDSET", "NAV"].includes(el.tagName)) return false;
    const cs = getComputedStyle(el);
    const bw = ["Top", "Right", "Bottom", "Left"].reduce((a, s) => a + (parseFloat(cs[`border${s}Width`]) > 0 && alpha(cs[`border${s}Color`]) > 0.04 ? 1 : 0), 0);
    const bg = alpha(cs.backgroundColor) > 0.03 || cs.backgroundImage !== "none";
    const r = el.getBoundingClientRect();
    return r.width >= 120 && r.height >= 24 && (bw >= 3 || (bg && parseFloat(cs.borderTopLeftRadius) > 0));
  };
  const inHScroll = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  const fixedish = (el) => {
    for (let p = el; p; p = p.parentElement) if (["fixed", "sticky"].includes(getComputedStyle(p).position)) return true;
    return false;
  };
  const root = document.querySelector("main") || document.body;
  const cards = [];
  for (const el of root.querySelectorAll("*")) {
    if (!vis(el) || el.closest("svg, canvas, [role=dialog]") || !isCard(el)) continue;
    let depth = 0;
    for (let p = el.parentElement; p && p !== root.parentElement; p = p.parentElement) if (isCard(p)) depth++;
    const r = el.getBoundingClientRect();
    cards.push({ el, depth, l: r.left, r: vw - r.right, w: r.width });
  }
  // Metin yaprakları
  let textMin = Infinity;
  let textMinWhat = "";
  let deepest = 0;
  let deepestWhat = "";
  for (const el of root.querySelectorAll("*")) {
    if (!vis(el) || el.closest("svg, canvas, [role=dialog], select, option")) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    if (inHScroll(el) || fixedish(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > 20000) continue;
    // Ekran okuyucu metni (sr-only: 1×1 px, kırpılmış) görsel değildir.
    if (r.width <= 2 || r.height <= 2 || getComputedStyle(el).clipPath !== "none" || getComputedStyle(el).clip.startsWith("rect(0")) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rr = range.getBoundingClientRect();
    const left = Math.max(rr.left, r.left);
    const right = Math.min(rr.right, r.right);
    const m = Math.min(left, vw - right);
    if (m < textMin) {
      textMin = m;
      textMinWhat = (el.textContent || "").trim().slice(0, 40);
    }
    let d = 0;
    for (let p = el.parentElement; p && p !== root.parentElement; p = p.parentElement) if (isCard(p)) d++;
    if (d > deepest) {
      deepest = d;
      deepestWhat = (el.textContent || "").trim().slice(0, 40);
    }
  }
  const big = cards.filter((c) => c.w >= vw * 0.6 && !fixedish(c.el));
  const gapL = big.length ? Math.min(...big.map((c) => c.l)) : null;
  const gapR = big.length ? Math.min(...big.map((c) => c.r)) : null;
  const gapMaxL = big.length ? Math.max(...big.map((c) => Math.round(c.l))) : null;
  const maxC = big.length ? big.reduce((a, c) => (c.l > a.l ? c : a)) : null;
  const gapMaxWhat = maxC ? `${maxC.el.getAttribute("data-testid") ?? ""} ${String(maxC.el.className).slice(0, 70)}` : "";
  // En geniş metin bloğunun genişlik oranı (içerik ne kadar yatay alan kullanıyor)
  let widest = 0;
  for (const el of root.querySelectorAll("p, li, td, dd, h2, h3, h4, label, button")) {
    if (!vis(el) || inHScroll(el) || fixedish(el) || el.closest("svg, [role=dialog]")) continue;
    widest = Math.max(widest, el.getBoundingClientRect().width);
  }
  return {
    vw,
    overflow: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth - vw : 0,
    gapL: gapL === null ? null : Math.round(gapL),
    gapR: gapR === null ? null : Math.round(gapR),
    gapMaxL,
    gapMaxWhat,
    textMin: Number.isFinite(textMin) ? Math.round(textMin) : null,
    textMinWhat,
    maxDepth: deepest,
    deepestWhat,
    widestText: Math.round(widest),
  };
}
/** Hata ayıklama (DUMP=1): seçili öğeden köke yatay boşluk zinciri (margin/border/padding ≠ 0 olan atalar). */
function chainInPage(sel) {
  const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0);
  if (!el) return "     (yok)";
  const out = [];
  for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
    const cs = getComputedStyle(p);
    const h = (k) => Math.round(parseFloat(cs[k]) || 0);
    const v = [h("marginLeft"), h("borderLeftWidth"), h("paddingLeft"), h("paddingRight"), h("borderRightWidth"), h("marginRight")];
    const r = p.getBoundingClientRect();
    if (v.some((x) => x !== 0) || cs.maxWidth !== "none") out.push(`     L${Math.round(r.left)} W${Math.round(r.width)} m${v[0]} b${v[1]} p${v[2]}|p${v[3]} b${v[4]} m${v[5]} ${cs.maxWidth !== "none" ? `max ${cs.maxWidth} ` : ""}<${p.tagName.toLowerCase()} ${p.getAttribute("data-testid") ?? ""}> ${String(p.className).slice(0, 110)}`);
  }
  return out.join(String.fromCharCode(10));
}
const DUMP_SEL = {
  "2b-teknik-ayar": ["[data-testid=astro-forecast-range] select"],
  "3b-transit-ayrinti": ["[data-testid=astro-transit-strongest] li"],
  "3c-transit-tablo": ["[data-testid=astro-transit-cards] li"],
  "4-takvim-olaylar": ["[data-testid=astro-forecast-day]", "[data-testid=astro-forecast-cards]"],
  "4b-gun-ayrinti": ["[data-testid=astro-day-detail]"],
  "5-arsiv": ["[data-testid=astro-archive-list] [title='Danışan dosyasını aç']"],
  "6b-kayitli-analizler": ["[data-testid=astro-bulk-report]", "[data-testid=astro-saved-analyses] [data-saved-item]"],
  "6-danisan-dosyasi": ["[data-testid=astro-birth-card]"],
  "7-kayitli-analiz": ["[data-testid=astro-saved-title]", "[data-testid=astro-forecast-day]"],
  "3-harita": ["[data-testid=atlas-mobile-chart]", "[data-testid=astro-run-info]"],
  "2-yeni-analiz": ["[data-testid=atlas-client-identity]", "button[data-technique='western.natal']", "[data-testid=atlas-prep-grid]"],
};
function geometryInPage() {
  const out = {};
  for (const el of document.querySelectorAll("[data-testid]")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const id = el.getAttribute("data-testid");
    const k = out[id] ? `${id}#${Object.keys(out).filter((x) => x.startsWith(`${id}#`) || x === id).length}` : id;
    out[k] = [Math.round(r.left), Math.round(r.top + window.scrollY), Math.round(r.width), Math.round(r.height)];
  }
  return out;
}

(async () => {
  if (OUT) mkdirSync(OUT, { recursive: true });
  const prof = await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`);
  const pid = prof.json?.items?.[0]?.id ?? prof.json?.profiles?.[0]?.id;
  ok("hazırlık: golden doğum profili", typeof pid === "string");
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    deviceScaleFactor: 1,
    ...(android ? { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36" } : {}),
  });
  await ctx.addCookies([
    { name: "__Host-yasam_sid", value: TOKEN, domain: "localhost", path: "/", secure: true },
    { name: "yasam_admin_session", value: TOKEN, domain: "localhost", path: "/" },
  ]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  // Sonuç masasından ayrılırken kaydedilmemiş analiz uyarısı (beforeunload) — yerel ölçümde ayrılmayı kabul et.
  page.on("dialog", (d) => void (d.type() === "beforeunload" ? d.accept() : d.dismiss()));
  const results = {};
  const geometry = {};
  const screen = async (name, scrollSel) => {
    await page.waitForTimeout(700);
    if (scrollSel && (await page.locator(scrollSel).count())) await page.locator(scrollSel).first().scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(300);
    const m = await page.evaluate(measureInPage);
    if (process.env.DUMP && DUMP_SEL[name])
      for (const sel of DUMP_SEL[name]) console.log(`   ⤷ ${name} ${sel} ⤶ ${await page.evaluate(chainInPage, sel)}`);
    results[name] = m;
    if (!mobile) geometry[name] = await page.evaluate(geometryInPage);
    if (OUT) await page.screenshot({ path: `${OUT}/${width}${android ? "a" : ""}-${name}.png`, fullPage: false });
    console.log(`   ${name}: taşma ${m.overflow} · panel dış boşluk L${m.gapL}/R${m.gapR} (en büyük sol ${m.gapMaxL}${mobile && m.gapMaxL > 12 ? ` ⟨${m.gapMaxWhat}⟩` : ""}) · metin kenar ${m.textMin} ("${m.textMinWhat}") · kutu derinliği ${m.maxDepth} ("${m.deepestWhat}") · en geniş metin ${m.widestText}/${m.vw}`);
    if (mobile) {
      ok(`${name}: yatay taşma yok`, m.overflow === 0, `${m.overflow}px`);
      if (m.textMin !== null) ok(`${name}: metin kenara en az 8 px uzak`, m.textMin >= 8, `${m.textMin}px "${m.textMinWhat}"`);
      // Alan kazanımı: metin kenara 16 px'ten fazla gömülmez (önce 15–42 px); içerik genişliğin ≥ %85'ini kullanır.
      if (m.textMin !== null) ok(`${name}: metin kenar boşluğu ≤ 16 px (gereksiz iç içe girinti yok)`, m.textMin <= 16, `${m.textMin}px`);
      ok(`${name}: içerik genişliği ≥ %85`, m.widestText >= m.vw * 0.85, `${m.widestText}/${m.vw}`);
    }
  };

  // 1) Portal
  await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("[data-portal=new]", { timeout: 120000 });
  await screen("1-portal");
  // 2) Yeni Analiz + teknik seçimi
  await page.locator("[data-portal=new]").first().click();
  await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.locator("[data-testid=atlas-client-trigger]").first().click();
  await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill("Ali Örnek");
  await page.waitForTimeout(900);
  await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${pid}"]`).click();
  await page.waitForTimeout(1200);
  for (const id of ["western.natal", "western.transit", "western.forecast"]) {
    await page.locator(`button[data-technique='${id}']`).first().click();
    await page.waitForTimeout(200);
  }
  await page.locator("[data-technique-focus='western.transit']").first().click();
  const moment = page.locator("[data-testid=astro-transit-moment]").first();
  await moment.locator("[data-transit-mode=custom]").check();
  await moment.locator('input[aria-label="Transit tarihi"]').fill("2026-10-07");
  await moment.locator('input[aria-label="Transit saati"]').fill("12:00");
  await page.locator("[data-technique-focus='western.forecast']").first().click();
  const fr = page.locator("[data-testid=astro-forecast-range]").first();
  await fr.locator('input[aria-label="Takvim başlangıcı"]').fill("2026-10-01");
  await fr.locator('select[aria-label="Takvim süresi"]').selectOption("90");
  await page.evaluate(() => window.scrollTo(0, 0));
  await screen("2-yeni-analiz");
  await screen("2b-teknik-ayar", "[data-testid=astro-forecast-range]");
  // 3) Sonuç masası
  await page.waitForTimeout(1500);
  await page.locator("[data-testid=astro-run]").click();
  await page.waitForSelector("[data-testid=astro-desk-save]", { timeout: 120000 });
  await page.waitForTimeout(1500);
  const tabSel = (id) => (mobile ? `[data-testid=astro-result-tabs-mobile] [data-tab-key-m^='${id}']` : `[data-tab-key^='${id}']`);
  const openTab = async (id) => {
    if (mobile && !(await page.locator(tabSel(id)).first().isVisible()) && (await page.locator("[data-testid=astro-result-tabs-more]").isVisible())) await page.locator("[data-testid=astro-result-tabs-more]").click();
    await page.locator(tabSel(id)).first().click();
    await page.waitForTimeout(900);
  };
  await openTab("western.transit");
  await page.evaluate(() => window.scrollTo(0, 0));
  await screen("3-harita");
  const techTab = page.getByRole("tab", { name: /Teknik ayrıntı/ }).first();
  if (await techTab.count()) await techTab.click();
  await page.waitForSelector("[data-testid=astro-transit-panel]", { timeout: 30000 });
  await screen("3b-transit-ayrinti", "[data-testid=astro-transit-strongest]");
  await screen("3c-transit-tablo", "[data-testid=astro-transit-table]");
  await openTab("western.forecast");
  await page.waitForSelector("[data-testid=astro-forecast-panel]", { timeout: 30000 });
  await screen("4-takvim-olaylar", "[data-testid=astro-forecast-cards]");
  await page.locator("[data-testid=astro-forecast-pick-day]").fill("2026-10-07");
  await page.waitForSelector("[data-testid=astro-day-detail]", { timeout: 10000 });
  await screen("4b-gun-ayrinti", "[data-testid=astro-day-detail]");
  // 4) Kayıt (yerel sahte DB; API) → Arşiv → Danışan dosyası → kayıtlı analiz
  for (const [technique, options] of [
    ["western.transit", { atUtc: "2026-10-07T09:00", nodeType: "true", displayTz: "Europe/Istanbul" }],
    ["western.forecast", { startDate: "2026-10-01", days: 90, displayTz: "Europe/Istanbul" }],
  ])
    await api("/analyses", { profileId: pid, revision: 1, technique, options, saveRequestId: randomUUID(), includeProviderInterp: true });
  await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("[data-portal]", { timeout: 120000 });
  await page.locator("[data-portal=archive]").first().click();
  await page.waitForSelector("[data-testid=astro-archive-list]", { timeout: 60000 });
  await screen("5-arsiv");
  await page.locator("[data-testid=astro-archive-list] [title='Danışan dosyasını aç']").first().click();
  await page.waitForSelector("[data-testid=astro-client-file-analyses]", { timeout: 60000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await screen("6-danisan-dosyasi");
  await screen("6b-kayitli-analizler", "[data-testid=astro-bulk-report]");
  await page.locator("[data-testid=astro-saved-analyses] [data-saved-item]").first().click();
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await screen("7-kayitli-analiz");

  ok("hiç sayfa hatası yok", errors.length === 0, errors.join(" | "));
  if (OUT) writeFileSync(`${OUT}/${width}${android ? "a" : ""}-metrics.json`, JSON.stringify({ results, geometry }, null, 1));
  if (!mobile && BASE_JSON && existsSync(BASE_JSON)) {
    const base = JSON.parse(readFileSync(BASE_JSON, "utf8")).geometry;
    let diffs = 0;
    const samples = [];
    for (const [scr, g] of Object.entries(base)) {
      const cur = geometry[scr] || {};
      for (const [k, v] of Object.entries(g)) {
        const c = cur[k];
        if (!c || c.some((x, i) => Math.abs(x - v[i]) > 1)) {
          diffs++;
          if (samples.length < 8) samples.push(`${scr}/${k}: ${JSON.stringify(v)} → ${JSON.stringify(c ?? null)}`);
        }
      }
    }
    ok("masaüstü/tablet geometrisi değişiklik öncesiyle aynı (±1 px)", diffs === 0, `${diffs} fark ${samples.join(" ; ")}`);
  }
  await browser.close();
  console.log(`\natlas-mobile-space [${tag}]: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
