/**
 * KİŞİSEL DİJİTAL OFİS V3 — Karşılama alanı yüksekliği, üst boşluk ve gizle/göster (Playwright, yerel, ağ-mock).
 *
 * Prod'a / dış ağa temas YOK: /api/settings/workspace/* → ui-personal-backend.ts (gerçek şema + durum geçişi + sunucu
 * kontrast kapısı, bellekte); 127.0.0.1 dışı abort. CI listesinde DEĞİL (yerel production build + `next start` ister).
 *   UI_BASE=http://127.0.0.1:3976 UI_OUT=<klasör> npx tsx scripts/workspace/ui-band-v3.harness.ts
 * Bölümler:
 *   Y  yükseklik: A/B/C örnekleri × 40 / 56 / 120 / 240 px (+ dar genişlik) × 320–1440 → yükseklik, metin kesilmez /
 *      binmez, tarih ya gösterilir ya açıkça kaldırılır, alan içi eski logo ve C çerçevesi kademeye göre, yatay taşma yok
 *   T  üst boşluk: 0 / 14 (varsayılan) / 40 px → araç çubuğunun altında, üzerine taşmaz
 *   P  panel: hazır seçenekler, özel kaydırıcı, üst boşluk, Taslak / Uygula / yenile / Geçmiş / Sıfırla,
 *      Normal'e dönünce metin + tarih + fotoğraf + logo eksiksiz; sığmayan metin açıklaması
 *   H  gizle/göster canlı davranış: Chromium + Firefox + WebKit; düşük kontrastlı satır varken gizleme
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, firefox, webkit, type Browser, type BrowserContext, type BrowserType, type Page } from "playwright";
import { createWorkspaceMock, type WorkspaceMock } from "./ui-personal-backend";
import { parseDesign, type WorkspaceDesign } from "../../lib/workspace/schema";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3976";
const OUT = process.env.UI_OUT ?? "karsilama-v3";
const SAMPLES = process.env.UI_SAMPLES ?? "C:/YasamSistemi-Gorsel-Tasarim/kisisel-calisma-alani-p0-son-kabul/assets/ornek";
const ONLY = (process.env.UI_ONLY ?? "YTPH").split("");
const FIXED_TIME = new Date("2026-11-09T09:30:00+03:00");
const ANDROID_WV_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36";
const FREEZE_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "Deniz", role: "expert",
  active: true, approval_status: "approved", package_type: "premium", membership_status: "active", tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a",
  is_demo_account: false, module_permissions: { clients: true, numerology: true, human_design: true },
};

let pass = 0, fail = 0;
const fails: string[] = [];
function ok(group: string, name: string, cond: boolean, detail: unknown = "") {
  if (cond) pass++; else { fail++; fails.push(`[${group}] ${name}`); }
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail !== "" ? `  → ${JSON.stringify(detail).slice(0, 500)}` : ""}`);
}
const design = (v: unknown): WorkspaceDesign => { const r = parseDesign(v, { allowAssets: true }); if (!r.ok) throw new Error(`şema: ${r.path} ${r.error}`); return r.value; };

type Ctx = { ctx: BrowserContext; page: Page; errors: string[] };
async function open(browser: Browser, mock: WorkspaceMock, vp: { width: number; height: number }, ua?: string): Promise<Ctx> {
  const mobile = Boolean(ua) && browser.browserType().name() === "chromium";
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 768 && browser.browserType().name() !== "firefox", isMobile: mobile, userAgent: mobile ? ua : undefined, deviceScaleFactor: 1, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: "2026-11-01T00:00:00.000Z" }));
    } catch { /* */ }
  }, USER);
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port !== new URL(BASE).port) return route.fulfill({ status: 200, json: [] });
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.startsWith("/api/settings/workspace")) {
      const r = await mock.handle(req.method(), url.pathname, url.searchParams, req.postDataBuffer());
      return r.body ? route.fulfill({ status: r.status, body: r.body, contentType: r.contentType }) : route.fulfill({ status: r.status, json: r.json });
    }
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], items: [], count: 0 } });
  });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(FIXED_TIME);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return { ctx, page, errors };
}
async function settle(page: Page) {
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  await page.waitForTimeout(700);
}
async function home(page: Page) {
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForSelector('[data-testid="home-hub-grid"] h3', { timeout: 180000 });
  await page.waitForSelector('section[aria-labelledby="home-hero-title"], [data-pw-band-off]', { state: "attached", timeout: 60000 });
  await settle(page);
}
const drawer = (page: Page) => page.locator('[role="dialog"][aria-labelledby="studio-title"]');
async function studio(page: Page) {
  await page.goto(BASE + "/?calisma-alanim=1", { waitUntil: "load" });
  await page.waitForSelector('[role="dialog"][aria-labelledby="studio-title"]', { timeout: 180000 });
  await page.waitForSelector('[data-testid="studio-band"]', { timeout: 60000 });
  await settle(page);
}
async function applyAndClose(page: Page) {
  await drawer(page).getByRole("button", { name: "Uygula", exact: true }).click();
  const sync = page.getByRole("button", { name: "Hayır, mobil tasarımım ayrı kalsın" });
  if (await sync.isVisible().catch(() => false)) await sync.click();
  await page.waitForSelector('[role="dialog"][aria-labelledby="studio-title"]', { state: "detached", timeout: 20000 });
}

