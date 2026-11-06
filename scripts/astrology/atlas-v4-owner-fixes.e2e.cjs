/* eslint-disable @typescript-eslint/no-require-imports */
// Gökyüzü Atlası V4 — owner canlı önizleme geri bildirimleri (2026-11-06) — UI e2e. Sentetik "Deniz Aksoy" (15.07.1990) dosyası:
//   V4-001 analiz seçicisi açıkça "Analiz seç ▾" kutusu; kutunun tamamı tıklanır; Esc / klavye; seçimde hesaplama isteği yok.
//   V4-002B yatay kaydırma şeridi sonuç alanının GÖRÜNEN ALT KENARINDA, yalnız taşan tablo ekrandayken (alt çubukla eşli);
//     uzun listenin ortasında erişilir; sığınca kaybolur, daralınca geri gelir; bölüm geçişinde doğru tabloya bağlanır.
//   V4-005 sağ üst alan tekrarsız: danışan adı / doğum bilgisi bir kez; künye satırı teknik özet; "Künye ▾" yalnız ek ayrıntı.
//   V4-003 dar bilgi panelinde ev başlangıçları (cusp) üst üste binmez; sütun sayısı PANEL genişliğine göre (3 → 2 → 1).
//   V4-004 harita alana sığar ve ayırıcıyla boyut değiştirir; çark etiketleri kesilmez.
//   ZOOM (owner son yerleşim kararı, 06.11.2026): − + ⛶ araç satırında, sayaç ile "Odak modu" arasında; % yok; + / − / sığdır;
//     harita ÜZERİNDE tekerlek yakınlaştırır, dışında normal kaydırma; Odak modu bağımsız; istek yok; telefonda iki parmak
//     (PointerEvent benzetimi — fiziksel cihaz DEĞİL).
//   + Atlas genel: Transit / Solar Return / Progresyon / Vedik D1 / KP / Sabit Yıldızlar — dar panelde her bölümde metin çakışması
//     taraması, sayfa yatay taşması, ekrandaki taşan tablolarda alt şerit.
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
        if (!el || el.closest("svg,.sr-only,[aria-hidden=true],[data-testid=atlas-hscroll],[data-testid=atlas-stage-hscroll]")) return NodeFilter.FILTER_REJECT;
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
      for (let a = el; a && a !== document.body; a = a.parentElement) {
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

  // ═════ V4-005 — sağ üst bilgi alanı TEKRARSIZ: danışan kimliği bir kez · analiz seçici · teknik künye (+ yalnız ek ayrıntılar)
  const hdrInfo = () =>
    page.evaluate(() => {
      const h = Array.from(document.querySelectorAll("[data-testid=atlas-desk-header]")).find((e) => e.getClientRects().length > 0);
      const txt = h.innerText.replace(/\s+/g, " ");
      const count = (needle) => txt.split(needle).length - 1;
      const meta = document.querySelector("#atlas-desk-header-details");
      return {
        h: Math.round(h.getBoundingClientRect().height),
        name: count("Deniz Aksoy"),
        birth: count("15.07.1990"),
        place: count("İstanbul"),
        metaTxt: (meta?.innerText ?? "").replace(/\s+/g, " ").trim(),
        mode: meta?.dataset.meta,
        overflowX: h.scrollWidth - h.clientWidth,
        actions: ["Word", "PDF", "Teknik Ekle"].map((t) => Array.from(h.querySelectorAll("button, a")).some((b) => b.textContent.includes(t) && b.getClientRects().length > 0)),
      };
    });
  const hc = await hdrInfo();
  ok("V4-005 danışan adı başlıkta YALNIZ BİR KEZ", hc.name === 1, JSON.stringify(hc));
  ok("V4-005 doğum tarihi ve yeri başlıkta yalnız bir kez", hc.birth === 1 && hc.place === 1, JSON.stringify(hc));
  ok("V4-005 künye satırı yalnız teknik özet (teknik adı / kayıt zamanı tekrar edilmez)", /Tropikal/.test(hc.metaTxt) && /Placidus/.test(hc.metaTxt) && !/kayıt/i.test(hc.metaTxt) && !/^Natal\b/.test(hc.metaTxt), hc.metaTxt);
  ok("V4-005 analiz seçici belirgin ('Analiz seç ▾') ve Natal başlığı seçicide", (await page.locator("[data-testid=atlas-picker-cue]:visible").count()) === 1 && /^Natal/.test((await page.locator("[data-testid=atlas-picker-headline]:visible").first().innerText()).trim()));
  ok("V4-005 Word / PDF / Teknik Ekle erişilebilir", hc.actions.every(Boolean), JSON.stringify(hc.actions));
  ok("V4-005 başlık yatay taşmıyor", hc.overflowX <= 1, String(hc.overflowX));
  const hdrOverlap = await page.evaluate(overlapScan, "[data-testid=atlas-desk-header]");
  ok("V4-005 başlıkta metin çakışması yok (uzun ad / dar panel)", hdrOverlap.count === 0, hdrOverlap.hits.join(" ; "));
  await page.locator("[data-testid=atlas-desk-meta-toggle]:visible").first().click();
  await page.waitForTimeout(300);
  const ho = await hdrInfo();
  const kunyeTxt = ((await page.locator("[data-testid=atlas-desk-kunye]:visible").first().innerText().catch(() => "")) || "").replace(/\s+/g, " ");
  ok("V4-005 Künye ▾ açılınca ek teknik ayrıntılar (kayıt zamanı, doğum profili revizyonu, saat dilimi, saat doğruluğu)", /Kayıt zamanı/.test(kunyeTxt) && /rev \d/.test(kunyeTxt) && /Saat dilimi/.test(kunyeTxt) && /Europe\/Istanbul/.test(kunyeTxt) && /Saat doğruluğu/.test(kunyeTxt), kunyeTxt);
  ok("V4-005 Künye açıkken de ad / doğum tarihi / yer TEKRAR EDİLMEZ", ho.name === 1 && ho.birth === 1 && ho.place === 1 && !/Deniz Aksoy/.test(kunyeTxt), JSON.stringify({ name: ho.name, birth: ho.birth, place: ho.place }));
  ok("V4-005 Künye açıkken teknik özet tam (kısaltmasız) görünür", ho.mode === "full" && /Tropikal/.test(ho.metaTxt) && /düğüm/i.test(ho.metaTxt), ho.metaTxt.slice(0, 160));
  await shot("v4-005-kunye-acik");
  await page.locator("[data-testid=atlas-desk-meta-toggle]:visible").first().click();
  await page.waitForTimeout(300);
  const hcl = await hdrInfo();
  ok("V4-005 Künye ▴ ile yeniden kompakt (aynı yükseklik)", hcl.h === hc.h && hcl.mode === "compact", `${hc.h} → ${ho.h} → ${hcl.h}`);
  info("V4-005 başlık yüksekliği", `kapalı ${hc.h}px · açık ${ho.h}px`);

  // ═════ V4-004 — harita sığar ve ayırıcıyla boyut değiştirir (yakınlaştırma düğmeleri araç satırında; aşağıda ZOOM)
  ok("V4-004 haritanın üstünde ayrı yakınlaştırma kartı / % göstergesi yok", (await page.locator("[data-testid=astro-result-view] [data-testid=atlas-zoom-level], [data-testid=atlas-chart-frame] [role=toolbar], [data-testid=atlas-chart-frame] [data-testid=atlas-zoom-in]").count()) === 0);
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

  // ═════ ZOOM — owner son yerleşim kararı
  if (isDesk) await setPanel("Enter");
  const zc = page.locator("[data-testid=atlas-chart-toolbar] [data-testid=atlas-zoom-controls]:visible").first();
  const zvp = page.locator("[data-testid=atlas-chart-fit] [data-testid=atlas-chart-viewport]").first();
  const zs = async () => Number(await zvp.getAttribute("data-scale"));
  ok("ZOOM kontroller harita araç satırında (tek grup)", (await page.locator("[data-testid=atlas-chart-toolbar] [data-testid=atlas-zoom-controls]:visible").count()) === 1);
  const place = await page.evaluate(() => {
    const g = document.querySelector("[data-testid=atlas-chart-toolbar] [data-testid=atlas-zoom-controls]");
    const f = document.querySelector("[data-testid=atlas-chart-toolbar] [data-testid=atlas-chart-expand]");
    const c = document.querySelector("[data-testid=natal-aspect-counts]");
    const tb = document.querySelector("[data-testid=atlas-chart-toolbar]");
    const R = (e) => e.getBoundingClientRect();
    const gr = R(g);
    const fr = R(f);
    const cr = c ? R(c) : null;
    const counterShown = !!cr && cr.width > 2 && getComputedStyle(c).position !== "absolute";
    const ids = Array.from(g.querySelectorAll("button")).map((b) => b.dataset.testid);
    const sizes = Array.from(g.querySelectorAll("button")).map((b) => Math.round(Math.min(R(b).width, R(b).height)));
    return {
      ids,
      sizes,
      text: g.textContent.trim(),
      beforeFocus: gr.right <= fr.left + 1 && fr.left - gr.right <= 12,
      sameRow: Math.min(gr.bottom, fr.bottom) - Math.max(gr.top, fr.top) > 8,
      afterCounter: counterShown ? cr.right <= gr.left + 1 && Math.min(gr.bottom, cr.bottom) - Math.max(gr.top, cr.top) > 4 : null,
      inToolbar: gr.left >= R(tb).left - 0.5 && gr.right <= R(tb).right + 0.5,
      onScreen: gr.right <= window.innerWidth && gr.left >= 0,
      tbOverflow: tb.scrollWidth - tb.clientWidth,
      tbH: tb.offsetHeight,
      tight: tb.dataset.tight ?? "yok",
      counterShown,
      titles: Array.from(g.querySelectorAll("button")).map((b) => b.title),
    };
  });
  ok("ZOOM sıra − · + · ⛶, yüzde yazısı yok", place.ids.join(",") === "atlas-zoom-out,atlas-zoom-in,atlas-zoom-fit" && !/%/.test(place.text), JSON.stringify(place.ids));
  ok("ZOOM 'Odak modu'nun hemen solunda, aynı satırda", place.beforeFocus && place.sameRow, JSON.stringify(place));
  if (place.afterCounter !== null) ok("ZOOM sayaç ('Açı listesi … · çarkta çizili …') ile Odak modu ARASINDA", place.afterCounter === true, JSON.stringify(place));
  else info("ZOOM sayaç bu genişlikte ekranda gösterilmiyor (yalnız ekran okuyucu)", `${width}px — kontroller Odak modunun solunda`);
  ok("ZOOM araç satırı taşmıyor, kontroller ekranda", place.inToolbar && place.onScreen && place.tbOverflow <= 1 && (await pageOverflowX()) <= 1, JSON.stringify(place));
  if (isDesk) ok("ZOOM masada araç satırı TEK satır (sayaç alta itilmez, harita yüksekliği korunur)", place.tbH <= 56, JSON.stringify({ tbH: place.tbH, tight: place.tight, counterShown: place.counterShown }));
  info("ZOOM araç satırı düzeni", `yükseklik ${place.tbH}px · sıkıştırma ${place.tight} · sayaç ${place.counterShown ? "görünür" : "Açı çizgileri menüsünde"}`);
  ok("ZOOM dokunma hedefi yeterli (≥ 32 px; telefonda ≥ 36 px)", place.sizes.every((x) => x >= (width < 640 ? 36 : 32)), place.sizes.join(","));
  ok("ZOOM ipuçları var", place.titles.every((t) => t && t.length > 3), place.titles.join(" | "));
  if (isDesk) {
    // Harita kolonu en geniş (ayırıcı sağda): yer varsa tam düzen — sayaç · − + ⛶ · Odak modu, tek satır.
    await setPanel("End");
    await page.waitForTimeout(400);
    const wide = await page.evaluate(() => {
      const R = (e) => e.getBoundingClientRect();
      const g = R(document.querySelector("[data-testid=atlas-chart-toolbar] [data-testid=atlas-zoom-controls]"));
      const f = R(document.querySelector("[data-testid=atlas-chart-toolbar] [data-testid=atlas-chart-expand]"));
      const ce = document.querySelector("[data-testid=natal-aspect-counts]");
      const c = R(ce);
      const tb = document.querySelector("[data-testid=atlas-chart-toolbar]");
      return { tbW: tb.clientWidth, tbH: tb.offsetHeight, tight: tb.dataset.tight ?? "yok", counterShown: c.width > 2 && getComputedStyle(ce).position !== "absolute", order: c.right <= g.left + 1 && g.right <= f.left + 1, row: Math.abs((c.top + c.bottom) / 2 - (g.top + g.bottom) / 2) < 14 };
    });
    if (wide.counterShown) ok("ZOOM geniş harita kolonunda tam düzen: sayaç · − + ⛶ · Odak modu (tek satır)", wide.order && wide.row && wide.tbH <= 56, JSON.stringify(wide));
    else info("ZOOM geniş kolonda da sayaç menüde", JSON.stringify(wide));
    await setPanel("Enter");
    await page.waitForTimeout(300);
  }
  const gFit = await chartGeom();
  ok("ZOOM ilk açılış: sığdırılmış (ölçek 1), − ve ⛶ pasif", (await zs()) === 1 && (await zc.locator("[data-testid=atlas-zoom-out]").isDisabled()) && (await zc.locator("[data-testid=atlas-zoom-fit]").isDisabled()));
  apiCalls = [];
  await zc.locator("[data-testid=atlas-zoom-in]").click();
  await page.waitForTimeout(250);
  const z1 = await zs();
  await zc.locator("[data-testid=atlas-zoom-in]").click();
  await page.waitForTimeout(250);
  const z2 = await zs();
  ok("ZOOM + gerçekten büyütür", z1 > 1 && z2 > z1, `${z1} → ${z2}`);
  await zc.locator("[data-testid=atlas-zoom-out]").click();
  await page.waitForTimeout(250);
  const z3 = await zs();
  ok("ZOOM − gerçekten küçültür", z3 < z2 && z3 >= 1, `${z2} → ${z3}`);
  await zc.locator("[data-testid=atlas-zoom-fit]").click();
  await page.waitForTimeout(300);
  const gBack = await chartGeom();
  ok("ZOOM ⛶ başlangıç görünümüne döner (ölçek 1, aynı boyut, etiketler içeride)", (await zs()) === 1 && gBack.sw === gFit.sw && gBack.outside === 0, `${gFit.sw} / ${gBack.sw}`);
  for (let i = 0; i < 30; i++) {
    if (await zc.locator("[data-testid=atlas-zoom-in]").isDisabled()) break;
    // Sınıra ulaşan son tıklamada düğme pasifleşebilir → kısa zaman aşımı, ardından durum yeniden okunur.
    await zc.locator("[data-testid=atlas-zoom-in]").click({ timeout: 1500 }).catch(() => undefined);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(250);
  const zMax = await zs();
  ok("ZOOM üst sınır (en çok 8×), + sınırda pasif", zMax <= 8 && (await zc.locator("[data-testid=atlas-zoom-in]").isDisabled()), String(zMax));
  await zc.locator("[data-testid=atlas-zoom-fit]").click();
  await page.waitForTimeout(250);
  // Fare tekerleği: harita ÜZERİNDE yakınlaştırır / uzaklaştırır (en az 1 — harita kaybolmaz)
  const vb = await zvp.boundingBox();
  await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(300);
  const zw1 = await zs();
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(300);
  const zw2 = await zs();
  ok("ZOOM fare tekerleği harita üzerinde yakınlaştırır", zw1 > 1, String(zw1));
  ok("ZOOM tekerlekle uzaklaştırma alt sınırda durur (1 = sığdır; harita kaybolmaz)", zw2 === 1, String(zw2));
  // Harita DIŞINDA tekerlek: normal panel / sayfa kaydırması, yakınlaştırma yok
  let outsideWheel;
  if (isDesk) {
    await section("acilar");
    const sc = page.locator("[data-testid=atlas-panel-scroll]").first();
    const sb = await sc.boundingBox();
    const before = await sc.evaluate((e) => e.scrollTop);
    await page.mouse.move(sb.x + sb.width / 2, sb.y + 40);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(400);
    outsideWheel = { moved: (await sc.evaluate((e) => e.scrollTop)) - before };
    await sc.evaluate((e) => (e.scrollTop = 0));
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    const hb2 = await page.locator("[data-testid=atlas-desk-header]:visible").first().boundingBox();
    await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + 10);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(400);
    outsideWheel = { moved: await page.evaluate(() => window.scrollY) };
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  ok("ZOOM harita dışında tekerlek normal kaydırır, haritayı yakınlaştırmaz", outsideWheel.moved > 0 && (await zs()) === 1, JSON.stringify(outsideWheel));
  // Odak modu bağımsız: masa yakınken odak sığdırılmış açılır; dönünce masa yakınlaştırması korunur
  await zc.locator("[data-testid=atlas-zoom-in]").click();
  await page.waitForTimeout(250);
  const zBeforeFocus = await zs();
  await page.locator("[data-testid=atlas-chart-expand]:visible").first().click();
  const ovp = page.locator("[data-testid=atlas-chart-overlay] [data-testid=atlas-chart-viewport]").first();
  await ovp.waitFor({ state: "visible", timeout: 10000 });
  const oS0 = await ovp.getAttribute("data-scale");
  const oBox = await ovp.boundingBox();
  await page.mouse.move(oBox.x + oBox.width / 2, oBox.y + oBox.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(300);
  const oS1 = Number(await ovp.getAttribute("data-scale"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  ok("ZOOM Odak modu bozulmaz: sığdırılmış açılır, kendi içinde yakınlaşır", oS0 === "1.00" && oS1 > 1, `${oS0} → ${oS1}`);
  ok("ZOOM Odak modundan dönünce masadaki yakınlaştırma aynen korunur", (await zs()) === zBeforeFocus, `${zBeforeFocus} / ${await zs()}`);
  // Klavye: düğmeler odaklanabilir (Enter ile çalışır)
  await zc.locator("[data-testid=atlas-zoom-fit]").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  await zc.locator("[data-testid=atlas-zoom-in]").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  ok("ZOOM klavye: düğmeler odaklanır, Enter ile çalışır", (await zs()) > 1);
  await zc.locator("[data-testid=atlas-zoom-fit]").click();
  await page.waitForTimeout(250);
  // İki parmak (telefon / tablet): PointerEvent benzetimi — fiziksel dokunmatik cihaz DEĞİL
  if (!isDesk) {
    const pinched = await zvp.evaluate(async (vpEl) => {
      const box = vpEl.querySelector("[role=group]");
      const r = box.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const ev = (type, id, x) => box.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: cy, bubbles: true, isPrimary: id === 1 }));
      ev("pointerdown", 1, cx - 20);
      ev("pointerdown", 2, cx + 20);
      for (let k = 1; k <= 6; k++) {
        ev("pointermove", 1, cx - 20 - k * 12);
        ev("pointermove", 2, cx + 20 + k * 12);
      }
      ev("pointerup", 1, cx - 92);
      ev("pointerup", 2, cx + 92);
      await new Promise((res) => setTimeout(res, 300));
      return Number(vpEl.getAttribute("data-scale"));
    });
    ok("ZOOM iki parmak (PointerEvent benzetimi) yakınlaştırır", pinched > 1, String(pinched));
    await zc.locator("[data-testid=atlas-zoom-fit]").click();
    await page.waitForTimeout(250);
    ok("ZOOM sığdırılmışken tek parmak dikey sayfa kaydırmasına bırakılır (touch-action: pan-y)", (await zvp.locator("[role=group]").first().evaluate((e) => getComputedStyle(e).touchAction)) === "pan-y");
  }
  const zoomCalls = apiCalls.filter((c) => !/^GET /.test(c) || /calculate|roxy|interpret/i.test(c));
  ok("ZOOM işlemleri hesaplama / kayıt / sağlayıcı isteği üretmez", zoomCalls.length === 0, zoomCalls.join(", ") || `GET: ${apiCalls.length}`);
  await shot("zoom-arac-satiri");

  // ═════ V4-002B — yatay kaydırma: sonuç alanının GÖRÜNEN ALT KENARINDA, yalnız taşan tablo ekrandayken
  /** Şerit ölçümü: konum (panel kaydırma kabının hemen altı / telefonda ekranın altı), bağlı tablo, veriyi örtme. */
  const stripState = () =>
    page.evaluate(() => {
      const st = Array.from(document.querySelectorAll("[data-testid=atlas-hscroll]")).find((e) => e.getClientRects().length > 0);
      const sc = document.querySelector("[data-testid=atlas-panel-scroll]");
      const info = document.querySelector("[data-testid=atlas-info-panel]");
      if (!st) return { shown: false };
      const r = st.getBoundingClientRect();
      const out = { shown: true, label: st.dataset.targetLabel, placement: st.dataset.placement, h: Math.round(r.height) };
      if (sc) {
        const s = sc.getBoundingClientRect();
        const ir = info.getBoundingClientRect();
        // Masaüstü: kaydırma kabının hemen ALTINDA (veriyi örtmez, dikey çubukla çakışmaz) ve bilgi kolonunun alt kenarında.
        out.belowScroll = r.top >= s.bottom - 0.5;
        out.atPanelBottom = Math.abs(r.bottom - (ir.bottom - 1)) <= 2.5;
      } else {
        out.atViewportBottom = Math.abs(r.bottom - window.innerHeight) <= 1.5 || r.bottom <= window.innerHeight;
      }
      return out;
    });
  /** Panelde ekranda en az 40 px görünen yatay taşan kap var mı (şeridin görünmesi gereken durum). */
  const overflowOnScreen = (rootSel, scopeSel) =>
    page.evaluate(
      ([rootSel, scopeSel]) => {
        const root = document.querySelector(rootSel);
        if (!root) return 0;
        const scope = scopeSel ? document.querySelector(scopeSel) : null;
        const vp = scope ? scope.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
        return Array.from(root.querySelectorAll("*")).filter((el) => {
          const ox = getComputedStyle(el).overflowX;
          if (!((ox === "auto" || ox === "scroll") && el.scrollWidth - el.clientWidth > 1 && el.getClientRects().length > 0)) return false;
          if (scope && el === scope) return false;
          const r = el.getBoundingClientRect();
          return Math.min(r.bottom, vp.bottom) - Math.max(r.top, vp.top) >= 40;
        }).length;
      },
      [rootSel, scopeSel],
    );
  const panelScope = isDesk ? "[data-testid=atlas-panel-scroll]" : null;
  if (isDesk) await setPanel("End");
  await section("gezegenler");
  if (!isDesk) {
    // Telefon / tablet: sayfa kayar — kullanıcı gibi tabloya iner.
    await page.evaluate(() => document.querySelector("#atlas-result-panel table")?.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(600);
  }
  info("V4-002B bilgi içeriği genişliği (panel en dar)", isDesk ? `${await panelW()} px` : "telefon / tablet");
  const planetsOverflow = (await overflowOnScreen("#atlas-result-panel", panelScope)) > 0;
  const s0 = await stripState();
  if (planetsOverflow) {
    ok("V4-002B taşan Gezegenler tablosu ekrandayken şerit görünür ve tabloya bağlı", s0.shown && /Gezegen/.test(s0.label ?? ""), JSON.stringify(s0));
    if (isDesk) ok("V4-002B şerit bilgi panelinin ALT kenarında, kaydırma kabının altında (veriyi örtmez)", s0.belowScroll === true && s0.atPanelBottom === true, JSON.stringify(s0));
    else ok("V4-002B telefonda şerit ekranın alt kenarında", s0.atViewportBottom === true && s0.placement === "fixed-bottom", JSON.stringify(s0));
  } else ok("V4-002B Gezegenler tablosu bu genişlikte sığıyor → şerit yok", !s0.shown, JSON.stringify(s0));
  if (s0.shown) {
    const sync = await page.evaluate(async () => {
      const bar = document.querySelector("[data-testid=atlas-hscroll-bar]");
      const cands = Array.from(document.querySelectorAll("#atlas-result-panel *")).filter((el) => {
        const ox = getComputedStyle(el).overflowX;
        return (ox === "auto" || ox === "scroll") && el.scrollWidth - el.clientWidth > 1;
      });
      const t = cands[0];
      if (!t) return { err: "taşan tablo yok" };
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
      // Son sütun gerçekten görünür mü (tablonun sağ kenarı kabın sağ kenarına ulaştı)
      const tbl = t.querySelector("table") ?? t.firstElementChild;
      const lastVisible = tbl ? Math.abs(tbl.getBoundingClientRect().right - t.getBoundingClientRect().right) <= 2 : true;
      t.scrollLeft = 0;
      await wait();
      const firstVisible = tbl ? Math.abs(tbl.getBoundingClientRect().left - t.getBoundingClientRect().left) <= 2 : true;
      return { a, b, range, end, endBar: Math.round(bar.scrollWidth - bar.clientWidth), lastVisible, firstVisible };
    });
    ok("V4-002B şerit → tablo eşlenir", sync.a === 40, JSON.stringify(sync));
    ok("V4-002B tablo → şerit eşlenir", sync.b === 15, JSON.stringify(sync));
    ok("V4-002B ilk ve son sütuna ulaşılır (piksel eşleşmesi)", sync.end === sync.range && sync.endBar === sync.range && sync.lastVisible && sync.firstVisible, JSON.stringify(sync));
    await page.locator("[data-testid=atlas-hscroll-right]:visible").first().click();
    await page.waitForTimeout(700);
    const afterBtn = await page.evaluate(() => Math.round(document.querySelector("[data-testid=atlas-hscroll-bar]").scrollLeft));
    ok("V4-002B '›' düğmesi sağa kaydırır", afterBtn > 0, String(afterBtn));
    await page.locator("[data-testid=atlas-hscroll-bar]:visible").first().focus();
    await page.keyboard.press("Home");
    await page.waitForTimeout(300);
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    const afterKey = await page.evaluate(() => Math.round(document.querySelector("[data-testid=atlas-hscroll-bar]").scrollLeft));
    ok("V4-002B şerit klavyeyle (Home, →) kaydırılır", afterKey > 0, String(afterKey));
    await page.keyboard.press("Home");
    await shot("v4-002b-gezegenler-alt-kaydirma");
  }
  // Bölüm geçişi: Evler → (taşan tablo yoksa şerit yok) → Açılar (Açılar tablosuna bağlanır, Gezegenler'e DEĞİL)
  await section("evler");
  const evOv = (await overflowOnScreen("#atlas-result-panel", panelScope)) > 0;
  const sEv = await stripState();
  ok("V4-002B Evler'e geçince şerit Gezegenler'de kalmaz (taşma yoksa yok)", evOv ? sEv.shown && !/Gezegen/.test(sEv.label ?? "") : !sEv.shown, JSON.stringify({ evOv, ...sEv }));
  await section("acilar");
  if (!isDesk) {
    await page.evaluate(() => document.querySelector("[data-testid=astro-aspects-scroll]")?.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(500);
  }
  const acOv = (await overflowOnScreen("#atlas-result-panel", panelScope)) > 0;
  const sAc = await stripState();
  if (acOv) ok("V4-002B Açılar'a geçince şerit Açılar tablosuna bağlanır", sAc.shown && /Açılar/.test(sAc.label ?? ""), JSON.stringify(sAc));
  else ok("V4-002B Açılar tablosu sığıyor → şerit yok", !sAc.shown, JSON.stringify(sAc));
  // Uzun liste: listenin ORTASINDAYKEN şerit görünen alt kenarda ve tabloya bağlı; alt satırlar şeridin altında kalmaz
  const mid = await page.evaluate(async () => {
    const box = document.querySelector("[data-testid=astro-aspects-scroll]");
    const scope = document.querySelector("[data-testid=atlas-panel-scroll]");
    if (!box) return { err: "açı tablosu yok" };
    box.scrollTop = Math.floor((box.scrollHeight - box.clientHeight) / 2);
    if (scope) scope.scrollTop = Math.floor((scope.scrollHeight - scope.clientHeight) / 2);
    else {
      box.scrollIntoView({ block: "start" });
      await new Promise((r) => setTimeout(r, 300));
      window.scrollBy(0, Math.floor(box.getBoundingClientRect().height / 2));
    }
    await new Promise((r) => setTimeout(r, 400));
    const st = Array.from(document.querySelectorAll("[data-testid=atlas-hscroll]")).find((e) => e.getClientRects().length > 0);
    const pinBar = document.querySelector("[data-testid=atlas-mobile-sections-bar]");
    const inner = pinBar?.firstElementChild?.getBoundingClientRect();
    const barOnScreen = inner ? inner.top >= -0.5 && inner.bottom <= window.innerHeight + 0.5 : null;
    const ov = box.scrollWidth - box.clientWidth;
    if (!st) return { overflow: ov, strip: null, barOnScreen };
    const r = st.getBoundingClientRect();
    return { overflow: ov, onScreen: r.top >= 0 && r.bottom <= window.innerHeight + 0.5, label: st.dataset.targetLabel, placement: st.dataset.placement, barOnScreen };
  });
  if (mid.overflow > 1) ok("V4-002B uzun Açılar listesinin ortasında şerit ekranda (alt kenar) ve Açılar'a bağlı", mid.onScreen === true && /Açılar/.test(mid.label ?? ""), JSON.stringify(mid));
  else info("V4-002B Açılar tablosu bu genişlikte yatay taşmıyor (şerit gerekmez)", JSON.stringify(mid));
  if (!isDesk) ok("telefon/tablet: uzun listenin ortasında bölüm çipleri ekranda (gerekirse üstte sabit)", mid.barOnScreen === true, JSON.stringify(mid));
  if (!isDesk && mid.overflow > 1) {
    // Telefon: panelin SONUNA inince son satır şeridin altında kalmaz (kartın sonunda şerit kadar yer).
    const endChk = await page.evaluate(async () => {
      const card = document.querySelector("[data-testid=atlas-hscroll-spacer]")?.parentElement;
      if (!card) return { err: "kart yok" };
      const box = document.querySelector("[data-testid=astro-aspects-scroll]");
      box.scrollTop = box.scrollHeight;
      card.scrollIntoView({ block: "end" });
      await new Promise((r) => setTimeout(r, 450));
      const st = document.querySelector("[data-testid=atlas-hscroll]");
      const rows = Array.from(document.querySelectorAll("#atlas-result-panel tr, #atlas-result-panel li")).filter((e) => e.getClientRects().length > 0);
      const last = rows[rows.length - 1];
      if (!st || !last) return { strip: !!st, last: !!last };
      const sr = st.getBoundingClientRect();
      const lr = last.getBoundingClientRect();
      return { lastBottom: Math.round(lr.bottom), stripTop: Math.round(sr.top), placement: st.dataset.placement, clear: lr.bottom <= sr.top + 1 || lr.top >= sr.bottom - 1 };
    });
    ok("V4-002B telefonda panelin sonunda son satır şeridin altında kalmaz", endChk.clear !== false, JSON.stringify(endChk));
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  ok("V4-002B sayfa yatay taşmıyor (panel en dar)", (await pageOverflowX()) <= 1, String(await pageOverflowX()));
  if (isDesk) {
    // Daralt / genişlet: sığınca şerit kendiliğinden kaybolur, yeniden daralınca geri gelir (sayfa yenilemeden)
    await section("gezegenler");
    await setPanel("Home");
    await page.waitForTimeout(500);
    const wideOv = (await overflowOnScreen("#atlas-result-panel", panelScope)) > 0;
    const sWide = await stripState();
    ok("V4-002B panel genişleyince tablo sığar → şerit kendiliğinden kaybolur", wideOv ? sWide.shown : !sWide.shown, `taşma=${wideOv} şerit=${sWide.shown} · içerik ${await panelW()} px`);
    await setPanel("End");
    await page.waitForTimeout(500);
    const sNarrow = await stripState();
    ok("V4-002B panel yeniden daralınca şerit kendiliğinden geri gelir", sNarrow.shown && /Gezegen/.test(sNarrow.label ?? ""), JSON.stringify(sNarrow));
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
    const stageOnScreen = await overflowOnScreen("[data-testid=atlas-stage-scroll], [data-testid=atlas-mobile-stage]", isDesk ? "[data-testid=atlas-stage-scroll]" : null);
    if (stageOverflow > 0) ok(`${name} — sol alan: taşan tablo ekrandaysa alt şerit var, değilse yok`, stageOnScreen > 0 ? stageTop === 1 : stageTop === 0, `ekranda ${stageOnScreen} · şerit ${stageTop}`);
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
      const on2 = await overflowOnScreen("[data-testid=atlas-stage-scroll]", "[data-testid=atlas-stage-scroll]");
      if (ov2 > 0) ok(`${name} — sol alan EN DAR: taşan tablo ekrandaysa alt şerit var`, on2 > 0 ? top2 === 1 : top2 === 0, `taşan ${ov2} · ekranda ${on2} · şerit ${top2}`);
      if (top2 === 1) {
        const pos = await page.evaluate(() => {
          const st = Array.from(document.querySelectorAll("[data-testid=atlas-stage-hscroll]")).find((e) => e.getClientRects().length > 0);
          const sc = document.querySelector("[data-testid=atlas-stage-scroll]");
          return st && sc ? st.getBoundingClientRect().top >= sc.getBoundingClientRect().bottom - 0.5 : null;
        });
        ok(`${name} — sol alan şeridi sonuç alanının alt kenarında (veriyi örtmez)`, pos === true, String(pos));
      }
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
      const topN = await page.locator("[data-testid=atlas-hscroll]:visible").count();
      const onScr = await overflowOnScreen("#atlas-result-panel", isDesk ? "[data-testid=atlas-panel-scroll]" : null);
      ok(`${name} · ${id} — metin çakışması yok`, o.count === 0, o.hits.join(" ; "));
      if (ov > 0) ok(`${name} · ${id} — taşan tablo ekrandaysa alt şerit var, değilse yok`, onScr > 0 ? topN === 1 : topN === 0, `taşan ${ov} · ekranda ${onScr} · şerit ${topN}`);
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
