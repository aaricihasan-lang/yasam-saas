/* eslint-disable @typescript-eslint/no-require-imports */
// Gökyüzü Atlası V4 — owner canlı önizleme geri bildirimleri (2026-11-06) — UI e2e. Sentetik "Deniz Aksoy" (15.07.1990) dosyası:
//   V4-001 analiz seçicisi açıkça "Analiz seç ▾" kutusu; kutunun tamamı tıklanır; Esc / klavye; seçimde hesaplama isteği yok.
//   V4-002 yatay taşan tabloda ÜST kaydırma şeridi (alt çubukla eşli); uzun listenin ortasında erişilir; sığınca şerit yok.
//   V4-003 dar bilgi panelinde ev başlangıçları (cusp) üst üste binmez; sütun sayısı PANEL genişliğine göre (3 → 2 → 1).
//   V4-004 masada yakınlaştırma grubu yok; harita alana sığar ve ayırıcıyla boyut değiştirir; çark etiketleri kesilmez.
//   + Atlas genel: Transit / Solar Return / Progresyon / Vedik D1 / KP / Sabit Yıldızlar — dar panelde her bölümde metin çakışması
//     taraması, sayfa yatay taşması, taşan tablolarda üst şerit.
// Ön koşul: yerel sahte arka uç (dev-fake-backend.ts) + next start (NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<sahte>) ve
//   önizleme tohum verisi (ATLAS-V4-ETKILESIMLI-ONIZLEME\arac\ornek-veri-tohumu.mjs). Gerçek DB / sağlayıcı YOK.
// Çalıştırma: node scripts/astrology/atlas-v4-owner-fixes.e2e.cjs http://localhost:4214 1536 864 [çıktı klasörü]
const { chromium } = require("playwright");
const { mkdirSync, writeFileSync } = require("node:fs");

const [ORIGIN = "http://localhost:4214", W = "1536", H = "864", OUT = ""] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const BASE = `${ORIGIN}/admin/astroloji`;
const TOKEN = "local-owner-token-aaaaaaaaaaaa";

let pass = 0;
let fail = 0;
const results = [];
function ok(name, cond, detail = "") {
  if (cond) pass++;
  else fail++;
  results.push({ name, ok: !!cond, detail });
  console.log(`  ${cond ? "✓" : "✗"} ${name}${detail && (!cond || process.env.V) ? ` — ${detail}` : ""}`);
}
const info = (name, detail) => {
  results.push({ name, ok: null, detail });
  console.log(`  · ${name} — ${detail}`);
};

/** Sayfada çalışır: kök altındaki görünür metin parçalarının (satır kutuları) birbirine binmesini arar. */
function overlapScan(rootSel) {
  const roots = Array.from(document.querySelectorAll(rootSel)).filter((r) => r.getClientRects().length > 0);
  const items = [];
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (!n.textContent.trim()) return NodeFilter.FILTER_REJECT;
        const el = n.parentElement;
        if (!el || el.closest("svg,.sr-only,[aria-hidden=true],[data-testid=atlas-hscroll-top],[data-testid=atlas-stage-hscroll]")) return NodeFilter.FILTER_REJECT;
        // Kapalı <details> gövdesi çizilmez (kutusu ölçülse de görünmez) → yalnız <summary> sayılır.
        const det = el.closest("details");
        if (det && !det.open && !el.closest("summary")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) {
      const el = n.parentElement;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      // Görünür kısım: kaydırma / kırpma yapan atalarının içinde kalan alan (kutunun dışına kaymış satırlar görünmez → sayılmaz).
      let clip = { l: -1e9, r: 1e9, t: -1e9, b: 1e9 };
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX !== "visible" || s.overflowY !== "visible") {
          const ar = a.getBoundingClientRect();
          clip = { l: Math.max(clip.l, ar.left), r: Math.min(clip.r, ar.right), t: Math.max(clip.t, ar.top), b: Math.min(clip.b, ar.bottom) };
        }
      }
      for (const rc of Array.from(rg.getClientRects())) {
        const box = { l: Math.max(rc.left, clip.l), r: Math.min(rc.right, clip.r), t: Math.max(rc.top, clip.t), b: Math.min(rc.bottom, clip.b) };
        if (box.r - box.l < 2 || box.b - box.t < 4) continue;
        items.push({ el, ...box, txt: n.textContent.trim().slice(0, 24) });
      }
    }
  }
  const hits = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ow = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const oh = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (ow > 2 && oh > 4) hits.push(`"${a.txt}" × "${b.txt}"`);
    }
  }
  return { texts: items.length, hits: hits.slice(0, 6), count: hits.length };
}

