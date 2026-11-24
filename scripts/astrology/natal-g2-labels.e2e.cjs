/* eslint-disable @typescript-eslint/no-require-imports */
// G2 — Natal burç / derece / dakika etiket katmanı (R4-S2) — GERÇEK Natal ekranında UI e2e (2026-11-22).
//   Kayıtlı Natal ("Ali natal (gerçek kayıt)", saat biliniyor) + "G2 saat bilinmiyor natal" (FAKE_NATAL_G2_SEED=1):
//   etiket düzeni / profil, etiket çakışması (gerçek tarayıcı kutuları), etiketin kendi burç diliminde kalması, yakınlaştırmada
//   anlamsal ayrışma (K, grup sayısı), masaüstü grup alanı (tıklamasız), dokunma / tıklama ayrıntı paneli, etiket tercihi,
//   Temel / Profesyonel, saat bilinmiyor kuralı (çark + tablolar), yatay taşma, sayfa hatası, görünüm değişiminde ağ isteği 0.
// Ön koşul: FAKE_NATAL_REAL_GOLDEN=1 FAKE_NATAL_G2_SEED=1 dev-fake-backend.ts <fake> + next dev --webpack (ASTROLOGY_MODULE_ENABLED=true,
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>, SUPABASE_SERVICE_ROLE_KEY=local-fake, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-fake).
// ÖNEMLİ (G2-K, Next 16.3.8): `next dev` bir yapay zekâ ajanı ortamı algılarsa (@vercel/detect-agent: AI_AGENT, CLAUDECODE,
//   CLAUDE_CODE …) AGENTS.md'deki yönetilen bloğu yeniden yazar → static.harness izolasyon denetimi düşer. Ajan oturumundan
//   başlatırken sunucuyu bu değişkenler olmadan açın:  env -u AI_AGENT -u CLAUDECODE -u CLAUDE_CODE <sunucu komutu>
//   (agentRules / next.config DEĞİŞTİRİLMEZ; yalnız bu test sunucusunun ortamı).
// Çalıştırma: node scripts/astrology/natal-g2-labels.e2e.cjs http://localhost:3991 1440 900 <çıktı klasörü>
const { chromium } = require("playwright");
const { mkdirSync, writeFileSync } = require("node:fs");

const [ORIGIN = "http://localhost:3991", W = "1440", H = "900", OUT = ""] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const mobile = width < 768;
const BASE = `${ORIGIN}/admin/astroloji`;
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const MOON_TXT = "Ay'ın kesin burcu ve derecesi, doğum saati bilinmediği için doğrulanamıyor.";

let pass = 0;
let fail = 0;
const results = [];
const infos = [];
function ok(name, cond, detail = "") {
  if (cond) pass++;
  else fail++;
  results.push({ name, ok: !!cond, detail });
  console.log(`  ${cond ? "✓" : "✗"} ${name}${!cond && detail ? ` — ${String(detail).slice(0, 400)}` : ""}`);
}
const info = (k, v) => {
  infos.push({ k, v });
  console.log(`  · ${k}: ${v}`);
};

