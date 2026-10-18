// KP-UX (2026-10-18) — KP Transit owner kullanıcı testi sonrası UX düzeltmelerinin ekran regresyonu (Playwright Chromium).
// YEREL; sahte DB + sahte Roxy (KP tek-an GERÇEK golden kp-planets-at; aralık uçları FAKE_ROXY_KP_SYNTH=1 SENTETİK).
// Önkoşul: transit03-ui.e2e.cjs ile aynı yerel sunucu (next start :3941 + dev-fake-backend).
// Çalıştırma: node scripts/astrology/kp-ux.e2e.cjs [ekran-görüntüsü-klasörü] [etiket]   (KPUX_ONLY=1366x768 → tek ekran)
//   KP-UX-01/07 konum tablosu (28 an): ‹ › + aynı konumu yöneten çubuk; senkron; sona kadar. Masaüstü (KP-UX-07): çubuk sol
//            panelin görünen ALT kenarında sabit, dikey kaydırmada orada kalır, tablonun sonunda son satırı örtmez.
//            Telefon / tablet: çubuk tablonun üstünde (önceki davranış).
//   KP-UX-04 kayıtlı analiz başlığı: öğeler üst üste binmez (KP + Gochara regresyonu); "Kaydedildi" görünür.
//   KP-UX-05 KP tek-an kare harita: masaüstünde 12 burç kutusu kaydırmadan görünür; mobilde harita tek ekrana sığar;
//            "Tam görünüm" penceresinde 12/12, Esc ile kapanır; etiket kırpılmaz.
//   KP-UX-06 harita açıklaması cusp/Placidus anlatmaz (KP transit tek anda cusp çizilmez).
//   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const [OUT = "", TAG = "kpux"] = process.argv.slice(2);
if (OUT) fs.mkdirSync(OUT, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`);
};
const shot = async (target, name) => {
  if (OUT) await target.screenshot({ path: path.join(OUT, `${TAG}-${name}.png`) });
};
const ORIGIN = "http://localhost:3941";
const API = `${ORIGIN}/api/admin/astroloji`;
const T = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const H = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": T, cookie: `yasam_admin_session=${T}`, origin: ORIGIN };
const api = async (p, b) => {
  const r = await fetch(`${API}${p}`, { method: b ? "POST" : "GET", headers: H, body: b ? JSON.stringify(b) : undefined });
  const buf = Buffer.from(await r.arrayBuffer());
  let j = null;
  try { j = JSON.parse(buf); } catch {}
  return { s: r.status, j, buf };
};
async function saved(pid, options, technique = "kp.transit") {
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ technique, options }] });
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [{ technique, options: plan.j.plan.selections[0].options }], confirmNewRequests: plan.j.plan.newRequestCount });
  if (!run.j?.results?.[0]?.ok) throw new Error("run " + JSON.stringify(run.j).slice(0, 300));
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique, options: run.j.results[0].view.options, saveRequestId: randomUUID() });
  return sv.j.analysisId;
}
const ONLY = process.env.KPUX_ONLY || "";
const VIEWS_ALL = [
  [1366, 768], [1536, 864], [1920, 1080], [1280, 720], [1024, 768], [768, 1024], [390, 844], [320, 640],
];
const VIEWS = ONLY ? VIEWS_ALL.filter(([w, h]) => `${w}x${h}` === ONLY) : VIEWS_ALL;
(async () => {
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  const base = { ayanamsa: "kp-newcomb", nodeType: "mean" };
  const ids = {
    tekan: await saved(pid, { atUtc: "2026-10-07T09:00", ...base }),
    konum: await saved(pid, { range: { startDate: "2026-10-07", days: 7, planets: [], kinds: ["positions"], intervalMinutes: 360 }, ...base, displayTz: "Europe/Istanbul" }),
    gecis: await saved(pid, { range: { startDate: "2026-10-07", days: 7, planets: ["sun", "moon"], kinds: ["sublord", "rasi"] }, ...base, displayTz: "Europe/Istanbul" }),
    gochara: await saved(pid, { ayanamsa: "lahiri", atUtc: "2026-10-07T09:00" }, "vedic.transit"),
    kpChart: await saved(pid, { ayanamsa: "kp-newcomb", nodeType: "mean" }, "kp.chart"),
  };
  const out = { tag: TAG, ids, views: {} };
  const browser = await chromium.launch();
  for (const [W, Hh] of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: W, height: Hh }, isMobile: W < 640, hasTouch: W < 640, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
    await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: "localhost", path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: "localhost", path: "/" }]);
    await ctx.addInitScript(() => {
      localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
      localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    const open = async (id) => {
      await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 180000 });
      await page.waitForSelector(`[data-saved-item="${id}"]`, { timeout: 120000 });
      await page.locator(`[data-saved-item="${id}"]`).click();
      await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 60000 });
      await page.waitForTimeout(900);
    };
    const v = {};
    // 1) KP tek-an harita: 12 burç kutusu ilk bakışta (kaydırmadan) görünüyor mu?
    await open(ids.tekan);
    await page.waitForSelector("[data-testid=astro-kp-chart]", { timeout: 30000 });
    await page.waitForTimeout(600);
    v.chart = await page.evaluate(() => {
      const cells = [...document.querySelectorAll("[data-testid=astro-kp-chart] [data-kp-sign]")].filter((e) => e.offsetParent !== null);
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        let ok = r.top >= -0.5 && r.bottom <= window.innerHeight + 0.5 && r.left >= -0.5 && r.right <= window.innerWidth + 0.5;
        for (let p = el.parentElement; p && ok; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) {
            const q = p.getBoundingClientRect();
            if (r.top < q.top - 0.5 || r.bottom > q.bottom + 0.5 || r.left < q.left - 0.5 || r.right > q.right + 0.5) ok = false;
          }
        }
        return ok;
      };
      const grid = document.querySelector("[data-testid=astro-kp-chart] .grid") || document.querySelector("[data-testid=astro-kp-chart]");
      const g = grid.getBoundingClientRect();
      const clipped = cells.filter((c) => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1).length;
      const sc = document.querySelector("[data-testid=atlas-stage-scroll]");
      const dbg = sc ? { side: document.querySelector("[data-testid=astro-kp-chart]").dataset.kpSide, scTop: Math.round(sc.getBoundingClientRect().top), scBottom: Math.round(sc.getBoundingClientRect().bottom), scH: sc.clientHeight, gridTop: Math.round(g.top), gridBottom: Math.round(g.bottom), scScroll: sc.scrollTop } : null;
      const legend = document.querySelector("[data-testid=astro-kp-chart-legend]")?.textContent ?? "";
      return { dbg, legend, cells: cells.length, visibleCells: cells.filter(vis).length, fitsViewport: g.height <= window.innerHeight && g.width <= window.innerWidth, gridW: Math.round(g.width), gridH: Math.round(g.height), clippedCells: clipped, pageOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1 };
    });
    await shot(page, `harita-${W}x${Hh}`);
    // Odak / tam görünüm (varsa)
    const focus = page.locator("[data-testid=astro-kp-chart-focus]");
    if (await focus.count()) {
      await focus.first().click();
      await page.waitForTimeout(600);
      v.focus = await page.evaluate(() => {
        const d = document.querySelector("[data-testid=astro-kp-chart-dialog]");
        const cells = d ? [...d.querySelectorAll("[data-kp-sign]")] : [];
        const inView = cells.filter((c) => { const r = c.getBoundingClientRect(); return r.top >= -0.5 && r.bottom <= window.innerHeight + 0.5 && r.left >= -0.5 && r.right <= window.innerWidth + 0.5; }).length;
        return { open: !!d, cells: cells.length, inView };
      });
      await shot(page, `harita-odak-${W}x${Hh}`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      v.focus.closedByEsc = !(await page.locator("[data-testid=astro-kp-chart-dialog]").count());
    }
    // 2) Başlık: öğeler birbirinin üzerine biniyor mu?
    const headerCheck = () => page.evaluate(() => {
      const hd = document.querySelector("[data-testid=astro-result-view] header");
      const els = [...hd.querySelectorAll("h2, [data-testid=atlas-chart-meta] li, span.rounded-full, button, a")].filter((e) => e.offsetParent !== null && e.getBoundingClientRect().width > 0);
      const boxes = els.map((e) => ({ e, r: e.getBoundingClientRect() }));
      const hits = [];
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
          const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (w > 1 && h > 1) hits.push(`${(a.e.textContent || a.e.tagName).trim().slice(0, 24)} × ${(b.e.textContent || b.e.tagName).trim().slice(0, 24)}`);
        }
      const saved = [...hd.querySelectorAll("span")].find((s) => /Kaydedildi/.test(s.textContent || ""));
      const sr = saved?.getBoundingClientRect();
      const clippedText = els.filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== "ellipsis").length;
      return { overlaps: hits.length, sample: hits.slice(0, 4), savedVisible: !!sr && sr.width > 0 && sr.right <= window.innerWidth + 0.5, clippedText, headerH: Math.round(hd.getBoundingClientRect().height) };
    });
    v.header = await headerCheck();
    await shot(page.locator("[data-testid=astro-result-view] header"), `baslik-${W}x${Hh}`);
    await open(ids.gochara);
    v.headerGochara = await headerCheck();
    await shot(page.locator("[data-testid=astro-result-view] header"), `baslik-gochara-${W}x${Hh}`);
    // KP-UX-06 regresyon: cusp ÇİZEN KP doğum haritası Placidus/cusp açıklamasını KORUR; boyutu değişmez (fit yok).
    await open(ids.kpChart);
    await page.waitForSelector("[data-testid=astro-kp-chart]", { timeout: 30000 });
    v.kpChartLegend = await page.evaluate(() => {
      const c = document.querySelector("[data-testid=astro-kp-chart]");
      return { legend: c.querySelector("[data-testid=astro-kp-chart-legend]")?.textContent ?? "", fit: c.dataset.kpFit ?? null, cusps: c.querySelectorAll("[data-kp-item^=c]").length };
    });
    // 3) Konum tablosu: yatay gezinme kontrolü tablonun BAŞINA yakın ve ekranda mı?
    await open(ids.konum);
    await page.waitForSelector("[data-testid=astro-kp-positions-table]", { timeout: 30000 });
    await page.evaluate(() => document.querySelector("[data-testid=astro-kp-positions]").scrollIntoView({ block: "start" }));
    await page.waitForTimeout(400);
    v.table = await page.evaluate(() => {
      const sec = document.querySelector("[data-testid=astro-kp-positions]");
      const tbl = sec.querySelector("table");
      const sc = tbl.parentElement;
      const top = sec.getBoundingClientRect().top;
      const sb = sc.getBoundingClientRect();
      const ctrl = sec.querySelector("[data-testid=astro-kp-hscroll-top], [data-testid=astro-kp-hscroll-prev]");
      const cr = ctrl?.getBoundingClientRect();
      return {
        rows: tbl.querySelectorAll("tbody tr").length,
        overflowX: sc.scrollWidth > sc.clientWidth + 1,
        bottomScrollbarY: Math.round(sb.bottom - top),
        bottomScrollbarInView: sb.bottom <= window.innerHeight,
        topControl: !!ctrl,
        topControlY: cr ? Math.round(cr.top - top) : null,
        topControlInView: !!cr && cr.top >= 0 && cr.bottom <= window.innerHeight,
        pageOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    await shot(page, `konum-${W}x${Hh}`);
    // KP-UX-07 masaüstü: çubuk sol panelin görünen alt kenarında (başta + aşağı inince); en sonda son satırı örtmez.
    v.table.pos = await page.evaluate(() => document.querySelector("[data-testid=astro-kp-hscroll-bar]")?.getAttribute("data-kp-hscroll-pos") ?? null);
    const atBottomEdge = () =>
      page.evaluate(() => {
        const bar = document.querySelector("[data-testid=astro-kp-hscroll-bar]");
        const sc = document.querySelector("[data-testid=atlas-stage-scroll]");
        if (!bar || !sc) return null;
        const b = bar.getBoundingClientRect(), q = sc.getBoundingClientRect();
        const gap = q.bottom - b.bottom;
        const rows = document.querySelectorAll("[data-testid=astro-kp-positions-table] tbody tr");
        const last = rows[rows.length - 1].getBoundingClientRect();
        // Tablonun sonu görünür alanın altındaysa: çubuk görünen alt kenarda (≤2 px). Sonu görünüyorsa: çubuk son satırın
        // hemen altında (normal akış), satırı örtmez.
        if (last.bottom > q.bottom) return { ok: b.height > 0 && gap >= -2 && gap <= 2 && b.top >= q.top, gap: Math.round(gap), state: "kenarda" };
        return { ok: b.top >= last.bottom - 1 && b.bottom <= q.bottom + 1, gap: Math.round(gap), state: "tablo-sonu" };
      });
    v.table.bottomStart = await atBottomEdge();
    await page.evaluate(() => { const sc = document.querySelector("[data-testid=atlas-stage-scroll]"); if (sc) sc.scrollTop += 600; });
    await page.waitForTimeout(250);
    v.table.bottomMid = await atBottomEdge();
    v.table.endNoOverlap = await page.evaluate(() => {
      const sc = document.querySelector("[data-testid=atlas-stage-scroll]");
      if (!sc) return null;
      sc.scrollTop = sc.scrollHeight;
      const bar = document.querySelector("[data-testid=astro-kp-hscroll-bar]").getBoundingClientRect();
      const rows = document.querySelectorAll("[data-testid=astro-kp-positions-table] tbody tr");
      const last = rows[rows.length - 1].getBoundingClientRect();
      const q = sc.getBoundingClientRect();
      return bar.top >= last.bottom - 1 && last.bottom <= q.bottom && bar.bottom <= q.bottom + 1;
    });
    await page.evaluate(() => { const sec = document.querySelector("[data-testid=astro-kp-positions]"); sec.scrollIntoView({ block: "start" }); });
    await page.waitForTimeout(250);
    await shot(page, `konum-alt-${W}x${Hh}`);
    const next = page.locator("[data-testid=astro-kp-hscroll-next]");
    if (await next.count()) {
      const sc = page.locator("[data-testid=astro-kp-positions-table]").locator("xpath=..");
      const before = await sc.evaluate((e) => e.scrollLeft);
      for (let i = 0; i < 25 && !(await next.first().isDisabled()); i++) {
        await next.first().click().catch(() => {});
        await page.waitForTimeout(450);
      }
      v.table.nextDisabledAtEnd = await next.first().isDisabled();
      const after = await sc.evaluate((e) => e.scrollLeft);
      const topLeft = await page.locator("[data-testid=astro-kp-hscroll-top]").evaluate((e) => e.scrollLeft).catch(() => null);
      v.table.nextScrolls = after > before;
      v.table.topSynced = topLeft === null ? null : Math.abs(topLeft - after) <= 1;
      v.table.ketuVisible = await page.evaluate(() => {
        const th = [...document.querySelectorAll("[data-testid=astro-kp-positions-table] thead th")].pop();
        const sc = th.closest("table").parentElement.getBoundingClientRect();
        const r = th.getBoundingClientRect();
        return r.right <= sc.right + 1 && r.left >= sc.left - 1;
      });
      await shot(page, `konum-sag-${W}x${Hh}`);
      // Klavye: başa dön, tablo bölgesine odaklan, → tuşları.
      const region = page.locator("[data-testid=astro-kp-positions] [role=region]");
      await region.evaluate((e) => { e.scrollLeft = 0; });
      await page.waitForTimeout(200);
      await region.focus();
      for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(400);
      v.table.kbd = await page.evaluate(() => {
        const r = document.querySelector("[data-testid=astro-kp-positions] [role=region]");
        const top = document.querySelector("[data-testid=astro-kp-positions] [data-testid=astro-kp-hscroll-top]");
        return { focused: document.activeElement === r, moved: r.scrollLeft > 0, synced: Math.abs(top.scrollLeft - r.scrollLeft) <= 1 };
      });
    }
    v.errors = errors.length;
    out.views[`${W}x${Hh}`] = v;
    const tag = `[${W}x${Hh}]`;
    const desk = W >= 1024;
    ok(`${tag} KP-UX-05 harita: ${desk ? "12 burç kutusu kaydırmadan görünür" : "harita tek ekrana sığar"}; etiket kırpılmaz`, (desk ? v.chart.visibleCells === 12 : v.chart.fitsViewport) && v.chart.cells === 12 && v.chart.clippedCells === 0, `${v.chart.visibleCells}/12 · ${v.chart.gridW}×${v.chart.gridH}`);
    ok(`${tag} KP-UX-05 Tam görünüm: 12/12 ekranda, Esc ile kapanır`, !!v.focus && v.focus.open && v.focus.inView === 12 && v.focus.closedByEsc, JSON.stringify(v.focus));
    ok(`${tag} KP-UX-06 harita açıklaması cusp/Placidus anlatmaz; "cusp çizilmez" der`, !/Placidus|Çerçeveli etiket/.test(v.chart.legend) && /ev başlangıcı \(cusp\) çizilmez/.test(v.chart.legend), v.chart.legend.slice(0, 90));
    ok(`${tag} KP-UX-06 KP doğum haritası (cusp'lı): Placidus açıklaması ve eski boyut korunur`, /Çerçeveli etiket = Placidus ev başlangıcı \(cusp\)/.test(v.kpChartLegend.legend) && v.kpChartLegend.fit === null && v.kpChartLegend.cusps >= 12, JSON.stringify({ fit: v.kpChartLegend.fit, cusps: v.kpChartLegend.cusps }));
    ok(`${tag} KP-UX-04 başlık: öğeler üst üste binmez (KP + Gochara), "Kaydedildi" görünür`, v.header.overlaps === 0 && v.headerGochara.overlaps === 0 && v.header.savedVisible, `${v.header.sample.concat(v.headerGochara.sample).join(" | ")}`);
    if (desk) ok(`${tag} KP-UX-07 konum tablosu (28 an): ‹ › + çubuk sol panelin görünen ALT kenarında (tablonun sonuna inmeden)`, v.table.rows === 28 && v.table.overflowX && v.table.topControl && v.table.pos === "bottom" && v.table.bottomStart?.ok, JSON.stringify(v.table.bottomStart));
    else ok(`${tag} KP-UX-01 konum tablosu (28 an): telefonda ‹ › + çubuk tablonun başında (önceki davranış)`, v.table.rows === 28 && v.table.overflowX && v.table.topControl && v.table.pos === "top" && v.table.topControlY !== null && v.table.topControlY < 120, `y=${v.table.topControlY}`);
    ok(`${tag} KP-UX-01 › ile sona kadar (Ketu görünür), üst çubuk tabloyla senkron`, v.table.nextScrolls && v.table.nextDisabledAtEnd && v.table.ketuVisible && v.table.topSynced);
    ok(`${tag} KP-UX-01 klavye: tablo alanı odaklanır, → ile kayar, çubuk senkron`, v.table.kbd?.focused && v.table.kbd?.moved && v.table.kbd?.synced, JSON.stringify(v.table.kbd));
    if (desk) ok(`${tag} KP-UX-07 dikey kaydırmada çubuk alt kenarda kalır; tablonun sonunda son satırı örtmez`, v.table.bottomMid?.ok === true && v.table.endNoOverlap === true, JSON.stringify({ mid: v.table.bottomMid, end: v.table.endNoOverlap }));
    ok(`${tag} sayfada yatay taşma yok; konsol hatası yok`, !v.chart.pageOverflowX && !v.table.pageOverflowX && v.errors === 0, String(v.errors));
    await ctx.close();
  }
  await browser.close();
  if (OUT) fs.writeFileSync(path.join(OUT, `${TAG}-olcum.json`), JSON.stringify(out, null, 2));
  console.log(`
kp-ux e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