/** Geometri (düz metin betik: tsx'in __name eklentisi page.evaluate içinde çalışmaz). */
const GEO_JS = `(() => {
  var R = function (e) { if (!e) return null; var b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
  var content = document.querySelector('[data-pw-part="content"]');
  var hero = document.querySelector('section[data-pw-hero]');
  var mods = document.querySelector('[data-pw-part="mods"]');
  var aside = content ? content.querySelector(':scope > aside') : null;
  var gear = document.querySelector('[data-testid="home-settings-gear"]');
  var toolbar = gear && gear.parentElement ? gear.parentElement.parentElement : null;
  var title = hero ? hero.querySelector('h1') : null;
  var date = hero ? hero.querySelector('[class*="cDate"], [class*="hDate"], [class*="lnDate"]') : null;
  var texts = hero ? Array.prototype.map.call(hero.querySelectorAll('h1, p'), function (e) { var b = e.getBoundingClientRect(); return { r: [b.left, b.top, b.width, b.height], t: (e.textContent || '').slice(0, 30) }; }) : [];
  return { vw: window.innerWidth, content: R(content), hero: R(hero), mods: R(mods), aside: R(aside), toolbar: R(toolbar), title: R(title), date: R(date),
    titleText: title ? (title.textContent || '').trim() : null, texts: texts,
    h1: Array.prototype.map.call(document.querySelectorAll('h1'), function (h) { return { id: h.id, r: R(h) }; }),
    hscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    tier: hero ? hero.getAttribute('data-pw-tier') : null, fit: hero ? hero.getAttribute('data-pw-fit') : null, bandH: hero ? hero.getAttribute('data-pw-band-h') : null,
    off: !!document.querySelector('[data-pw-band-off]'), legacyLogo: document.querySelectorAll('section[data-pw-hero] [data-pw-zone]').length,
    frame: (function () { var f = document.querySelector('section[data-pw-hero] [class*="artFrame"]'); return !!f && f.getBoundingClientRect().width > 0; })(), photo: document.querySelectorAll('section[data-pw-hero] img[data-pw-frame-photo], section[data-pw-hero] picture img').length };
})()`;
type Geo = {
  vw: number; content: number[] | null; hero: number[] | null; mods: number[] | null; aside: number[] | null; toolbar: number[] | null;
  title: number[] | null; date: number[] | null; titleText: string | null; texts: { r: number[]; t: string }[];
  h1: { id: string; r: number[] | null }[]; hscroll: boolean; tier: string | null; fit: string | null; bandH: string | null; off: boolean;
  legacyLogo: number; frame: boolean; photo: number;
};
const geo = (page: Page) => page.evaluate(GEO_JS) as Promise<Geo>;
const near = (a: number, b: number, tol = 1.5) => Math.abs(a - b) <= tol;
const inside = (c: number[], m: number[], tol = 1.5) => c[0] >= m[0] - tol && c[1] >= m[1] - tol && c[0] + c[2] <= m[0] + m[2] + tol && c[1] + c[3] <= m[1] + m[3] + tol;
const hit = (a: number[], b: number[]) => a[0] < b[0] + b[2] - 0.5 && a[0] + a[2] > b[0] + 0.5 && a[1] < b[1] + b[3] - 0.5 && a[1] + a[3] > b[1] + 0.5;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const photoBytes = readFileSync(join(SAMPLES, "temsili-aile-fotografi.jpg"));
  const logoBytes = readFileSync(join(SAMPLES, "logo-bedenin-frekansi-yatay.png"));
  const longTitle = "Bedenin Frekansı · Bütüncül Danışmanlık Ofisi";
  type Sample = { key: string; layout: "A" | "B" | "C"; legacyLogo: boolean; make: (ids: { photo: string; logo: string }) => Record<string, unknown> };
  const samples: Sample[] = [
    { key: "A-varsayilan", layout: "A", legacyLogo: false, make: () => ({ layout: "A" }) },
    { key: "A-foto-logo", layout: "A", legacyLogo: true, make: (i) => ({ layout: "A", bg: { mode: "photo", photoAssetId: i.photo, tone: "light" }, logo: { assetId: i.logo, plate: "cam", layout: { desktop: { zone: "hero", x: 0.92, y: 0.18, w: 0.16 }, mobile: { zone: "hero", x: 0.85, y: 0.15, w: 0.3 } } } }) },
    { key: "B-tema-uzun", layout: "B", legacyLogo: false, make: () => ({ layout: "B", bg: { mode: "theme", theme: "lavanta" }, text: { useGreeting: false, align: "left", lines: [{ id: "t", role: "title", text: longTitle, size: 44 }, { id: "s", role: "body", text: "Randevu, danışan ve analizleriniz tek yerde." }] } }) },
    { key: "B-sayfa-foto-gece", layout: "B", legacyLogo: false, make: (i) => ({ layout: "B", bg: { mode: "photo", photoAssetId: i.photo, scope: "page", tone: "dark" } }) },
    { key: "C-foto-cerceve", layout: "C", legacyLogo: true, make: (i) => ({ layout: "C", bg: { mode: "photo", photoAssetId: i.photo, tone: "light" }, logo: { assetId: i.logo, plate: "beyaz", layout: { desktop: { zone: "cerceve", x: 0.1, y: 0.1, w: 0.3 }, mobile: { zone: "cerceve", x: 0.1, y: 0.1, w: 0.3 } } } }) },
    { key: "C-tema-koyu", layout: "C", legacyLogo: false, make: () => ({ layout: "C", bg: { mode: "theme", theme: "gece", tone: "dark" } }) },
  ];
  const heights = [40, 56, 120, 240];
  const vps: { w: number; h: number; ua?: string; tag: string }[] = [
    { w: 1440, h: 900, tag: "1440" }, { w: 1280, h: 800, tag: "1280" }, { w: 1024, h: 768, tag: "1024-tablet" }, { w: 768, h: 1024, tag: "768-tablet" },
    { w: 390, h: 844, ua: ANDROID_WV_UA, tag: "390-android" }, { w: 375, h: 812, tag: "375" }, { w: 320, h: 720, tag: "320" },
  ];
  const shotTags = new Set(["1440", "390-android", "320"]);
  const results: unknown[] = [];
  const browser = await chromium.launch();
  try {
    // ── Y: yükseklik ──
    if (ONLY.includes("Y")) for (const sm of samples.filter((x) => !process.env.UI_SAMPLE || x.key.startsWith(process.env.UI_SAMPLE))) for (const vp of vps) for (const hgt of heights) for (const width of hgt === 40 ? [100, 60] : [100]) {
      const mock = createWorkspaceMock({ enabled: true });
      const ids = { photo: await mock.seedAsset("photo", photoBytes, "aile.jpg", "image/jpeg"), logo: await mock.seedAsset("logo", logoBytes, "logo.png", "image/png") };
      mock.seed({ applied: design({ ...sm.make(ids), band: { visible: true, width, align: width < 100 ? "right" : "left", height: hgt } }), ...(sm.key.endsWith("gece") ? { prefs: { viewMode: "night" } } : {}) });
      const c = await open(browser, mock, { width: vp.w, height: vp.h }, vp.ua);
      const name = `${sm.key}-${hgt}px${width < 100 ? `-w${width}` : ""}-${vp.tag}`;
      try {
        await home(c.page);
        const g = await geo(c.page);
        results.push({ name, g });
        if (shotTags.has(vp.tag)) await c.page.screenshot({ path: join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: vp.w, height: Math.min(vp.h, 640) } });
        if (!g.hero || !g.title || !g.mods) { ok("Y", `${name}: karşılama ölçüldü`, false, g); continue; }
        const tier = hgt < 88 ? "row" : hgt < 200 ? "stack" : "full";
        const fixed = tier !== "full" || vp.w > 640;
        ok("Y", `${name}: kademe ${tier}, sayfa hatası / yatay taşma yok`, g.tier === tier && g.bandH === String(hgt) && !g.hscroll && c.errors.length === 0, { tier: g.tier, hs: g.hscroll, e: c.errors });
        if (fixed && g.fit !== "grow") ok("Y", `${name}: yükseklik tam ${hgt} px (${Math.round(g.hero[3])})`, near(g.hero[3], hgt, 1), g.hero);
        if (g.fit === "grow") ok("Y", `${name}: metin sığmadı → alan uzadı (${Math.round(g.hero[3])} px ≥ ${hgt}), açıkça işaretli`, g.hero[3] >= hgt - 1, g.hero);
        // Alan overflow:hidden → dışarı taşan metin kesilmiş olurdu; bu yüzden her metin kutusu alanın içinde olmalı.
        ok("Y", `${name}: başlık ve metinler alanın içinde, kesilmiyor`, g.texts.every((x) => x.r[2] < 1 || inside(x.r, g.hero!)), g.texts.filter((x) => !inside(x.r, g.hero!)));
        if (g.date) ok("Y", `${name}: başlık ve tarih üst üste binmiyor`, !hit(g.title, g.date), { t: g.title, d: g.date });
        if (tier !== "full") {
          ok("Y", `${name}: tarih ya gösterilir ya da (sığmadığı için) açıkça kaldırılır`, (!!g.date && g.fit === "ok") || (!g.date && (g.fit === "nodate" || g.fit === "grow")), { fit: g.fit, date: !!g.date });
          ok("Y", `${name}: kompakt → tek başlık (h1), diğer satırlar çizilmez`, g.texts.filter((x) => x.r[2] > 1).length <= 2 && g.h1.length === 1, g.texts);
          if (sm.legacyLogo) ok("Y", `${name}: alan içi eski bölge logosu bu yükseklikte çizilmez`, g.legacyLogo === 0);
        }
        // Mevcut kural (değişmedi): mobilde tema zemininde boş çerçeve hiç gösterilmez.
        const frameHidden = tier === "row" || (vp.w <= 640 && (tier !== "full" || sm.key.startsWith("C-tema")));
        if (sm.layout === "C") ok("Y", `${name}: C çerçevesi kademeye uygun (${frameHidden ? "gizli" : "görünür"})`, g.frame === !frameHidden, { frame: g.frame });
        ok("Y", `${name}: karşılama modüllerin üstünde, çakışma yok`, g.hero[1] + g.hero[3] <= g.mods[1] + 0.5, { hero: g.hero, mods: g.mods });
      } finally { await c.ctx.close(); }
    }

    // ── T: üst boşluk ──
    if (ONLY.includes("T")) for (const vp of [{ w: 1440, h: 900, tag: "1440" }, { w: 768, h: 1024, tag: "768" }, { w: 375, h: 812, tag: "375" }]) for (const top of [0, undefined, 40] as (number | undefined)[]) {
      const mock = createWorkspaceMock({ enabled: true });
      mock.seed({ applied: design({ layout: "A", band: { visible: true, width: 100, align: "left", height: 56, ...(top === undefined ? {} : { top }) } }) });
      const c = await open(browser, mock, { width: vp.w, height: vp.h });
      const name = `ust-${top ?? "varsayilan"}-${vp.tag}`;
      try {
        await home(c.page);
        const g = await geo(c.page);
        if (!g.hero || !g.toolbar) { ok("T", `${name}: ölçüldü`, false, g); continue; }
        const gap = g.hero[1] - (g.toolbar[1] + g.toolbar[3]);
        ok("T", `${name}: araç çubuğu–karşılama arası ${Math.round(gap)} px (beklenen ${top ?? 14}), araç çubuğuna binmez`, near(gap, top ?? 14, 1) && gap >= -0.5 && !g.hscroll, { gap, toolbar: g.toolbar, hero: g.hero });
        if (vp.tag === "1440") await c.page.screenshot({ path: join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: vp.w, height: 400 } });
      } finally { await c.ctx.close(); }
    }

    // ── P: panel akışı ──
    if (ONLY.includes("P")) for (const vp of [{ w: 1440, h: 900, tag: "1440" }, { w: 390, h: 844, ua: ANDROID_WV_UA, tag: "390-android" }]) {
      const mock = createWorkspaceMock({ enabled: true });
      const photo = await mock.seedAsset("photo", photoBytes, "aile.jpg", "image/jpeg");
      const logo = await mock.seedAsset("logo", logoBytes, "logo.png", "image/png");
      const base = design({
        layout: "A", bg: { mode: "photo", photoAssetId: photo, tone: "light" },
        logo: { assetId: logo, plate: "cam", layout: { desktop: { zone: "hero", x: 0.92, y: 0.18, w: 0.16 }, mobile: { zone: "hero", x: 0.85, y: 0.15, w: 0.3 } } },
        text: { useGreeting: false, showDate: true, lines: [{ id: "t", role: "title", text: "Deniz Ofis" }, { id: "b", role: "body", text: "Bütüncül danışmanlık" }] },
        band: { visible: true, width: 80, align: "center" },
      });
      mock.seed({ applied: base });
      const c = await open(browser, mock, { width: vp.w, height: vp.h }, vp.ua);
      const p = c.page;
      const band = () => drawer(p).locator('[data-testid="studio-band"]');
      const state = async () => (await mock.handle("GET", "/api/settings/workspace/design", new URLSearchParams(), null)).json as { design: { applied: WorkspaceDesign | null; draft: WorkspaceDesign | null; history: { id: string; design: WorkspaceDesign }[] } };
      const T = vp.tag;
      try {
        await home(p);
        const g0 = await geo(p);
        await studio(p);
        await band().scrollIntoViewIfNeeded();
        const heights = band().getByRole("radiogroup", { name: "Yükseklik" });
        ok("P", `${T}: “Yükseklik” seçenekleri: Normal (seçili) / Kompakt / İnce / Çok ince / Özel`, (await heights.getByRole("radio").count()) === 5 && (await heights.getByRole("radio", { name: "Normal" }).getAttribute("aria-checked")) === "true");
        await heights.getByRole("radio", { name: "Çok ince" }).click();
        await p.waitForTimeout(400);
        const slider = band().getByRole("slider", { name: "Yükseklik (piksel)" });
        let g = await geo(p);
        ok("P", `${T}: Çok ince → 40 px önizleme, tek satır, açıklama gösterilir`, (await slider.inputValue()) === "40" && g.tier === "row" && /Tek satır/.test(await band().getByTestId("studio-band-tier").innerText()));
        ok("P", `${T}: alan içi logo için açıklama (bu yükseklikte gösterilmez)`, (await band().getByTestId("studio-band-logo-note").count()) === 1);
        await band().scrollIntoViewIfNeeded();
        await p.screenshot({ path: join(OUT, `panel-cok-ince-${T}.png`) });
        // Özel: klavye ile 40 → 48 (seçenek "Özel"e geçer, değer korunur)
        await slider.focus();
        await p.keyboard.press("ArrowRight");
        await p.keyboard.press("ArrowRight");
        await p.waitForTimeout(300);
        ok("P", `${T}: özel yükseklik klavye ile 48 px, seçim “Özel”, değer sessizce değişmez`, (await slider.inputValue()) === "48" && (await heights.getByRole("radio", { name: "Özel" }).getAttribute("aria-checked")) === "true" && (await geo(p)).bandH === "48");
        // Üst boşluk 0
        const top = band().getByRole("slider", { name: "Üst boşluk" });
        await top.focus();
        for (let i = 0; i < 7; i++) await p.keyboard.press("ArrowLeft");
        await p.waitForTimeout(300);
        g = await geo(p);
        ok("P", `${T}: üst boşluk 0 px → alan araç çubuğuna değer, binmez`, (await top.inputValue()) === "0" && !!g.hero && !!g.toolbar && near(g.hero[1], g.toolbar[1] + g.toolbar[3], 1), { hero: g.hero, tb: g.toolbar });
        await drawer(p).getByRole("button", { name: "Taslağı kaydet" }).click();
        await p.waitForTimeout(600);
        ok("P", `${T}: Taslağı kaydet → taslakta 48 px / üst 0; uygulanan değişmedi`, (await state()).design.draft?.band?.height === 48 && (await state()).design.draft?.band?.top === 0 && (await state()).design.applied?.band?.height === undefined);
        await applyAndClose(p);
        await home(p);
        g = await geo(p);
        ok("P", `${T}: Uygula + yenileme → 48 px, üst 0, genişlik %80 orta korunur`, g.bandH === "48" && !!g.hero && near(g.hero[3], 48, 1) || g.fit === "grow", g);
        const st1 = (await state()).design.applied;
        ok("P", `${T}: kayıtta genişlik/hiza aynen, metin + fotoğraf + logo silinmedi`, st1?.band?.width === 80 && st1.band.align === "center" && st1.text.lines.length === 2 && st1.bg.photoAssetId === photo && st1.logo.assetId === logo, st1);
        if (T === "1440") await p.screenshot({ path: join(OUT, `uygulandi-48-${T}.png`), clip: { x: 0, y: 0, width: vp.w, height: 500 } });
        // Normal'e dön → eski görünüm eksiksiz
        await studio(p);
        await band().scrollIntoViewIfNeeded();
        await band().getByRole("radiogroup", { name: "Yükseklik" }).getByRole("radio", { name: "Normal" }).click();
        await applyAndClose(p);
        await home(p);
        g = await geo(p);
        ok("P", `${T}: Normal'e dönünce metin, tarih, fotoğraf ve logo eksiksiz geri gelir`,
          !g.tier && g.titleText === g0.titleText && g.texts.length === g0.texts.length && !!g.date && g.photo === g0.photo && g.legacyLogo === g0.legacyLogo && !!g.hero && !!g0.hero && near(g.hero[3], g0.hero[3], 1.5), { once: g0, sonra: g });
        // Geçmiş: 48 px tasarıma dön
        await studio(p);
        await drawer(p).getByRole("tab", { name: /Kayıtlar|Kayıtlı/ }).click();
        await drawer(p).getByRole("button", { name: "Bu tasarıma dön" }).first().click();
        await p.getByRole("alertdialog").getByRole("button", { name: "Evet, bu tasarıma dön" }).click();
        await p.waitForSelector('[role="dialog"][aria-labelledby="studio-title"]', { state: "detached", timeout: 20000 }).catch(() => null);
        await home(p);
        ok("P", `${T}: Geçmişten geri dönüş → 48 px ince tasarım`, (await geo(p)).bandH === "48" && (await state()).design.applied?.band?.height === 48);
        // Sıfırla → varsayılan
        await studio(p);
        await drawer(p).getByRole("tab", { name: /Kayıtlar|Kayıtlı/ }).click();
        await drawer(p).getByTestId("studio-reset-design").click();
        await p.getByRole("alertdialog").getByRole("button", { name: "Evet, sıfırla" }).click();
        await p.waitForSelector('[role="dialog"][aria-labelledby="studio-title"]', { state: "detached", timeout: 20000 }).catch(() => null);
        await home(p);
        g = await geo(p);
        ok("P", `${T}: Sıfırla → varsayılan görünüm (yükseklik / üst boşluk özniteliği yok)`, (await state()).design.applied === null && !g.tier && !g.off, g);
        ok("P", `${T}: panel akışında sayfa hatası yok`, c.errors.length === 0, c.errors);
      } finally { await c.ctx.close(); }
    }
    // P2: sığmayan uzun başlık → panel açıklaması (320 px, 40 px)
    if (ONLY.includes("P")) {
      const mock = createWorkspaceMock({ enabled: true });
      mock.seed({ applied: design({ layout: "B", bg: { mode: "theme", theme: "lavanta" }, text: { useGreeting: false, lines: [{ id: "t", role: "title", text: longTitle }] }, band: { visible: true, width: 100, align: "left", height: 40 } }) });
      const c = await open(browser, mock, { width: 320, height: 720 });
      try {
        await studio(c.page);
        await drawer(c.page).locator('[data-testid="studio-band"]').scrollIntoViewIfNeeded();
        await c.page.waitForTimeout(500);
        const g = await geo(c.page);
        const note = drawer(c.page).getByTestId("studio-band-fit");
        ok("P", `320: uzun başlık 40 px'e sığmıyor → sayfa “${g.fit}”, panel açıklaması gösterilir (sessiz dönüşüm yok)`,
          (g.fit === "nodate" || g.fit === "grow") && (await note.isVisible()) && (g.fit !== "grow" || /40 px/.test(await note.innerText())), { fit: g.fit });
        await c.page.screenshot({ path: join(OUT, "panel-sigmayan-320.png") });
      } finally { await c.ctx.close(); }
    }
  } finally {
    writeFileSync(join(OUT, "olcum.json"), JSON.stringify(results, null, 1));
    await browser.close();
  }

  // ── H: gizle / göster canlı davranış, üç motor ──
  if (ONLY.includes("H")) for (const bt of [chromium, firefox, webkit] as BrowserType[]) {
    const eng = bt.name();
    const b = await bt.launch();
    try {
      for (const vp of [{ w: 1440, h: 900, tag: "1440" }, { w: 375, h: 812, tag: "375" }]) for (const kind of ["normal", "dusuk-kontrast"] as const) {
        const mock = createWorkspaceMock({ enabled: true });
        const seedText = kind === "normal" ? { useGreeting: true } : { useGreeting: false, lines: [{ id: "a", role: "body", text: "Soluk satır", color: "#ffffff" }] };
        // Düşük kontrastlı kayıt: şemadan geçer, sunucu kapısı nedeniyle normalde uygulanamaz → doğrudan tohumlanır (eski kural sonrası kalmış kayıt senaryosu).
        mock.seed({ applied: design({ layout: "A", bg: { mode: "theme", theme: "lavanta" }, text: seedText, band: { visible: true, width: 70, align: "right", height: 120 } }) });
        const c = await open(b, mock, { width: vp.w, height: vp.h });
        const p = c.page;
        const name = `${eng}-${vp.tag}-${kind}`;
        try {
          await home(p);
          const g0 = await geo(p);
          await studio(p);
          await drawer(p).locator('[data-testid="studio-band"]').scrollIntoViewIfNeeded();
          await drawer(p).locator('[data-testid="studio-band"]').getByRole("checkbox", { name: "Karşılama alanını göster" }).uncheck();
          await p.waitForTimeout(400);
          const applyBtn = drawer(p).getByRole("button", { name: "Uygula", exact: true });
          ok("H", `${name}: gizle → önizlemede alan kalktı, “Uygula” açık`, !(await geo(p)).hero && (await applyBtn.isEnabled()));
          await applyAndClose(p);
          await home(p);
          let g = await geo(p);
          const flushAside = !g.aside || vp.w <= 1180 || near(g.aside[1], g.content![1], 1);
          ok("H", `${name}: gizli kalıcı; modüller${vp.w > 1180 ? " ve sağ sütun" : ""} boşluksuz en üstte; tek h1`,
            !g.hero && g.off && !!g.mods && !!g.content && near(g.mods[1], g.content[1], 1) && flushAside && g.h1.length === 1 && !g.hscroll && c.errors.length === 0, g);
          await p.screenshot({ path: join(OUT, `gizli-${name}.png`), clip: { x: 0, y: 0, width: vp.w, height: Math.min(vp.h, 600) } });
          // Yeniden göster
          await studio(p);
          await drawer(p).locator('[data-testid="studio-band"]').scrollIntoViewIfNeeded();
          await drawer(p).locator('[data-testid="studio-band"]').getByRole("checkbox", { name: "Karşılama alanını göster" }).check();
          await p.waitForTimeout(400);
          g = await geo(p);
          ok("H", `${name}: yeniden göster → önceki 120 px / %70 sağ ayarı ve metin aynen`, g.bandH === "120" && g.titleText === g0.titleText && !!g.hero);
          if (kind === "normal") {
            await applyAndClose(p);
            await home(p);
            g = await geo(p);
            ok("H", `${name}: göster uygulandı, yenilemede görünür`, !!g.hero && g.bandH === "120" && !g.off);
          } else {
            ok("H", `${name}: soluk satırla yeniden göstermede okunabilirlik kapısı “Uygula”yı kilitler (kural aynen)`, !(await drawer(p).getByRole("button", { name: "Uygula", exact: true }).isEnabled()));
          }
        } finally { await c.ctx.close(); }
      }
    } finally { await b.close(); }
  }

  console.log(`\nui-band-v3 harness: ${pass} PASS / ${fail} FAIL`);
  if (fails.length) console.log(fails.join("\n"));
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