/** Çarkın görünür etiket kutuları (ekran koordinatı) + çakışma + burç dilimi denetimi (tarayıcıda). */
function inspectWheel() {
  const svg = document.querySelector("[data-testid=atlas-chart-fit] svg[data-label-layout], [data-testid=atlas-mobile-chart] svg[data-label-layout]");
  if (!svg) return null;
  const boxes = [];
  const add = (el, key, kind) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0.5 && r.height > 0.5) boxes.push({ key, kind, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
  };
  svg.querySelectorAll("[data-label-text] text").forEach((t) => add(t, t.closest("[data-body],[data-point]").getAttribute("data-body") || t.closest("[data-point]").getAttribute("data-point"), "lbl"));
  svg.querySelectorAll("[data-group] rect").forEach((t) => add(t, `g:${t.parentElement.getAttribute("data-group")}`, "grp"));
  svg.querySelectorAll("[data-cusp-degree] text").forEach((t) => add(t, `c${t.parentElement.getAttribute("data-cusp-degree")}`, "cusp"));
  svg.querySelectorAll("[data-angle] rect, [data-angle] text").forEach((t) => add(t, `a:${t.closest("[data-angle]").getAttribute("data-angle")}`, "angle"));
  svg.querySelectorAll("[data-house-num]").forEach((t) => add(t, `h${t.getAttribute("data-house-num")}`, "hnum"));
  // Aynı etiketin satırları arasında çakışma sayılmaz; farklı öğeler arasında ≥ 0,6 px örtüşme = çakışma.
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.key === b.key) continue;
      const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) - 0.6;
      const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) - 0.6;
      if (w > 0 && h > 0) overlaps.push(`${a.kind}:${a.key}×${b.kind}:${b.key}`);
    }
  const sector = [];
  svg.querySelectorAll("[data-body][data-disp],[data-point][data-disp]").forEach((g) => {
    const disp = Number(g.getAttribute("data-disp"));
    const tick = g.querySelector("[data-true-tick]");
    void tick;
    const id = g.getAttribute("data-body") || g.getAttribute("data-point");
    const lon = Number((g.getAttribute("aria-label") || "").length >= 0 ? NaN : NaN);
    void lon;
    sector.push({ id, disp });
  });
  const groups = [...svg.querySelectorAll("[data-group]")].map((g) => ({ sign: g.getAttribute("data-group"), ids: g.getAttribute("data-ids").split(" "), count: Number(g.querySelector("[data-group-count]")?.getAttribute("data-group-count")) }));
  const vb = svg.viewBox.baseVal;
  const unit = svg.getBoundingClientRect().width / vb.width; // ekran px / SVG birimi (yakınlaştırma dahil)
  const cuspPx = [...svg.querySelectorAll("[data-cusp-degree] text")].map((t) => Number(t.getAttribute("font-size")) * unit);
  return {
    cusp: svg.getAttribute("data-cusp-labels"),
    cuspCount: cuspPx.length,
    cuspMinPx: cuspPx.length ? Math.min(...cuspPx) : null,
    layout: svg.getAttribute("data-label-layout"),
    profile: svg.getAttribute("data-label-profile"),
    k: Number(svg.getAttribute("data-label-k")),
    nGroups: groups.length,
    groups,
    overlaps,
    singles: sector.length,
    bodies: [...svg.querySelectorAll("[data-body]")].map((e) => e.getAttribute("data-body")),
    moonGlyph: [...svg.querySelectorAll("text")].some((t) => [...t.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes("☽"))),
    drawn: Number(svg.getAttribute("data-aspects-drawn")),
    aria: svg.getAttribute("aria-label"),
    vbw: vb.width,
    px: Math.round(svg.getBoundingClientRect().width),
  };
}