(async () => {
  if (OUT) mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "tr-TR", timezoneId: "Europe/Istanbul", deviceScaleFactor: 1 });
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
  page.on("dialog", (d) => void (d.type() === "beforeunload" ? d.accept() : d.dismiss()));
  let apiCalls = [];
  page.on("request", (r) => {
    if (/\/api\//.test(r.url())) apiCalls.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  const shot = async (name) => {
    if (!OUT) return;
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${width}-${name}.png` });
  };
  const pageOverflowX = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const divider = page.locator("[data-testid=atlas-desk-divider]").first();
  const setPanel = async (key) => {
    // Ayırıcı değeri HARİTA payıdır: Home = harita en dar (bilgi paneli en geniş) · End = harita en geniş (panel en dar) · Enter = %62.
    await divider.focus();
    await page.keyboard.press(key);
    await page.waitForTimeout(500);
  };
  const section = async (id) => {
    await page.locator(`[data-testid=atlas-result-sections] [data-section=${id}]:visible`).first().click();
    await page.waitForTimeout(600);
  };
  const panelW = () => page.locator("[data-testid=atlas-panel-scroll]").first().evaluate((el) => Math.round(el.clientWidth));

  // ── Arşiv → Deniz Aksoy (15.07.1990) → kayıtlı Natal
  await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("[data-portal=archive]", { timeout: 180000 });
  await page.locator("[data-portal=archive]").first().click();
  await page.waitForSelector("[data-testid=astro-archive-list]", { timeout: 90000 });
  const row = page.locator("[data-testid=astro-archive-list] tr, [data-testid=astro-archive-list] [role=row], [data-testid=astro-archive-list] li").filter({ hasText: "Deniz Aksoy" }).filter({ hasText: "15.07.1990" }).first();
  await row.locator("[title='Danışan dosyasını aç']").first().click();
  await page.waitForSelector("[data-testid=astro-saved-analyses] [data-saved-item]", { timeout: 90000 });
  await page.locator("[data-testid=astro-saved-analyses] [data-saved-item]", { hasText: "Deniz natal" }).first().click();
  await page.waitForSelector("[data-testid=natal-wheel-controls]", { timeout: 90000 });
  await page.waitForTimeout(1500);
  const isDesk = (await page.locator("[data-testid=atlas-desk-grid]").count()) > 0;
  info("düzen", isDesk ? "iki kolonlu masa" : "tablet / telefon düzeni");

  // ═════ V4-001 — analiz seçicisi
  const trigger = page.locator("[data-testid=atlas-picker-trigger]:visible").first();
  const cue = page.locator("[data-testid=atlas-picker-cue]:visible").first();
  ok("V4-001 'Analiz seç' metni görünür", (await cue.isVisible()) && /Analiz seç/.test(await cue.innerText()));
  const tb = await trigger.boundingBox();
  const cb = await cue.boundingBox();
  const hb = await page.locator("[data-testid=atlas-desk-header]:visible").first().boundingBox();
  ok("V4-001 seçim kutusu başlık genişliğini kaplar (minik ok değil)", tb.width >= hb.width * 0.7 && tb.height >= 40, `kutu ${Math.round(tb.width)}×${Math.round(tb.height)} · başlık ${Math.round(hb.width)}`);
  ok("V4-001 'Analiz seç ▾' kutunun içinde, sağda", cb.x >= tb.x && cb.x + cb.width <= tb.x + tb.width + 1 && cb.x > tb.x + tb.width / 2, JSON.stringify({ cue: [cb.x, cb.width], box: [tb.x, tb.width] }));
  const head = await page.locator("[data-testid=atlas-picker-headline]:visible").first().evaluate((el) => ({ fits: el.scrollWidth <= el.clientWidth + 1 || getComputedStyle(el).textOverflow === "ellipsis", txt: el.textContent }));
  ok("V4-001 analiz adı kutuda kısalır, taşmaz", head.fits, head.txt);
  ok("V4-001 erişilebilir ad görünür metni içerir", /^Analiz seç — şu an: Natal/.test((await trigger.getAttribute("aria-label")) ?? ""));
  // kutunun SOL ucuna (başlık metnine) tıklamak da açar
  await trigger.click({ position: { x: 14, y: tb.height / 2 } });
  const panel = page.locator("[data-testid=atlas-picker-panel]").first();
  await panel.waitFor({ state: "visible", timeout: 10000 });
  ok("V4-001 kutunun sol ucuna tıklayınca liste açılır", await panel.isVisible());
  await shot("v4-001-secici-acik");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  ok("V4-001 Esc kapatır, odak kutuya döner", (await panel.count()) === 0 && (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "atlas-picker-trigger");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(300);
  ok("V4-001 klavye (↓) ile açılır", await page.locator("[data-testid=atlas-picker-panel]").first().isVisible());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  /** Seçiciden kayıtlı analiz seçer; seçim sırasında giden API çağrılarını döndürür. */
  const pickSaved = async (prefix) => {
    await trigger.click();
    await page.locator("[data-testid=atlas-picker-panel]").first().waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(() => !document.querySelector("[data-testid=atlas-picker-panel][data-loading]"), null, { timeout: 30000 });
    const opt = page.locator(`[data-testid=atlas-picker-panel] [role=option][data-picker-technique^='${prefix}']`).first();
    if ((await opt.count()) === 0) {
      await page.keyboard.press("Escape");
      return null;
    }
    await opt.scrollIntoViewIfNeeded();
    apiCalls = [];
    await opt.click();
    await page.waitForTimeout(2200);
    return [...apiCalls];
  };
  const headline = async () => (await page.locator("[data-testid=atlas-picker-headline]:visible").first().innerText()).replace(/\s+/g, " ").trim();
  const callsT = await pickSaved("western.transit");
  ok("V4-001 Natal → Transit geçişi", callsT !== null && /^Transit/.test(await headline()), await headline());
  const calcT = (callsT ?? []).filter((c) => /^POST /.test(c) || /calculate|hesapla|roxy|interpret/i.test(c));
  ok("V4-001 seçimde hesaplama / kayıt / yorum isteği yok", calcT.length === 0, calcT.join(", ") || (callsT ?? []).join(", "));
  const callsN = await pickSaved("western.natal");
  ok("V4-001 Transit → Natal dönüşü", callsN !== null && /^Natal/.test(await headline()), await headline());
  ok("V4-001 dönüşte de hesaplama isteği yok", (callsN ?? []).filter((c) => /^POST /.test(c) || /calculate|roxy/i.test(c)).length === 0, (callsN ?? []).join(", "));
  await page.waitForSelector("[data-testid=natal-wheel-controls]", { timeout: 30000 });

  // ═════ V4-004 — yakınlaştırma grubu yok; harita sığar ve ayırıcıyla boyut değiştirir
  ok("V4-004 masada yakınlaştırma grubu yok (+ / % / − / sığdır)", (await page.locator("[data-testid=astro-result-view] [data-testid=atlas-zoom-in], [data-testid=astro-result-view] [data-testid=atlas-zoom-out], [data-testid=astro-result-view] [data-testid=atlas-zoom-level], [data-testid=astro-result-view] [data-testid=atlas-zoom-fit]").count()) === 0);
  ok("V4-004 Odak modu düğmesi korunur", await page.locator("[data-testid=atlas-chart-expand]:visible").first().isVisible());
  const chartGeom = () =>
    page.locator("[data-testid=atlas-chart-fit]").first().evaluate((el) => {
      const f = el.getBoundingClientRect();
      const svg = el.querySelector("svg");
      const box = svg.getBoundingClientRect();
      // Çizilen çark = viewBox'ın kutuya oranı koruyarak sığdırılmış hâli (preserveAspectRatio varsayılanı xMidYMid meet).
      const vb = (svg.getAttribute("viewBox") || "0 0 1 1").split(/[ ,]+/).map(Number);
      const k = Math.min(box.width / vb[2], box.height / vb[3]);
      const s = { width: vb[2] * k, height: vb[3] * k };
      const card = el.closest("[data-testid=atlas-chart-card]")?.getBoundingClientRect() ?? f;
      let outside = 0;
      const sample = [];
      for (const t of Array.from(svg.querySelectorAll("text"))) {
        const r = t.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.left < card.left - 0.5 || r.right > card.right + 0.5 || r.top < card.top - 0.5 || r.bottom > card.bottom + 0.5) {
          outside++;
          if (sample.length < 4) sample.push(t.textContent);
        }
      }
      const angles = Array.from(svg.querySelectorAll("text")).filter((t) => /(ASC|DSC|MC|IC)$/.test((t.textContent || "").trim())).length;
      return { fw: Math.round(f.width), fh: Math.round(f.height), sw: Math.round(s.width), sh: Math.round(s.height), square: Math.abs(s.width - s.height) <= 1, outside, sample, angles };
    });
  if (isDesk) {
    await setPanel("Enter"); // %62 / %38 başlangıç
    const g0 = await chartGeom();
    ok("V4-004 harita kare, kabın kısa kenarını doldurur", g0.square && Math.abs(Math.min(g0.fw, g0.fh) - g0.sw) <= 12, JSON.stringify(g0));
    ok("V4-004 çark yazıları (ASC/DSC/MC/IC dahil) kartın dışına taşmaz", g0.outside === 0 && g0.angles >= 4, JSON.stringify({ outside: g0.outside, sample: g0.sample, angles: g0.angles }));
    await setPanel("Home"); // harita en dar → bilgi paneli en geniş
    const g1 = await chartGeom();
    await setPanel("End"); // harita en geniş → bilgi paneli en dar
    const g2 = await chartGeom();
    ok("V4-004 ayırıcıyla daraltınca harita küçülür, genişletince büyür (oran korunur)", g1.sw < g0.sw && g2.sw >= g0.sw && g1.square && g2.square, `dar ${g1.sw} · başlangıç ${g0.sw} · geniş ${g2.sw}`);
    ok("V4-004 dar / geniş haritada da yazılar kartın içinde", g1.outside === 0 && g2.outside === 0, `${g1.outside}/${g2.outside}`);
    info("V4-004 harita ölçüleri (px)", `başlangıç ${g0.sw}×${g0.sh} · harita en dar ${g1.sw} · harita en geniş ${g2.sw} (kap ${g2.fw}×${g2.fh})`);
  } else {
    const g = await chartGeom();
    ok("V4-004 (tablet/telefon) harita kare ve kabına sığar", g.square && g.outside === 0, JSON.stringify(g));
  }

  // ═════ V4-002 — üst yatay kaydırma (Natal → Gezegenler, panel EN DAR)
  if (isDesk) await setPanel("End");
  await section("gezegenler");
  if (!isDesk) {
    // Telefon / tablet: sayfa kayar — kullanıcı gibi tabloya iner (yapışkan bölüm başlığı + şerit tablonun üstünde kalır).
    await page.evaluate(() => document.querySelector("#atlas-result-panel table")?.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(600);
  }
  const top = page.locator("[data-testid=atlas-hscroll-top]:visible").first();
  const hasTop = (await top.count()) > 0;
  info("V4-002 bilgi içeriği genişliği (panel en dar)", isDesk ? `${await panelW()} px` : "telefon / tablet");
  const planetsOverflow = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#atlas-result-panel *")).some((el) => {
      const ox = getComputedStyle(el).overflowX;
      return (ox === "auto" || ox === "scroll") && el.scrollWidth - el.clientWidth > 1 && el.getClientRects().length > 0;
    }),
  );
  if (planetsOverflow) ok("V4-002 taşan Gezegenler tablosunda üst kaydırma şeridi var ve tabloya bağlı", hasTop && (await top.getAttribute("data-active")) === "1", hasTop ? `${await top.getAttribute("data-target-label")}` : "şerit yok");
  else ok("V4-002 Gezegenler tablosu bu genişlikte sığıyor → gereksiz şerit yok", !hasTop);
  if (hasTop) {
    ok("V4-002 şerit Gezegenler tablosuna bağlı", /Gezegen/.test((await top.getAttribute("data-target-label")) ?? ""), await top.getAttribute("data-target-label"));
    const sync = await page.evaluate(async () => {
      const bar = document.querySelector("[data-testid=atlas-hscroll-top-bar]");
      const scope = document.querySelector("[data-testid=atlas-panel-scroll]") ?? bar.closest("[data-testid=atlas-info-panel]")?.parentElement ?? document.body;
      const cands = Array.from(document.querySelectorAll('[data-testid=atlas-result-panel], #atlas-result-panel')).flatMap((r) => Array.from(r.querySelectorAll("*"))).filter((el) => {
        const ox = getComputedStyle(el).overflowX;
        return (ox === "auto" || ox === "scroll") && el.scrollWidth - el.clientWidth > 1;
      });
      const t = cands[0];
      if (!t) return { err: "taşan tablo yok", scope: !!scope };
      const wait = () => new Promise((r) => setTimeout(r, 250));
      bar.scrollLeft = 40;
      bar.dispatchEvent(new Event("scroll"));
      await wait();
      const a = Math.round(t.scrollLeft);
      t.scrollLeft = 15;
      t.dispatchEvent(new Event("scroll"));
      await wait();
      const b = Math.round(bar.scrollLeft);
      const range = t.scrollWidth - t.clientWidth;
      t.scrollLeft = range;
      await wait();
      const end = Math.round(bar.scrollLeft);
      t.scrollLeft = 0;
      await wait();
      return { a, b, range, end, endBar: Math.round(bar.scrollWidth - bar.clientWidth) };
    });
    ok("V4-002 üst şerit → tablo (alt çubuk) eşlenir", sync.a === 40, JSON.stringify(sync));
    ok("V4-002 tablo (alt çubuk) → üst şerit eşlenir", sync.b === 15, JSON.stringify(sync));
    ok("V4-002 son sütuna kadar aynı aralık (piksel eşleşmesi)", sync.end === sync.range && sync.endBar === sync.range, JSON.stringify(sync));
    await page.locator("[data-testid=atlas-hscroll-top-right]:visible").first().click();
    await page.waitForTimeout(700);
    const afterBtn = await page.evaluate(() => Math.round(document.querySelector("[data-testid=atlas-hscroll-top-bar]").scrollLeft));
    ok("V4-002 '›' düğmesi sağa kaydırır", afterBtn > 0, String(afterBtn));
    await page.locator("[data-testid=atlas-hscroll-top-bar]:visible").first().focus();
    await page.keyboard.press("Home");
    await page.waitForTimeout(300);
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    const afterKey = await page.evaluate(() => Math.round(document.querySelector("[data-testid=atlas-hscroll-top-bar]").scrollLeft));
    ok("V4-002 şerit klavyeyle (→) kaydırılır", afterKey > 0, String(afterKey));
    await shot("v4-002-gezegenler-ust-kaydirma");
  }
  // Uzun liste: Açılar — listenin ORTASINDAYKEN üst şerit görünür alanda ve tabloya bağlı
  await section("acilar");
  const mid = await page.evaluate(async () => {
    const box = document.querySelector("[data-testid=astro-aspects-scroll]");
    const scope = document.querySelector("[data-testid=atlas-panel-scroll]");
    if (!box) return { err: "açı tablosu yok" };
    box.scrollTop = Math.floor((box.scrollHeight - box.clientHeight) / 2);
    if (scope) scope.scrollTop = Math.floor((scope.scrollHeight - scope.clientHeight) / 2);
    else {
      // Telefon / tablet: sayfa kayar — kullanıcı gibi önce listeye iner, sonra listenin ortasına.
      box.scrollIntoView({ block: "start" });
      await new Promise((r) => setTimeout(r, 300));
      window.scrollBy(0, Math.floor(box.getBoundingClientRect().height / 2));
    }
    await new Promise((r) => setTimeout(r, 400));
    const top = Array.from(document.querySelectorAll("[data-testid=atlas-hscroll-top]")).find((e) => e.getClientRects().length > 0);
    const pinBar = document.querySelector("[data-testid=atlas-mobile-sections-bar]");
    const inner = pinBar?.firstElementChild?.getBoundingClientRect();
    const barOnScreen = inner ? inner.top >= -0.5 && inner.bottom <= window.innerHeight + 0.5 : null;
    if (!top) return { overflow: box.scrollWidth - box.clientWidth, top: null, pinned: pinBar ? pinBar.dataset.pinned : "masa", barOnScreen };
    const r = top.getBoundingClientRect();
    return { overflow: box.scrollWidth - box.clientWidth, visible: r.top >= 0 && r.bottom <= window.innerHeight, active: top.dataset.active, label: top.dataset.targetLabel, boxScrollTop: box.scrollTop, pinned: pinBar ? pinBar.dataset.pinned : "masa", barOnScreen };
  });
  if (mid.overflow > 1) ok("V4-002 uzun Açılar listesinin ortasında üst şerit ekranda ve tabloya bağlı", mid.visible && mid.active === "1", JSON.stringify(mid));
  // Başlık doğal yerinden çıkmışsa sabitlenir; sayfa o kadar kaymıyorsa zaten yerinde görünür — her iki durumda EKRANDA.
  if (!isDesk) ok("telefon/tablet: uzun listenin ortasında bölüm çipleri + şerit ekranda (gerekirse üstte sabit)", mid.barOnScreen === true, JSON.stringify(mid));
  else info("V4-002 Açılar tablosu bu genişlikte yatay taşmıyor (şerit gerekmez)", JSON.stringify(mid));
  ok("V4-002 sayfa yatay taşmıyor (panel en dar)", (await pageOverflowX()) <= 1, String(await pageOverflowX()));
  if (isDesk) {
    await setPanel("Home");
    await section("gezegenler");
    const wideTop = await page.locator("[data-testid=atlas-hscroll-top]:visible").count();
    const fits = await page.evaluate(() => {
      const p = document.querySelector("#atlas-result-panel");
      return Array.from(p.querySelectorAll("*")).every((el) => {
        const ox = getComputedStyle(el).overflowX;
        return !(ox === "auto" || ox === "scroll") || el.scrollWidth - el.clientWidth <= 1;
      });
    });
    ok("V4-002 geniş panelde tablo sığınca gereksiz şerit yok", fits ? wideTop === 0 : wideTop === 1, `sığıyor=${fits} şerit=${wideTop} · içerik ${await panelW()} px`);
  }

  // ═════ V4-003 — Evler: ev başlangıçları (cusp) dar / orta / geniş panelde ve uygulama menüsü açık / kapalı
  const cusps = () =>
    page.locator("[data-fit-grid=cusps]:visible").first().evaluate((g) => {
      const cells = Array.from(g.children);
      const cols = new Set(cells.map((c) => Math.round(c.getBoundingClientRect().left))).size;
      let bad = 0;
      const badTxt = [];
      for (const c of cells) {
        const cr = c.getBoundingClientRect();
        for (const k of Array.from(c.querySelectorAll("*"))) {
          const r = k.getBoundingClientRect();
          if (r.width === 0) continue;
          if (r.left < cr.left - 0.5 || r.right > cr.right + 0.5) {
            bad++;
            if (badTxt.length < 3) badTxt.push(c.textContent);
            break;
          }
        }
      }
      const texts = cells.map((c) => c.textContent.replace(/\s+/g, " ").trim());
      return { n: cells.length, cols, bad, badTxt, gw: Math.round(g.clientWidth), texts, okFmt: texts.every((t) => /^\d{1,2}\. ev\s*\S+.*\d+°\d+′/.test(t)) };
    });
  const sideToggle = page.locator("[data-testid=side-menu] button:has(svg.lucide-chevrons-left)").first();
  const variants = [];
  if (isDesk) {
    for (const [key, name] of [["End", "panel en dar"], ["Enter", "panel orta (%62/%38)"], ["Home", "panel en geniş"]]) {
      await setPanel(key);
      await section("evler");
      variants.push({ name, ...(await cusps()), overlap: await page.evaluate(overlapScan, "#atlas-result-panel") });
    }
    if ((await sideToggle.count()) > 0 && (await sideToggle.isVisible())) {
      await sideToggle.click();
      await page.waitForTimeout(900);
      await setPanel("End");
      await section("evler");
      variants.push({ name: "uygulama menüsü kapalı · panel en dar", ...(await cusps()), overlap: await page.evaluate(overlapScan, "#atlas-result-panel") });
      const t2 = page.locator("[data-testid=side-menu] button:has(svg.lucide-chevrons-left), button:has(svg.lucide-chevrons-right)").first();
      if ((await t2.count()) > 0) await t2.click().catch(() => undefined);
      await page.waitForTimeout(900);
    } else info("uygulama menüsü daraltma düğmesi bulunamadı", "menü kapalı varyantı atlandı");
  } else {
    await section("evler");
    variants.push({ name: `telefon/tablet ${width}px`, ...(await cusps()), overlap: await page.evaluate(overlapScan, "#atlas-result-panel") });
  }
  const ref = variants[0]?.texts?.join("|");
  for (const v of variants) {
    ok(`V4-003 [${v.name}] 12 ev eksiksiz ve biçimli (N. ev + burç + derece)`, v.n === 12 && v.okFmt, v.texts.slice(0, 3).join(" / "));
    ok(`V4-003 [${v.name}] hücre içeriği hücreden taşmaz`, v.bad === 0, v.badTxt.join(" | "));
    ok(`V4-003 [${v.name}] Evler bölümünde metin çakışması yok`, v.overlap.count === 0, v.overlap.hits.join(" ; "));
    ok(`V4-003 [${v.name}] değerler ve sıra değişmez`, v.texts.join("|") === ref);
    info(`V4-003 [${v.name}] sütun`, `${v.cols} sütun · ızgara ${v.gw} px`);
  }
  if (isDesk && variants.length >= 3) ok("V4-003 sütun sayısı panel genişliğine göre artar (dar ≤ orta ≤ geniş, geniş = 3)", variants[0].cols <= variants[1].cols && variants[1].cols <= variants[2].cols && variants[2].cols === 3, variants.map((v) => v.cols).join(" → "));
  if (isDesk) await setPanel("End");
  await section("evler");
  await shot("v4-003-evler-dar-panel");

  // Natal'in diğer bölümleri (dar panel): metin çakışması taraması
  for (const id of ["harita", "gezegenler", "acilar", "semboller"]) {
    if ((await page.locator(`[data-testid=atlas-result-sections] [data-section=${id}]:visible`).count()) === 0) continue;
    await section(id);
    const o = await page.evaluate(overlapScan, "#atlas-result-panel");
    ok(`Natal · ${id} — dar panelde metin çakışması yok`, o.count === 0, o.hits.join(" ; "));
  }

  // ═════ Atlas genel regresyon — diğer teknikler (dar panel)
  const techs = [
    ["western.transit", "Transit"],
    ["western.solar_return", "Solar Return"],
    ["western.progression", "Secondary Progression"],
    ["vedic.d1", "Vedik D1"],
    ["kp.chart", "KP"],
    ["western.fixed_stars", "Sabit Yıldızlar"],
  ];
  const summary = [];
  for (const [prefix, name] of techs) {
    const calls = await pickSaved(prefix);
    if (calls === null) {
      ok(`${name} — seçicide kayıtlı analiz bulundu`, false, "yok");
      continue;
    }
    ok(`${name} — seçicide açıldı, hesaplama isteği yok`, calls.filter((c) => /^POST /.test(c) || /calculate|roxy/i.test(c)).length === 0, calls.join(", "));
    if (isDesk) await setPanel("End");
    const layout = await page.locator("[data-testid=atlas-desk-grid]").first().getAttribute("data-layout").catch(() => "mobil");
    const stageO = await page.evaluate(overlapScan, "[data-testid=atlas-stage-scroll], [data-testid=atlas-mobile-stage]");
    const stageTop = await page.locator("[data-testid=atlas-stage-hscroll]:visible").count();
    const stageOverflow = await page.evaluate(() => {
      const r = document.querySelector("[data-testid=atlas-stage-scroll], [data-testid=atlas-mobile-stage]");
      if (!r) return 0;
      return [r, ...Array.from(r.querySelectorAll("*"))].filter((el) => {
        const ox = getComputedStyle(el).overflowX;
        return (ox === "auto" || ox === "scroll") && el.scrollWidth - el.clientWidth > 1 && el.getClientRects().length > 0;
      }).length;
    });
    if (stageO.texts > 0) ok(`${name} — sol teknik sonuç alanında metin çakışması yok`, stageO.count === 0, stageO.hits.join(" ; "));
    if (stageOverflow > 0) ok(`${name} — sol alanda taşan ${stageOverflow} tablo için üst şerit var`, stageTop === 1);
    if (isDesk && layout === "table") {
      // Sol teknik sonuç alanı EN DAR (harita / sonuç payı en küçük): çakışma yok; taşan tablo varsa üst şerit var.
      await setPanel("Home");
      const o2 = await page.evaluate(overlapScan, "[data-testid=atlas-stage-scroll]");
      const ov2 = await page.evaluate(() => {
        const r = document.querySelector("[data-testid=atlas-stage-scroll]");
        return r ? [r, ...Array.from(r.querySelectorAll("*"))].filter((el) => { const ox = getComputedStyle(el).overflowX; return (ox === "auto" || ox === "scroll") && el.scrollWidth - el.clientWidth > 1 && el.getClientRects().length > 0; }).length : 0;
      });
      const top2 = await page.locator("[data-testid=atlas-stage-hscroll]:visible").count();
      ok(`${name} — sol alan EN DAR: metin çakışması yok`, o2.count === 0, o2.hits.join(" ; "));
      if (ov2 > 0) ok(`${name} — sol alan EN DAR: taşan ${ov2} kap → üst şerit var`, top2 === 1);
      info(`${name} sol alan en dar`, `${await page.locator("[data-testid=atlas-stage-scroll]").first().evaluate((el) => el.clientWidth)} px · taşan ${ov2}`);
      await shot(`teknik-${prefix.replace(/\W+/g, "-")}-sol-dar`);
      await setPanel("End");
    }
    const ids = await page.locator("[data-testid=atlas-result-sections]:visible [data-section]").evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));
    const perTab = [];
    for (const id of ids) {
      if (id === "bilgi" || id === "not") continue; // kendi biçimli metin alanları (taslak); veri tablosu yok
      await section(id);
      const o = await page.evaluate(overlapScan, "#atlas-result-panel");
      const ov = await page.evaluate(() => {
        const p = document.querySelector("#atlas-result-panel");
        const scope = document.querySelector("[data-testid=atlas-panel-scroll]") ?? p;
        return [scope, ...Array.from(p.querySelectorAll("*"))].filter((el) => {
          const ox = getComputedStyle(el).overflowX;
          return (ox === "auto" || ox === "scroll") && el.scrollWidth - el.clientWidth > 1 && el.getClientRects().length > 0;
        }).length;
      });
      const topN = await page.locator("[data-testid=atlas-hscroll-top]:visible").count();
      ok(`${name} · ${id} — metin çakışması yok`, o.count === 0, o.hits.join(" ; "));
      if (ov > 0) ok(`${name} · ${id} — ${ov} taşan kap → üst şerit var`, topN === 1);
      perTab.push(`${id}${ov ? `(taşan ${ov})` : ""}`);
    }
    ok(`${name} — sayfa yatay taşmıyor`, (await pageOverflowX()) <= 1, String(await pageOverflowX()));
    summary.push(`${name}: düzen=${layout} · sol alan taşan=${stageOverflow} · bölümler: ${perTab.join(", ")}`);
    await shot(`teknik-${prefix.replace(/\W+/g, "-")}`);
  }
  for (const s of summary) info("envanter", s);

  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));
  console.log(`\n${pass} PASS · ${fail} FAIL`);
  if (OUT) writeFileSync(`${OUT}/${width}-sonuc.json`, JSON.stringify({ width, height, pass, fail, results }, null, 2));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
