// AŞAMA 2.1 SEKONDER PROGRESYON + 2.2 SOLAR ARC (2026-10-21) — ekran + akış regresyonu (Playwright Chromium). YEREL; sahte DB +
// sahte sağlayıcı (KATI mod; GERÇEK sağlayıcı YOK). Sahte arka uçta progresyon / Solar Arc golden'ı YALNIZ hedef tarih 2026-10-07
// ile vardır (bilinen kısıt) → bu betik o tarihi kullanır.
// Önkoşul: yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>,
//          ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2) + dev-fake-backend
//          **FAKE_NATAL_REAL_GOLDEN=1** ile (Solar Arc çift halkası, natal boylamların Solar Arc yanıtıyla tutarlı olmasını şart
//          koşar; varsayılan OpenAPI türevi natal fixture tutarsızdır → Solar Arc çerçevesi haklı olarak eklenmez).
// Çalıştırma: node scripts/astrology/progression-solararc-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü] [fake.log]
//   • API: natal önbellekte → progresyon + Solar Arc planı yalnız kendi istekleri; natal sağlayıcıya GİTMEZ; natalFrame var
//   • kaydet → aç (0 yeni sağlayıcı isteği; kaynak "snapshot") → Word/PDF 200 (çift halka görseli + tablolar + orb kuralı)
//   • Sonuç masası (1366): Hedef tarih 2026-10-07 → çift halka (dış halka) + künye + tablolar; 0 yeni istek
//   • Kayıtlı analiz 1366×768, 768×1024, 390×844: çift halka görünür ve taşmıyor; konum + açı tabloları; yöntem/orb satırı;
//     Solar Arc'ta "Transit" etiketi YOK; sağlayıcı adı yok; yatay taşma yok.
//   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const JSZip = require("jszip");
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
const api = async (p, b, raw = false) => {
  const r = await fetch(`${API}${p}`, { method: b ? "POST" : "GET", headers: H, body: b ? JSON.stringify(b) : undefined });
  if (raw) return r;
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return { s: r.status, j };
};
const logText = () => (LOG && fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : null);
const hits = () => {
  const t = logText();
  return t === null ? null : (t.match(/^fake roxy #\d+/gm) ?? []).length;
};
const natalHits = () => {
  const t = logText();
  return t === null ? null : (t.match(/^fake roxy #\d+ \/astrology\/natal-chart/gm) ?? []).length;
};
const TARGET = "2026-10-07";
const PROG = { technique: "western.progression", options: { targetDate: TARGET, nodeType: "true" } };
const SA = { technique: "western.solar_arc", options: { targetDate: TARGET, nodeType: "true" } };
const NATAL = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
const VIEWS = [
  [1366, 768],
  [768, 1024],
  [390, 844],
];

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

/** Çift halka SVG'si (NatalWheel dış halkalı) ölçümü. */
const wheelStats = (page) =>
  page.evaluate(() => {
    const svg = [...document.querySelectorAll('svg[data-outer-ring="1"]')].find((s) => s.getBoundingClientRect().width > 0);
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return {
      outer: svg.querySelectorAll("[data-outer-body]").length,
      cross: svg.querySelectorAll('[data-cross="1"]').length,
      w: r.width,
      h: r.height,
      left: r.left,
      right: r.right,
      vw: document.documentElement.clientWidth,
      titles: [...svg.querySelectorAll("title")].map((t) => t.textContent).join(" | "),
      label: svg.getAttribute("aria-label"),
    };
  });

(async () => {
  // ── 1) API akışı
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  const nPlan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [NATAL] });
  ok("hazırlık: Ali'nin natal sonucu önbellekte (0 yeni istek)", nPlan.j?.plan?.newRequestCount === 0, JSON.stringify(nPlan.j?.plan ?? nPlan.j).slice(0, 200));
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [PROG, SA] });
  const nreq = plan.j?.plan?.newRequestCount;
  ok("plan: natal plana girmez (en çok 2 = progresyon + Solar Arc)", typeof nreq === "number" && nreq <= 2, String(nreq));
  const h0 = hits();
  const nh0 = natalHits();
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [PROG, SA], confirmNewRequests: nreq });
  const res = run.j?.results ?? [];
  ok("run: progresyon + Solar Arc hesaplandı (golden 2026-10-07)", res.length === 2 && res.every((r) => r.ok), res.map((r) => `${r.technique}:${r.ok ? "ok" : r.code}`).join(","));
  if (LOG) ok("run: natal sağlayıcıya GÖNDERİLMEDİ; yalnız plan kadar istek", natalHits() === nh0 && hits() - h0 === nreq, `toplam +${hits() - h0}, natal +${natalHits() - nh0}`);
  const pv = res[0]?.view;
  const sv = res[1]?.view;
  ok("progresyon: natalFrame (önbellekteki natal) eklendi", !!pv?.technical?.natalFrame && pv.technical.natalFrame.houses.length === 12);
  ok("Solar Arc: natalFrame eklendi (FAKE_NATAL_REAL_GOLDEN=1 gerekir)", !!sv?.technical?.natalFrame, sv?.technical?.natalFrame ? "" : "çerçeve yok — sahte arka uç FAKE_NATAL_REAL_GOLDEN=1 ile başlatılmalı");
  const ids = {};
  for (const [sel, v] of [
    [PROG, pv],
    [SA, sv],
  ]) {
    const s = await api("/analyses", { profileId: pid, revision: 1, technique: sel.technique, options: v?.options ?? sel.options, saveRequestId: randomUUID() });
    ids[sel.technique] = s.j?.analysisId;
    ok(`kayıt ${sel.technique}`, typeof s.j?.analysisId === "string", JSON.stringify(s.j).slice(0, 200));
  }
  const h1 = hits();
  for (const tech of [PROG.technique, SA.technique]) {
    const a = await api(`/analyses/${ids[tech]}`);
    ok(`arşivden aç ${tech}: natalFrame snapshot'ta`, !!a.j?.analysis?.technical?.natalFrame && a.j.analysis.natalFrameSource === "snapshot", `${a.s} ${a.j?.analysis?.natalFrameSource}`);
    for (const fmt of ["docx", "pdf"]) {
      const r = await api(`/analyses/${ids[tech]}/report?format=${fmt}`, null, true);
      const buf = Buffer.from(await r.arrayBuffer());
      ok(`rapor ${tech} ${fmt}: 200`, r.status === 200 && buf.length > 20000, `${r.status} ${buf.length} bayt`);
      if (OUT) fs.writeFileSync(path.join(OUT, `${tech.replace("western.", "")}.${fmt}`), buf);
      if (fmt === "docx" && r.status === 200) {
        const zip = await JSZip.loadAsync(buf);
        const media = Object.keys(zip.files).filter((x) => x.startsWith("word/media/") && !x.endsWith("/")).length;
        const text = (await zip.file("word/document.xml").async("string")).replace(/<[^>]+>/g, "");
        const want = tech === PROG.technique ? ["İlerletilmiş gezegenler", "İlerletilmiş → natal açılar", "orb ≤ 1°", "ikincil ilerletme", "Natal + ilerletilmiş"] : ["Solar Arc konumları", "Solar Arc → natal açılar", "orb ≤ 1°", "ilerletilmiş Güneş − natal Güneş", "Natal + Solar Arc"];
        ok(`Word ${tech}: çift halka görseli + tablolar + yöntem/orb satırı`, media === 1 && want.every((x) => text.includes(x)), `media=${media} eksik=${want.filter((x) => !text.includes(x)).join(",")}`);
        ok(`Word ${tech}: sağlayıcı adı yok${tech === SA.technique ? "; 'Transit' etiketi yok" : ""}`, !/roxy/i.test(text) && (tech !== SA.technique || !/transit/i.test(text)) && !text.includes("undefined"));
      }
    }
  }
  if (LOG) ok("arşivden açma + rapor: 0 sağlayıcı isteği", hits() === h1, `${h1} → ${hits()}`);

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

  // ── 2) Sonuç masası (1366): hedef tarih 2026-10-07 → çift halka; 0 yeni istek (sonuçlar önbellekte)
  {
    const { ctx, page } = await newPage(browser, 1366, 768);
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
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
    for (const tech of [PROG.technique, SA.technique]) {
      const b = page.locator(`button[data-technique='${tech}']`).first();
      if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
      await page.waitForTimeout(300);
    }
    await page.locator(`[data-technique-focus='${PROG.technique}']`).first().click();
    await page.waitForTimeout(600);
    const date = page.getByLabel("Hedef tarih").first();
    await date.fill(TARGET);
    await page.waitForTimeout(1800);
    const h2 = hits();
    await page.locator("[data-testid=astro-run]").click();
    await page.waitForSelector("[data-testid=astro-result-view]", { timeout: 90000 });
    await page.waitForTimeout(2500);
    if (LOG) ok("masa: önbellekteki sonuçlar → 0 yeni sağlayıcı isteği", hits() === h2, `${h2} → ${hits()}`);
    for (const tech of [PROG.technique, SA.technique]) {
      // Açık analiz sekmesi: anahtar "<teknik>|…" (masaüstü şeridi).
      const tabSel = page.locator(`[data-tab-key^='${tech}|']`).first();
      ok(`masa ${tech}: açık analiz sekmesi`, (await tabSel.count()) === 1);
      if (await tabSel.count()) await tabSel.click().catch(() => {});
      await page.waitForTimeout(1500);
      const w = await wheelStats(page);
      const cap = await page.locator("[data-testid=astro-directed-caption]").first().innerText().catch(() => "");
      ok(`masa ${tech}: çift halka (dış halka ≥ 10 gövde)`, !!w && w.outer >= 10, JSON.stringify(w && { outer: w.outer, cross: w.cross, label: w.label }));
      ok(`masa ${tech}: künye "İç halka … natal · Dış halka (mor)"`, /İç halka: .*natal .*Dış halka \(mor\)/.test(cap), cap.slice(0, 160));
      if (tech === SA.technique) ok("masa Solar Arc: 'Transit' etiketi yok (çark + künye)", !!w && !/transit/i.test(`${w.titles} ${w.label} ${cap}`) && /Solar Arc/.test(w.label ?? ""), w?.label ?? "");
      if (OUT) await page.screenshot({ path: path.join(OUT, `masa-${tech.replace("western.", "")}-1366x768.png`) });
    }
    ok("masa: sayfa hatası yok", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ── 3) Kayıtlı analiz — 3 ekran
  for (const [w, h] of VIEWS) {
    const tag = `${w}x${h}`;
    for (const tech of [PROG.technique, SA.technique]) {
      const { ctx, page } = await newPage(browser, w, h);
      const errs = [];
      page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
      await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
      const item = page.locator(`[data-saved-item="${ids[tech]}"]`);
      await item.waitFor({ timeout: 120000 });
      await item.click();
      await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 60000 });
      await page.waitForTimeout(2500);
      const ws = await wheelStats(page);
      ok(`${tag} ${tech}: çift halka görünür`, !!ws && ws.outer >= 10 && ws.w > 150, JSON.stringify(ws && { outer: ws.outer, cross: ws.cross, w: Math.round(ws.w) }));
      ok(`${tag} ${tech}: çark ekrana sığıyor`, !!ws && ws.left >= -1 && ws.right <= ws.vw + 1, JSON.stringify(ws && { left: ws.left, right: ws.right, vw: ws.vw }));
      const cap = await page.locator("[data-testid=astro-directed-caption]").first().innerText().catch(() => "");
      ok(`${tag} ${tech}: künye`, /Dış halka \(mor\)/.test(cap) && /orb ≤ 1°/.test(cap), cap.slice(0, 120));
      if (OUT) await page.screenshot({ path: path.join(OUT, `kayitli-${tech.replace("western.", "")}-cark-${tag}.png`) });
      const techTab = page.getByRole("tab", { name: /Teknik ayrıntı/ }).first();
      if (await techTab.count()) await techTab.click();
      await page.waitForTimeout(800);
      const p = tech === PROG.technique ? "astro-progression" : "astro-solar-arc";
      const vis = async (id) => (await page.locator(`[data-testid="${id}"]`).count()) > 0 && (await page.locator(`[data-testid="${id}"]`).first().isVisible());
      ok(`${tag} ${tech}: konum tablosu`, await vis(`${p}-positions`));
      ok(`${tag} ${tech}: açı tablosu (Durum sütunu)`, (await vis(`${p}-aspects`)) && /durum/i.test(await page.locator(`[data-testid="${p}-aspects"]`).first().innerText()));
      const rule = await page.locator(`[data-testid="${p}-orb-rule"]`).first().innerText().catch(() => "");
      const method = await page.locator(`[data-testid="${p}-method"]`).first().innerText().catch(() => "");
      const period = await page.locator(`[data-testid="${p}-period"]`).first().innerText().catch(() => "");
      ok(`${tag} ${tech}: orb kuralı + yöntem + hesap tarihi yazılı`, /orb ≤ 1°/.test(rule) && method.length > 40 && /07\.10\.2026/.test(period), `${rule.slice(0, 60)} | ${period}`);
      const m = await page.evaluate((root) => {
        const el = document.querySelector(`[data-testid="${root}-panel"]`);
        const r = el?.getBoundingClientRect();
        return { dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, right: r ? r.right : 0, text: el ? el.innerText : "" };
      }, p);
      ok(`${tag} ${tech}: yatay taşma yok`, m.dw <= m.vw + 1 && m.right <= m.vw + 1, JSON.stringify({ dw: m.dw, vw: m.vw, right: m.right }));
      ok(`${tag} ${tech}: sağlayıcı adı yok${tech === SA.technique ? "; 'Transit' etiketi yok" : ""}`, !/roxy/i.test(m.text + cap) && (tech !== SA.technique || !/transit/i.test(m.text + cap)));
      ok(`${tag} ${tech}: sayfa hatası yok`, errs.length === 0, errs.join(" | "));
      if (OUT) await page.screenshot({ path: path.join(OUT, `kayitli-${tech.replace("western.", "")}-teknik-${tag}.png`), fullPage: true });
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`\nprogression-solararc-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