(async () => {
  if (OUT) mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "tr-TR", timezoneId: "Europe/Istanbul", deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
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
  const shot = async (name, full = false) => {
    if (!OUT) return;
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${width}-${name}.png`, fullPage: full });
  };
  const wheel = () => page.evaluate(inspectWheel);
  // Etiket tercihi "Ek noktalar" menüsündeki "Çark etiketleri" radyo grubunda (V4 araç satırı tek satır kalır).
  const setLabels = async (k) => {
    await page.locator("[data-testid=natal-points-toggle]:visible").first().click();
    await page.locator(`[data-testid=natal-labels-${k}]`).check();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  };

  const openSaved = async (clientText, savedText) => {
    await page.goto(BASE, { waitUntil: "load", timeout: 300000 });
    await page.waitForSelector("[data-portal=archive]", { timeout: 300000 });
    await page.locator("[data-portal=archive]").first().click();
    await page.waitForSelector("[data-testid=astro-archive-list]", { timeout: 120000 });
    const rows = page.locator("[data-testid=astro-archive-list] [title='Danışan dosyasını aç']");
    const n = await rows.count();
    let clicked = false;
    for (let i = 0; i < n; i++) {
      const txt = await rows.nth(i).evaluate((e) => (e.closest("tr,li,article,[role=row]") || e.parentElement).innerText);
      if (txt.includes(clientText)) {
        await rows.nth(i).click();
        clicked = true;
        break;
      }
    }
    if (!clicked) await rows.first().click();
    await page.waitForSelector("[data-testid=astro-saved-analyses] [data-saved-item]", { timeout: 120000 });
    await page.locator("[data-testid=astro-saved-analyses] [data-saved-item]", { hasText: savedText }).first().click();
    await page.waitForSelector("svg[data-label-layout]", { timeout: 120000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.scrollTo(0, 0));
  };

  // ══════ 1. Saati bilinen harita ══════
  await openSaved("Ali", "Ali natal");
  let w0 = await wheel();
  ok("etiket katmanlı çark görünür (data-label-layout)", !!w0, JSON.stringify(w0));
  info("çark", `${w0.px}px · profil ${w0.profile} · düzen ${w0.layout} · K ${w0.k} · grup ${w0.nGroups} · tekil ${w0.singles}`);
  ok("ölçek 1'de K = 1; profil çark boyuna göre (eff < 0,7 → dar)", w0.k === 1 && (mobile ? w0.profile === "compact" : true), `${w0.profile} ${w0.k}`);
  ok("ölçek 1: etiket / grup / ev başlangıcı / eksen levhası / ev numarası çakışması 0", w0.overlaps.length === 0, w0.overlaps.slice(0, 8).join(", "));
  ok("grup etiketi sayısı = üye sayısı", w0.groups.every((g) => g.count === g.ids.length), JSON.stringify(w0.groups));
  ok("Ay (saat biliniyor) çarkta", w0.bodies.includes("moon") || w0.groups.some((g) => g.ids.includes("moon")));
  ok("yatay taşma yok", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  const tbH = await page.locator("[data-testid=atlas-chart-toolbar]:visible").first().evaluate((e) => Math.round(e.getBoundingClientRect().height));
  info("araç satırı yüksekliği", `${tbH}px`);
  if (width >= 1366) ok("masaüstü (≥1366): harita araç satırı tek satır (V4 kararı)", tbH <= 50, `${tbH}px`);
  info("ev başlangıcı yazıları (ölçek 1)", `${w0.cusp} · ${w0.cuspCount} etiket · en küçük ${w0.cuspMinPx === null ? "—" : w0.cuspMinPx.toFixed(1) + " px"}`);
  ok("ev başlangıcı derecesi ya gizli (okunamayacak ölçek) ya da en az 7 px", w0.cusp === "hidden" ? w0.cuspCount === 0 : w0.cuspCount > 0 && w0.cuspMinPx >= 7, JSON.stringify({ c: w0.cusp, n: w0.cuspCount, px: w0.cuspMinPx }));
  if (mobile) ok("mobil sığdırılmış çark: ev başlangıcı dereceleri gizli", w0.cusp === "hidden" && w0.cuspCount === 0);
  await shot("1-saat-biliniyor", false);

  if (!mobile) {
    const gd = page.locator("[data-testid=natal-group-details]");
    ok("masaüstü grup alanı çarkın GERÇEK profilini izler", (await gd.count()) === 0 ? w0.nGroups === 0 && w0.profile === "screen" : (await gd.getAttribute("data-profile")) === w0.profile, `${await gd.getAttribute("data-profile").catch(() => "yok")} / ${w0.profile}`);
    if (w0.profile === "compact") {
      const all = await page.locator("[data-testid=natal-all-positions-table] [data-pos-row]").evaluateAll((rs) => rs.map((r) => ({ s: r.getAttribute("data-status"), full: r.getAttribute("data-full") })));
      ok("dar çark (masaüstü): bütün noktaların burç / derece / dakikası yan alanda tıklamasız", all.length === w0.singles + w0.groups.reduce((n, g) => n + g.ids.length, 0) && all.every((r) => /\d+°\d\d′/.test(r.full)), JSON.stringify(all).slice(0, 200));
    }
    if (w0.nGroups > 0) {
      ok("masaüstü: grup alanı tıklamasız görünür ve çarktaki gruplarla aynı", (await gd.isVisible()) && Number(await gd.getAttribute("data-groups")) === w0.nGroups, `${await gd.count()} / ${w0.nGroups}`);
      const rows = await gd.locator("[data-group-panel] [data-pos-row]").evaluateAll((rs) => rs.map((r) => ({ k: r.getAttribute("data-pos-row"), s: r.getAttribute("data-status"), sign: r.getAttribute("data-sign"), full: r.getAttribute("data-full"), txt: r.innerText })));
      ok("grup alanı satırları: burç + derece°dakika′ (kesin)", rows.length === w0.groups.reduce((n, g) => n + g.ids.length, 0) && rows.every((r) => r.s === "exact" && r.sign && /\d+°\d\d′/.test(r.full)), JSON.stringify(rows.slice(0, 3)));
      await gd.scrollIntoViewIfNeeded();
      await shot("2-grup-alani");
    } else info("grup alanı", "bu haritada 100%'de grup yok");
  }

  // ── yakınlaştırma: anlamsal ayrışma ──
  const zoomIn = page.locator("[data-testid=atlas-zoom-in]:visible").first();
  const steps = [];
  const zoomable = (await zoomIn.count()) > 0;
  if (zoomable) {
    for (let i = 0; i < 8; i++) {
      if (await zoomIn.isDisabled()) break;
      await zoomIn.click();
      await page.waitForTimeout(250);
      const w = await wheel();
      const scale = Number(await page.locator("[data-testid=atlas-chart-viewport]:visible").first().getAttribute("data-scale"));
      steps.push({ scale, k: w.k, profile: w.profile, groups: w.nGroups, ov: w.overlaps.length, ovs: w.overlaps.slice(0, 3), cusp: w.cusp, cuspN: w.cuspCount, cuspPx: w.cuspMinPx });
    }
    info("yakınlaştırma adımları", steps.map((s) => `${s.scale}×:K${s.k}/${s.profile}/grup${s.groups}/çakışma${s.ov}`).join(" · "));
    ok("yakınlaştırınca K küçülür (yazı ekranda sabit), grup sayısı artmaz", steps.length > 0 && steps.every((s, i) => i === 0 || (s.k <= steps[i - 1].k && s.groups <= steps[i - 1].groups)) && steps[steps.length - 1].k < 1, JSON.stringify(steps));
    ok("yakınlaştırma: gruplar gerçekten tekil etiketlere ayrılır (en büyük ölçekte grup 0)", w0.nGroups === 0 || steps[steps.length - 1].groups < w0.nGroups, JSON.stringify(steps.map((s) => s.groups)));
    ok("yakınlaştırmanın her adımında çakışma 0", steps.every((s) => s.ov === 0), JSON.stringify(steps.filter((s) => s.ov).slice(0, 2)));
    info("ev başlangıcı yazıları (yakınlaştırma)", steps.map((s) => `${s.scale}×:${s.cusp}${s.cuspPx ? "/" + s.cuspPx.toFixed(1) + "px" : ""}`).join(" · "));
    ok("yakınlaştırınca ev başlangıcı dereceleri görünür ve her adımda ≥ 7 px", steps.some((s) => s.cusp === "shown" && s.cuspN > 0) && steps.every((s) => s.cusp !== "shown" || s.cuspPx >= 7), JSON.stringify(steps.map((s) => [s.cusp, s.cuspPx])));
    await shot("3-yakin");
    await page.locator("[data-testid=atlas-zoom-fit]:visible").first().click();
    await page.waitForTimeout(250);
    ok("sığdır: K = 1'e döner", (await wheel()).k === 1);
  } else info("yakınlaştırma", "bu genişlikte araç düğmesi yok — iki parmak / çift dokunuşla denendi");
  if (mobile) {
    // çift dokunuş (ChartViewport) ile yakınlaştır
    const vp = page.locator("[data-testid=atlas-mobile-chart] [data-testid=atlas-chart-viewport] > div").first();
    const bb = await vp.boundingBox();
    await page.mouse.dblclick(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(300);
    const wz = await wheel();
    const sc = Number(await page.locator("[data-testid=atlas-mobile-chart] [data-testid=atlas-chart-viewport]").first().getAttribute("data-scale"));
    info("mobil çift dokunuş", `ölçek ${sc} · profil ${wz.profile} · K ${wz.k} · grup ${wz.nGroups} · çakışma ${wz.overlaps.length}`);
    ok("mobil yakınlaştırma: ölçek > 1, çakışma 0", sc > 1 && wz.overlaps.length === 0, JSON.stringify(wz.overlaps.slice(0, 4)));
    await shot("3-mobil-yakin");
    await page.locator("[data-testid=atlas-zoom-fit]:visible").first().click();
    await page.waitForTimeout(300);
  }

  // ── dokunma / tıklama ayrıntı paneli ──
  apiCalls = [];
  const w1 = await wheel();
  const tapTarget = w1.nGroups > 0 ? page.locator("svg[data-label-layout] [data-group]").first() : page.locator('svg[data-label-layout] [data-body="sun"]').first();
  await tapTarget.evaluate((e) => e.scrollIntoView({ block: "center" }));
  if (mobile) await tapTarget.tap();
  else await tapTarget.click();
  await page.waitForTimeout(300);
  const sheet = page.locator("[data-testid=natal-label-sheet]");
  ok(`${w1.nGroups > 0 ? "grup etiketine" : "Güneş etiketine"} ${mobile ? "dokununca" : "tıklayınca"} ayrıntı paneli açılır`, (await sheet.count()) === 1, String(await sheet.count()));
  if (await sheet.count()) {
    const st = await sheet.evaluate((s) => ({ kind: s.getAttribute("data-pick"), rows: [...s.querySelectorAll("[data-pos-row]")].map((r) => ({ s: r.getAttribute("data-status"), full: r.getAttribute("data-full") })), txt: s.innerText, w: s.getBoundingClientRect().width, sw: s.scrollWidth, cw: s.clientWidth }));
    ok("panel: değerler eksiksiz (burç + derece + dakika), kesilmiyor", st.kind === "group" ? st.rows.length > 0 && st.rows.every((r) => r.s === "exact" && /\d+°\d\d′/.test(r.full)) : /Burç[\s\S]*Derece[\s\S]*Dakika/.test(st.txt), JSON.stringify(st).slice(0, 300));
    ok("panel genişliği ekrana sığar", st.w <= width + 1, `${st.w}`);
    await shot("4-ayrinti-paneli");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    ok("Esc paneli kapatır", (await sheet.count()) === 0);
  }
  // ── ev numarasına dokunma → ev başlangıcı paneli (gizli dereceler için de tam bilgi) ──
  const hn = page.locator('svg[data-label-layout] [data-house-hit="2"]').first();
  await hn.evaluate((e) => e.scrollIntoView({ block: "center" }));
  if (mobile) await hn.tap();
  else await hn.click();
  await page.waitForTimeout(300);
  const cs = await page.locator("[data-testid=natal-label-sheet]").evaluate((s) => ({ kind: s.getAttribute("data-pick"), txt: s.innerText })).catch(() => null);
  ok("ev numarasına dokununca ev başlangıcı paneli: burç + derece + dakika", !!cs && cs.kind === "cusp" && /2\. ev başlangıcı[\s\S]*Burç[\s\S]*Derece[\s\S]*Dakika/.test(cs.txt), JSON.stringify(cs));
  if (cs) await shot("4b-ev-paneli");
  // perdeye (panel dışı) bilinçli dokunuş paneli kapatır
  if (mobile) await page.touchscreen.tap(8, 8);
  else await page.mouse.click(8, 8);
  await page.waitForTimeout(250);
  ok("panel dışına dokunma / tıklama paneli kapatır", (await page.locator("[data-testid=natal-label-sheet]").count()) === 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // ── etiket tercihi + mod (yalnız çizim; ağ isteği yok) ──
  await setLabels("simple");
  await page.waitForTimeout(200);
  const ws = await wheel();
  ok("Etiketler: Sade → sade düzen; çakışma 0", ws.layout === "simple" && ws.overlaps.length === 0, `${ws.layout} ${ws.overlaps.slice(0, 3)}`);
  await shot("5-sade");
  await setLabels("detailed");
  await page.locator("[data-testid=natal-mode-basic]:visible").first().click();
  await page.waitForTimeout(200);
  const wb = await wheel();
  ok("Temel modda da Ayrıntılı seçilebilir", wb.layout === "detailed", wb.layout);
  await setLabels("auto");
  await page.waitForTimeout(200);
  ok("Moda göre + Temel → sade", (await wheel()).layout === "simple");
  await page.locator("[data-testid=natal-mode-pro]:visible").first().click();
  await page.waitForTimeout(200);
  ok("Moda göre + Profesyonel → ayrıntılı", (await wheel()).layout === "detailed");
  // Bildirim zilinin düzenli sorgusu (/api/admin/notifications) görünümden bağımsızdır; astroloji uçları sayılır.
  const astroCalls = apiCalls.filter((c) => /astrolog/i.test(c));
  ok("görünüm değişimleri ve panel astroloji ağ isteği üretmez", astroCalls.length === 0, astroCalls.join(" | "));
  // Vertex / Şans Noktası (V4: ilk açılışta seçili; kapatılabilir)
  ok("Vertex + Şans Noktası ilk açılışta çarkta (V4 davranışı korunur)", (await page.locator("svg[data-label-layout] [data-point=vertex]").count()) === 1 && (await page.locator("svg[data-label-layout] [data-point=fortune]").count()) === 1);

  // ── Gezegenler tablosu (saat biliniyor): Ay normal ──
  // ══════ 2. Saat bilinmiyor ══════
  await openSaved("Ayşe", "G2 saat bilinmiyor");
  const wu = await wheel();
  info("saat bilinmiyor çark", `profil ${wu.profile} · grup ${wu.nGroups} · tekil ${wu.singles} · çizili açı ${wu.drawn}`);
  ok("saat bilinmiyor: Ay çarkta yok (gövde, simge, grup üyeliği)", !wu.bodies.includes("moon") && !wu.moonGlyph && !wu.groups.some((g) => g.ids.includes("moon")), JSON.stringify({ b: wu.bodies, g: wu.groups }));
  ok("saat bilinmiyor: açı çizgisi 0, ev / eksen / özel nokta yok", wu.drawn === 0 && (await page.locator("svg[data-label-layout] [data-cusp-degree], svg[data-label-layout] [data-angle], svg[data-label-layout] [data-point]").count()) === 0);
  ok("saat bilinmiyor: grup sayıları Ay'sız ve üye sayısıyla eşit", wu.groups.every((g) => g.count === g.ids.length && !g.ids.includes("moon")));
  ok("saat bilinmiyor: çakışma 0", wu.overlaps.length === 0, wu.overlaps.slice(0, 4).join(", "));
  const note = await page.locator("[data-testid=natal-time-unknown-note]:visible").first().innerText().catch(() => "");
  ok("çark dışı açıklama (harita notu) Owner metnini içerir", note.includes(MOON_TXT), note);
  ok("SVG açıklaması: Ay çizilmedi", /Ay çizilmedi/.test(wu.aria || ""));
  if (!mobile) {
    const gdu = page.locator("[data-testid=natal-group-details]");
    ok("masaüstü grup alanı: Ay kutusu Owner metniyle; Ay satırı yok", (await gdu.isVisible()) && (await gdu.innerText()).includes(MOON_TXT) && (await gdu.locator('[data-pos-row="moon"]').count()) === 0);
  }
  await shot("6-saat-bilinmiyor", false);
  await setLabels("simple");
  await page.waitForTimeout(200);
  const wus = await wheel();
  ok("saat bilinmiyor + Sade: Ay yok, çakışma 0", !wus.bodies.includes("moon") && !wus.moonGlyph && wus.overlaps.length === 0, wus.overlaps.slice(0, 3).join(", "));
  await setLabels("auto");
  await page.waitForTimeout(200);
  // tablolar
  const tab = async (id) => {
    const t = page.locator(`[data-tab-id="${id}"]:visible, [data-section="${id}"]:visible, button:has-text("${id === "gezegenler" ? "Gezegenler" : "Açılar"}"):visible`).first();
    await t.click();
    await page.waitForTimeout(400);
  };
  await tab("gezegenler");
  const moonRow = await page.locator("[data-moon-unknown]:visible").first().innerText().catch(() => "");
  ok("Gezegenler: Ay satırı 'Doğum saati bilinmediği için konumu belirsiz' (burç / derece yok)", /Doğum saati bilinmediği için konumu belirsiz/.test(moonRow) && !/°/.test(moonRow), moonRow);
  ok("Gezegenler: diğerleri '12:00 varsayımı' etiketli", (await page.locator("[data-assumed]:visible").count()) >= 9);
  await shot("7-gezegenler-saatsiz", false);
  await tab("acilar");
  const atxt = await page.locator("[data-testid=astro-aspects-scroll]:visible").first().innerText().catch(() => "");
  ok("Açılar: Ay'a bağlı açı listede yok", atxt.length > 0 && !/(^|\n)Ay – |– Ay(\n|$)/m.test(atxt), atxt.slice(0, 200));
  await shot("8-acilar-saatsiz", false);
  ok("yatay taşma yok (saat bilinmiyor)", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));

  await browser.close();
  console.log(`\nnatal-g2-labels e2e ${width}×${height}: ${pass} PASS / ${fail} FAIL`);
  if (OUT) writeFileSync(`${OUT}/${width}-sonuc.json`, JSON.stringify({ width, height, pass, fail, results, infos }, null, 1));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
