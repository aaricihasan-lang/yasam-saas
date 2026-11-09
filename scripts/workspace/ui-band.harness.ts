/**
 * KİŞİSEL DİJİTAL OFİS V2 — Karşılama alanı: genişlik / hiza / göster-gizle (Playwright, yerel, ağ-mock).
 *
 * Prod'a / dış ağa temas YOK: /api/settings/workspace/* → ui-personal-backend.ts (gerçek şema + durum geçişi, bellekte);
 * 127.0.0.1 dışı abort. CI listesinde DEĞİL (çalışan sunucu ister: yerel production build + `next start`).
 *   UI_BASE=http://127.0.0.1:3974 UI_OUT=<klasör> [UI_PHASE=once|sonra] [UI_ONCE=<önce klasörü>] npx tsx scripts/workspace/ui-band.harness.ts
 * UI_PHASE=once: yalnız eski kayıt (band yok) ekranları — değişiklik ÖNCESİ kodla (güncel main) alınır.
 * UI_ONCE verilirse eski kayıt ekranları önceki kodla piksel karşılaştırılır (kanal farkı > 16 olan piksel sayısı 0 olmalı).
 * Bölümler:
 *   G  geometri: A/B/C × (eski kayıt, %60 sol, %80 orta, %70 sağ, gizli) × 320/375/390-android/768/1024/1280/1440
 *   K  kapalı kişiselleştirme ve Gece modu
 *   S  Kişiselleştirme paneli: klavye ile genişlik, hiza, Taslak → yenile → Uygula → yenile, gizle/göster, Geçmiş, Sıfırla
 *   L  logo: karşılama içindeki (eski bölge) logo açıklaması; sayfadaki serbest logo gizlenince kayar, açılınca geri döner
 *   M  mobil panelde düzenleme (390)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createWorkspaceMock, type WorkspaceMock } from "./ui-personal-backend";
import { parseDesign, type WorkspaceDesign } from "../../lib/workspace/schema";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3974";
const OUT = process.env.UI_OUT ?? "karsilama-alani";
const PHASE = process.env.UI_PHASE ?? "sonra";
const ONCE = process.env.UI_ONCE ?? "";
const SAMPLES = process.env.UI_SAMPLES ?? "C:/YasamSistemi-Gorsel-Tasarim/kisisel-calisma-alani-p0-son-kabul/assets/ornek";
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

let browser: Browser;
type Ctx = { ctx: BrowserContext; page: Page; errors: string[] };
async function open(mock: WorkspaceMock, vp: { width: number; height: number }, ua?: string): Promise<Ctx> {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 768, isMobile: Boolean(ua), userAgent: ua, deviceScaleFactor: 1, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
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
async function home(page: Page, personal = true) {
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForSelector('[data-testid="home-hub-grid"] h3', { timeout: 180000 });
  // Sıfırlanmış / tasarımsız hesapta kök öznitelik yoktur → karşılama bölümü ya da gizli başlık beklenir.
  if (personal) await page.waitForSelector('section[aria-labelledby="home-hero-title"], [data-pw-band-off]', { state: "attached", timeout: 60000 });
  await settle(page);
}
const drawer = (page: Page) => page.locator('[role="dialog"][aria-labelledby="studio-title"]');
async function studio(page: Page) {
  await page.goto(BASE + "/?calisma-alanim=1", { waitUntil: "load" });
  await page.waitForSelector('[role="dialog"][aria-labelledby="studio-title"]', { timeout: 180000 });
  await page.waitForSelector('[data-testid="studio-band"]', { timeout: 60000 });
  await settle(page);
}

/** Geometri (düz metin betik: tsx'in __name eklentisi page.evaluate içinde çalışmaz). */
const GEO_JS = `(() => {
  var R = function (e) { if (!e) return null; var b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
  var content = document.querySelector('[data-pw-part="content"]') || document.querySelector('main [class*="content"]');
  var hero = document.querySelector('section[data-pw-hero]') || document.querySelector('section[aria-labelledby="home-hero-title"]');
  var mods = document.querySelector('[data-pw-part="mods"]') || document.querySelector('section[aria-labelledby="yasam-modulleri-title"]');
  var aside = content ? content.querySelector(':scope > aside') : null;
  var parts = [];
  if (hero) hero.querySelectorAll('h1, p, [class*="plaque"], [class*="artFrame"], [data-pw-zone] [role="img"]').forEach(function (e) {
    var b = e.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) return;
    parts.push({ tag: e.tagName, cls: String(e.className).slice(0, 40), r: [b.left, b.top, b.width, b.height], over: e.scrollWidth > e.clientWidth + 1 && e.tagName !== 'DIV' });
  });
  var h1 = Array.prototype.map.call(document.querySelectorAll('h1'), function (h) { return { id: h.id, r: R(h), text: (h.textContent || '').trim() }; });
  var logo = document.querySelector('[data-pw-free-logo="page"] > *');
  var cards = Array.prototype.map.call(document.querySelectorAll('[data-testid="home-hub-grid"] > *, [data-pw-part="sechead"] > h2'), R);
  return { vw: window.innerWidth, content: R(content), hero: R(hero), mods: R(mods), aside: R(aside), parts: parts, h1: h1,
    hscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    bandW: hero ? hero.getAttribute('data-pw-band-w') : null, bandA: hero ? hero.getAttribute('data-pw-band-align') : null,
    off: !!document.querySelector('[data-pw-band-off]'), layout: hero ? hero.getAttribute('data-pw-hero') : null,
    anyBandAttr: !!document.querySelector('[data-pw-band-w], [data-pw-band-align]'), logo: R(logo), cards: cards,
    heroBg: hero ? getComputedStyle(hero).width : null };
})()`;
type Geo = {
  vw: number; content: number[] | null; hero: number[] | null; mods: number[] | null; aside: number[] | null;
  parts: { tag: string; cls: string; r: number[]; over: boolean }[]; h1: { id: string; r: number[] | null; text: string }[];
  hscroll: boolean; bandW: string | null; bandA: string | null; off: boolean; layout: string | null; anyBandAttr: boolean;
  logo: number[] | null; cards: (number[] | null)[];
};
const geo = (page: Page) => page.evaluate(GEO_JS) as Promise<Geo>;
const near = (a: number, b: number, tol = 1.5) => Math.abs(a - b) <= tol;
const inside = (c: number[], m: number[], tol = 1.5) => c[0] >= m[0] - tol && c[1] >= m[1] - tol && c[0] + c[2] <= m[0] + m[2] + tol && c[1] + c[3] <= m[1] + m[3] + tol;
const hit = (a: number[], b: number[]) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];

type Band = { visible: boolean; width: number; align: "left" | "center" | "right" } | undefined;
/** Beklenen genişlik: CSS ile aynı formül → clamp(min(alan, taban), yüzde × alan, alan). */
function expectedWidth(gridW: number, band: Band, layout: string): number {
  if (!band || band.width >= 100) return gridW;
  const floor = Math.min(gridW, layout === "C" ? 680 : 560);
  return Math.min(gridW, Math.max(floor, (band.width / 100) * gridW));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch();
  const photoBytes = readFileSync(join(SAMPLES, "temsili-aile-fotografi.jpg"));
  const logoBytes = readFileSync(join(SAMPLES, "logo-bedenin-frekansi-yatay.png"));
  const longTitle = "Bedenin Frekansı · Bütüncül Danışmanlık Ofisi";
  // Tasarım örnekleri: A (varsayılan / fotoğraf + karşılama içi logo), B (tema / tüm sayfa fotoğrafı), C (fotoğraf + çerçeve logosu / tema)
  type Sample = { key: string; layout: "A" | "B" | "C"; make: (ids: { photo: string; logo: string }) => Record<string, unknown> };
  const samples: Sample[] = [
    { key: "A-varsayilan", layout: "A", make: () => ({ layout: "A" }) },
    { key: "A-foto-logo", layout: "A", make: (i) => ({ layout: "A", bg: { mode: "photo", photoAssetId: i.photo, tone: "light" }, logo: { assetId: i.logo, plate: "cam", layout: { desktop: { zone: "hero", x: 0.92, y: 0.18, w: 0.16 }, mobile: { zone: "hero", x: 0.85, y: 0.15, w: 0.3 } } } }) },
    { key: "B-tema-uzun", layout: "B", make: () => ({ layout: "B", bg: { mode: "theme", theme: "lavanta" }, text: { useGreeting: false, align: "left", lines: [{ id: "t", role: "title", text: longTitle, size: 44 }, { id: "s", role: "body", text: "Randevu, danışan ve analizleriniz tek yerde." }] } }) },
    { key: "B-sayfa-foto", layout: "B", make: (i) => ({ layout: "B", bg: { mode: "photo", photoAssetId: i.photo, scope: "page", tone: "light" } }) },
    { key: "C-foto-cerceve", layout: "C", make: (i) => ({ layout: "C", bg: { mode: "photo", photoAssetId: i.photo, tone: "light" }, logo: { assetId: i.logo, plate: "beyaz", layout: { desktop: { zone: "cerceve", x: 0.1, y: 0.1, w: 0.3 }, mobile: { zone: "cerceve", x: 0.1, y: 0.1, w: 0.3 } } } }) },
    { key: "C-tema", layout: "C", make: () => ({ layout: "C", bg: { mode: "theme", theme: "sampanya" }, text: { useGreeting: true, showDate: true, align: "left", valign: "center", lines: [] } }) },
  ];
  const bands: { key: string; band: Band }[] = [
    { key: "eski", band: undefined },
    { key: "60-sol", band: { visible: true, width: 60, align: "left" } },
    { key: "80-orta", band: { visible: true, width: 80, align: "center" } },
    { key: "70-sag", band: { visible: true, width: 70, align: "right" } },
    { key: "gizli", band: { visible: false, width: 70, align: "right" } },
  ];
  const vps: { w: number; h: number; ua?: string; tag: string }[] = [
    { w: 1440, h: 900, tag: "1440" }, { w: 1280, h: 800, tag: "1280" }, { w: 1024, h: 768, tag: "1024-tablet" }, { w: 768, h: 1024, tag: "768-tablet" },
    { w: 390, h: 844, ua: ANDROID_WV_UA, tag: "390-android" }, { w: 375, h: 812, tag: "375" }, { w: 320, h: 720, tag: "320" },
  ];
  const shotTags = new Set(["1440", "1280", "390-android", "320"]);
  const results: unknown[] = [];
  try {
    // ── G: geometri ──
    // UI_SKIP_G=1: geometri bölümünü atla (yalnız panel / logo / mobil akışı yeniden koşmak için).
    if (process.env.UI_SKIP_G !== "1") for (const sm of samples) for (const vp of vps) {
      const visibleTop: Record<string, number> = {};
      for (const b of PHASE === "once" ? bands.filter((x) => !x.band) : bands) {
        const mock = createWorkspaceMock({ enabled: true });
        const ids = { photo: await mock.seedAsset("photo", photoBytes, "aile.jpg", "image/jpeg"), logo: await mock.seedAsset("logo", logoBytes, "logo.png", "image/png") };
        const d = design({ ...sm.make(ids), ...(b.band ? { band: b.band } : {}) });
        mock.seed({ applied: d });
        const c = await open(mock, { width: vp.w, height: vp.h }, vp.ua);
        const name = `${sm.key}-${b.key}-${vp.tag}`;
        try {
          await home(c.page);
          const g = await geo(c.page);
          results.push({ name, g });
          if (shotTags.has(vp.tag)) await c.page.screenshot({ path: join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: vp.w, height: Math.min(vp.h, 900) } });
          ok("G", `${name}: yatay kaydırma yok, sayfa hatası yok`, !g.hscroll && c.errors.length === 0, { hs: g.hscroll, e: c.errors });
          const h1 = g.h1.filter((h) => h.id === "home-hero-title");
          ok("G", `${name}: tek h1 (#home-hero-title)`, g.h1.length === 1 && h1.length === 1 && h1[0].text.length > 0, g.h1);
          if (!g.content || !g.mods) { ok("G", `${name}: ızgara ölçüldü`, false, g); continue; }
          const gridW = g.content[2];
          if (b.band && !b.band.visible) {
            ok("G", `${name}: gizli → karşılama kutusu yok, h1 yalnız ekran okuyucuya (≤1px)`, !g.hero && g.off && !!h1[0]?.r && h1[0].r![2] <= 1.5 && h1[0].r![3] <= 1.5, { hero: g.hero, h1 });
            ok("G", `${name}: gizli → Yaşam Modülleri ızgaranın en üstünde (boş satır / boşluk yok)`, near(g.mods[1], g.content[1], 1), { mods: g.mods, content: g.content });
            if (g.aside && vp.w > 1180) ok("G", `${name}: gizli → sağ sütun da en üstte`, near(g.aside[1], g.content[1], 1), { aside: g.aside, content: g.content });
            if (visibleTop.eski !== undefined) ok("G", `${name}: gizli → modüller yukarı geldi (${Math.round(visibleTop.eski - g.mods[1])} px)`, g.mods[1] < visibleTop.eski - 100, { eski: visibleTop.eski, simdi: g.mods[1] });
            continue;
          }
          if (!g.hero) { ok("G", `${name}: karşılama ölçüldü`, false, g); continue; }
          visibleTop[b.key] = g.mods[1];
          const want = expectedWidth(gridW, b.band, sm.layout);
          ok("G", `${name}: genişlik ${Math.round(g.hero[2])} px (beklenen ${Math.round(want)} / alan ${Math.round(gridW)})`, near(g.hero[2], want, 1.5), { hero: g.hero, gridW, want });
          const off = g.hero[0] - g.content[0];
          const al = b.band?.align ?? "left";
          const wantOff = al === "left" ? 0 : al === "center" ? (gridW - g.hero[2]) / 2 : gridW - g.hero[2];
          ok("G", `${name}: hiza ${al}`, near(off, wantOff, 1.5), { off, wantOff });
          ok("G", `${name}: karşılama içeriği (isim, tarih, metin, plaket/çerçeve, logo) alanın içinde, taşma yok`,
            g.parts.length > 0 && g.parts.every((p) => inside(p.r, g.hero!) && !p.over), g.parts.filter((p) => !inside(p.r, g.hero!) || p.over));
          ok("G", `${name}: karşılama modüllerin üstünde (çakışma yok)`, g.hero[1] + g.hero[3] <= g.mods[1] + 0.5, { hero: g.hero, mods: g.mods });
          if (!b.band) ok("G", `${name}: eski kayıt → yeni öznitelik / stil YOK (bugünkü görünüm)`, !g.anyBandAttr && !g.off, g);
          if (vp.w <= 640) ok("G", `${name}: mobilde karşılama tam genişlik`, near(g.hero[2], gridW, 1.5), { hero: g.hero, gridW });
          if (b.band && vp.w > 1180) ok("G", `${name}: data-pw-band-w=${b.band.width} / hiza=${b.band.align}`, g.bandW === String(b.band.width) && g.bandA === b.band.align, { w: g.bandW, a: g.bandA });
        } finally { await c.ctx.close(); }
      }
    }

    if (PHASE === "once") return;

    // ── E: eski kayıt (band yok) → önceki kodla piksel aynı ──
    if (ONCE) for (const sm of samples) for (const tag of shotTags) {
      const a = join(ONCE, `${sm.key}-eski-${tag}.png`);
      const b = join(OUT, `${sm.key}-eski-${tag}.png`);
      if (!existsSync(a) || !existsSync(b)) { ok("E", `${sm.key} · ${tag}: önce/sonra ekranı var`, false, { a, b }); continue; }
      const A = await sharp(readFileSync(a)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const B = await sharp(readFileSync(b)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let strong = -1;
      if (A.info.width === B.info.width && A.info.height === B.info.height) {
        strong = 0;
        for (let i = 0; i < A.data.length; i += 3) if (Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2])) > 16) strong++;
      }
      ok("E", `${sm.key} · ${tag}: eski kayıt önceki kodla piksel aynı (güçlü fark ${strong})`, strong === 0, { strong, a: A.info, b: B.info });
    }

    // ── K: kişiselleştirme kapalı / Gece modu ──
    {
      const off = createWorkspaceMock({ enabled: false });
      const c = await open(off, { width: 1440, height: 900 });
      try {
        await home(c.page, false);
        const g = await geo(c.page);
        ok("K", "kişiselleştirme kapalı: varsayılan karşılama görünür, yeni öznitelik yok, tek h1", !!g.hero && !g.anyBandAttr && !g.off && g.h1.length === 1 && !g.hscroll && c.errors.length === 0, g);
        await c.page.screenshot({ path: join(OUT, "kapali-1440.png"), clip: { x: 0, y: 0, width: 1440, height: 700 } });
      } finally { await c.ctx.close(); }
      const night = createWorkspaceMock({ enabled: true });
      night.seed({ applied: design({ layout: "A", band: { visible: false } }), prefs: { viewMode: "night" } });
      const n = await open(night, { width: 1440, height: 900 });
      try {
        await home(n.page);
        const g = await geo(n.page);
        const mode = await n.page.locator("main").getAttribute("data-pw-mode");
        ok("K", "Gece modu + gizli: karşılama yok, modüller üstte, tek h1", mode === "night" && !g.hero && g.off && g.h1.length === 1 && !!g.mods && !!g.content && near(g.mods[1], g.content[1], 1), { mode, g });
        await n.page.screenshot({ path: join(OUT, "gece-gizli-1440.png"), clip: { x: 0, y: 0, width: 1440, height: 700 } });
      } finally { await n.ctx.close(); }
    }

    // ── S: Kişiselleştirme paneli akışı (1440) ──
    {
      const mock = createWorkspaceMock({ enabled: true });
      const photo = await mock.seedAsset("photo", photoBytes, "aile.jpg", "image/jpeg");
      const base = design({ layout: "A", bg: { mode: "photo", photoAssetId: photo, tone: "light" }, text: { useGreeting: false, lines: [{ id: "t", role: "title", text: "Deniz Ofis" }] } });
      mock.seed({ applied: base });
      const c = await open(mock, { width: 1440, height: 900 });
      const p = c.page;
      const band = () => drawer(p).locator('[data-testid="studio-band"]');
      const state = async () => (await mock.handle("GET", "/api/settings/workspace/design", new URLSearchParams(), null)).json as { design: { applied: WorkspaceDesign | null; draft: WorkspaceDesign | null; history: { id: string; design: WorkspaceDesign }[] } };
      try {
        await studio(p);
        const show = band().getByRole("checkbox", { name: "Karşılama alanını göster" });
        const slider = band().getByRole("slider", { name: "Genişlik" });
        const radios = band().getByRole("radiogroup", { name: "Alanın konumu" });
        ok("S", "Tasarım ve Marka → “Karşılama alanı” bölümü: göster (işaretli), genişlik %100, konum seçimi tam genişlikte kapalı",
          (await show.isChecked()) && (await slider.inputValue()) === "100" && (await radios.getByRole("radio").first().isDisabled()));
        await band().scrollIntoViewIfNeeded();
        await p.screenshot({ path: join(OUT, "panel-varsayilan-1440.png") });
        await slider.focus();
        for (let i = 0; i < 6; i++) await p.keyboard.press("ArrowLeft");
        await radios.getByRole("radio", { name: "Ortaya" }).click();
        await p.waitForTimeout(400);
        let g = await geo(p);
        ok("S", "klavye ile %70 + Ortaya → canlı önizleme (taslak) güncellendi", (await slider.inputValue()) === "70" && g.bandW === "70" && g.bandA === "center", { v: await slider.inputValue(), g: [g.bandW, g.bandA] });
        ok("S", "taslakta henüz kalıcı değil (applied değişmedi)", !(await state()).design.applied?.band);
        await p.screenshot({ path: join(OUT, "panel-70-orta-1440.png") });
        await drawer(p).getByRole("button", { name: "Taslağı kaydet" }).click();
        await p.waitForTimeout(600);
        ok("S", "Taslağı kaydet → sunucu taslağında band %70 orta", JSON.stringify((await state()).design.draft?.band) === JSON.stringify({ visible: true, width: 70, align: "center" }), (await state()).design.draft?.band);
        await home(p);
        g = await geo(p);
        ok("S", "yenileme: günlük görünüm taslaktan etkilenmez (tam genişlik)", !g.anyBandAttr && !!g.hero && !!g.content && near(g.hero[2], g.content[2]), g);
        await studio(p);
        ok("S", "panel yeniden açılınca kayıtlı taslak yüklenir (%70)", (await slider.inputValue()) === "70");
        await drawer(p).getByRole("button", { name: "Uygula", exact: true }).click();
        const sync = p.getByRole("button", { name: "Hayır, mobil tasarımım ayrı kalsın" });
        if (await sync.isVisible().catch(() => false)) await sync.click();
        await p.waitForSelector('[role="dialog"][aria-labelledby="studio-title"]', { state: "detached", timeout: 20000 });
        ok("S", "Uygula → kalıcı (applied band %70 orta)", JSON.stringify((await state()).design.applied?.band) === JSON.stringify({ visible: true, width: 70, align: "center" }));
        await home(p);
        g = await geo(p);
        ok("S", "yenileme sonrası %70 orta korunur", g.bandW === "70" && g.bandA === "center" && !!g.hero && !!g.content && near(g.hero[2], expectedWidth(g.content[2], { visible: true, width: 70, align: "center" }, "A")), g);
        await p.screenshot({ path: join(OUT, "uygulandi-70-orta-1440.png"), clip: { x: 0, y: 0, width: 1440, height: 700 } });
        // Gizle → Uygula → yenile
        await studio(p);
        await show.uncheck();
        await p.waitForTimeout(400);
        g = await geo(p);
        ok("S", "gizle (taslak): karşılama canlı önizlemede kalktı, açıklama gösterildi, genişlik denetimi gizli",
          !g.hero && g.off && (await band().getByTestId("studio-band-hidden-hint").isVisible()) && !(await slider.isVisible().catch(() => false)));
        await p.screenshot({ path: join(OUT, "panel-gizli-1440.png") });
        await drawer(p).getByRole("button", { name: "Uygula", exact: true }).click();
        if (await sync.isVisible().catch(() => false)) await sync.click();
        await p.waitForSelector('[role="dialog"][aria-labelledby="studio-title"]', { state: "detached", timeout: 20000 });
        const st1 = (await state()).design;
        ok("S", "Uygula → gizli kalıcı; metin, fotoğraf ve %70 orta ayarı silinmedi",
          st1.applied?.band?.visible === false && st1.applied.band.width === 70 && st1.applied.band.align === "center" && st1.applied.text.lines[0]?.text === "Deniz Ofis" && st1.applied.bg.photoAssetId === photo, st1.applied);
        await home(p);
        g = await geo(p);
        ok("S", "yenileme sonrası gizli korunur (karşılama yok, modüller üstte)", !g.hero && g.off && !!g.mods && !!g.content && near(g.mods[1], g.content[1], 1), g);
        await p.screenshot({ path: join(OUT, "uygulandi-gizli-1440.png"), clip: { x: 0, y: 0, width: 1440, height: 700 } });
        // Yeniden göster → ayarlar aynen döner
        await studio(p);
        await show.check();
        await p.waitForTimeout(400);
        g = await geo(p);
        ok("S", "yeniden göster: önceki %70 orta + metin + fotoğraf aynen geri geldi", g.bandW === "70" && g.bandA === "center" && (await slider.inputValue()) === "70" && !!(await p.locator('section[data-pw-hero] img').count()), g);
        await drawer(p).getByRole("button", { name: "Uygula", exact: true }).click();
        if (await sync.isVisible().catch(() => false)) await sync.click();
        await p.waitForSelector('[role="dialog"][aria-labelledby="studio-title"]', { state: "detached", timeout: 20000 });
        // Geçmiş: gizli tasarıma dön
        await studio(p);
        await drawer(p).getByRole("tab", { name: /Kayıtlar|Kayıtlı/ }).click();
        const hist = (await state()).design.history;
        ok("S", "Geçmiş: önceki (gizli) tasarım listede", hist[0]?.design.band?.visible === false, hist.map((h) => h.design.band));
        await drawer(p).getByRole("button", { name: "Bu tasarıma dön" }).first().click();
        await p.getByRole("alertdialog").getByRole("button", { name: "Evet, bu tasarıma dön" }).click();
        await p.waitForSelector('[role="dialog"][aria-labelledby="studio-title"]', { state: "detached", timeout: 20000 }).catch(() => null);
        await home(p);
        g = await geo(p);
        ok("S", "Geçmişten geri dönüş: gizli tasarım geri geldi", !g.hero && g.off && (await state()).design.applied?.band?.visible === false, g);
        // Sıfırla → varsayılan görünüm (karşılama görünür, tam genişlik)
        await studio(p);
        await drawer(p).getByRole("tab", { name: /Kayıtlar|Kayıtlı/ }).click();
        await drawer(p).getByTestId("studio-reset-design").click();
        await p.getByRole("alertdialog").getByRole("button", { name: "Evet, sıfırla" }).click();
        await p.waitForSelector('[role="dialog"][aria-labelledby="studio-title"]', { state: "detached", timeout: 20000 }).catch(() => null);
        await home(p);
        g = await geo(p);
        ok("S", "Sıfırla: varsayılan görünüm (karşılama görünür, tam genişlik, yeni öznitelik yok)", (await state()).design.applied === null && !!g.hero && !g.anyBandAttr && !g.off && !!g.content && near(g.hero[2], g.content[2]), g);
        // Varsayılana dön düğmesi: band tasarımdan kaldırılır (eski kayıtla birebir)
        await studio(p);
        await slider.focus();
        await p.keyboard.press("ArrowLeft");
        ok("S", "ayar değişince “varsayılana döndür” görünür", await band().getByTestId("studio-band-reset").isVisible());
        await band().getByTestId("studio-band-reset").click();
        await p.waitForTimeout(300);
        ok("S", "“varsayılana döndür” → %100, düğme kalkar, önizleme tam genişlik", (await slider.inputValue()) === "100" && !(await band().getByTestId("studio-band-reset").isVisible().catch(() => false)) && !(await geo(p)).anyBandAttr);
        await p.keyboard.press("ArrowRight");
        await slider.focus();
        for (let i = 0; i < 20; i++) await p.keyboard.press("ArrowLeft");
        ok("S", "en dar ölçü %60'ta durur (alt sınır)", (await slider.inputValue()) === "60");
        for (let i = 0; i < 20; i++) await p.keyboard.press("ArrowRight");
        ok("S", "en geniş ölçü %100'de durur (üst sınır) ve ayar kendiliğinden varsayılana döner", (await slider.inputValue()) === "100" && !(await geo(p)).anyBandAttr);
        ok("S", "panel akışında sayfa hatası yok", c.errors.length === 0, c.errors);
      } finally { await c.ctx.close(); }
    }

    // ── L: logo konumları ──
    {
      // L1: karşılama içindeki (eski "hero" bölgesi) logo → gizlerken açıklama
      const m1 = createWorkspaceMock({ enabled: true });
      const lg1 = await m1.seedAsset("logo", logoBytes, "logo.png", "image/png");
      m1.seed({ applied: design({ layout: "A", logo: { assetId: lg1, plate: "cam", layout: { desktop: { zone: "hero", x: 0.92, y: 0.18, w: 0.16 }, mobile: { zone: "hero", x: 0.85, y: 0.15, w: 0.3 } } } }) });
      const c1 = await open(m1, { width: 1440, height: 900 });
      try {
        await studio(c1.page);
        await drawer(c1.page).locator('[data-testid="studio-band"]').getByRole("checkbox", { name: "Karşılama alanını göster" }).uncheck();
        await c1.page.waitForTimeout(300);
        const note = drawer(c1.page).getByTestId("studio-band-logo-note");
        ok("L", "karşılama içindeki logo: gizlerken “logo da görünmez” açıklaması", (await note.isVisible()) && /içinde yerleşik/.test(await note.innerText()));
        ok("L", "karşılama içindeki logo: gizliyken logo görünmez (alanla birlikte)", (await c1.page.locator('[data-pw-zone="hero"]').count()) === 0);
        await drawer(c1.page).locator('[data-testid="studio-band"]').scrollIntoViewIfNeeded();
        await c1.page.screenshot({ path: join(OUT, "logo-karsilama-ici-gizli-1440.png") });
      } finally { await c1.ctx.close(); }
      // L2: sayfadaki serbest logo karşılamanın üzerinde → gizlenince boş yere kayar, açılınca eski yerine döner
      for (const vp of [{ w: 1440, h: 900, tag: "1440" }, { w: 1280, h: 800, tag: "1280" }]) {
        const m2 = createWorkspaceMock({ enabled: true });
        const lg2 = await m2.seedAsset("logo", logoBytes, "logo.png", "image/png");
        m2.seed({ applied: design({ layout: "A", logo: { assetId: lg2, plate: "cam" } }) });
        const c2 = await open(m2, { width: vp.w, height: vp.h });
        try {
          await home(c2.page);
          await c2.page.waitForSelector('[data-pw-free-logo="page"] > *', { timeout: 30000 });
          const g0 = await geo(c2.page);
          ok("L", `${vp.tag}: serbest logo başlangıçta karşılamanın üzerinde`, !!g0.logo && !!g0.hero && hit(g0.logo, g0.hero), g0);
          await studio(c2.page);
          await drawer(c2.page).locator('[data-testid="studio-band"]').getByRole("checkbox", { name: "Karşılama alanını göster" }).uncheck();
          await c2.page.waitForTimeout(900);
          const g1 = await geo(c2.page);
          const note = drawer(c2.page).getByTestId("studio-band-logo-note");
          ok("L", `${vp.tag}: gizlerken “en yakın boş yerde gösterilir” açıklaması`, (await note.isVisible()) && /en yakın boş yerde/.test(await note.innerText()));
          ok("L", `${vp.tag}: gizliyken serbest logo modül kartlarına / başlığa binmez`, !g1.logo || g1.cards.every((r) => !r || !hit(g1.logo!, r)), { logo: g1.logo });
          await c2.page.screenshot({ path: join(OUT, `logo-serbest-gizli-${vp.tag}.png`) });
          await drawer(c2.page).locator('[data-testid="studio-band"]').getByRole("checkbox", { name: "Karşılama alanını göster" }).check();
          await c2.page.waitForTimeout(900);
          const g2 = await geo(c2.page);
          ok("L", `${vp.tag}: yeniden göster → logo eski yerine döner`, !!g2.logo && !!g0.logo && near(g2.logo[0], g0.logo[0], 2) && near(g2.logo[1], g0.logo[1], 2), { once: g0.logo, sonra: g2.logo });
          const saved = (await m2.handle("GET", "/api/settings/workspace/design", new URLSearchParams(), null)).json as { design: { applied: WorkspaceDesign } };
          ok("L", `${vp.tag}: logonun kayıtlı konumu değişmedi`, JSON.stringify(saved.design.applied.logo.layout.desktop) === JSON.stringify(design({ layout: "A" }).logo.layout.desktop));
        } finally { await c2.ctx.close(); }
      }
      // L3: dar karşılama + serbest logo: logo karşılama metnine binmez, yatay taşma yok
      const m3 = createWorkspaceMock({ enabled: true });
      const lg3 = await m3.seedAsset("logo", logoBytes, "logo.png", "image/png");
      m3.seed({ applied: design({ layout: "A", logo: { assetId: lg3, plate: "cam" }, band: { visible: true, width: 60, align: "left" } }) });
      const c3 = await open(m3, { width: 1440, height: 900 });
      try {
        await home(c3.page);
        await c3.page.waitForSelector('[data-pw-free-logo="page"] > *', { timeout: 30000 });
        const g = await geo(c3.page);
        const txt = await c3.page.locator('[data-pw-obstacle="hero-text"]').boundingBox();
        ok("L", "dar karşılama (%60) + serbest logo: logo metne binmez, taşma yok", !!g.logo && !!txt && !hit(g.logo, [txt.x, txt.y, txt.width, txt.height]) && !g.hscroll, { logo: g.logo, txt });
        await c3.page.screenshot({ path: join(OUT, "logo-serbest-dar-60-1440.png"), clip: { x: 0, y: 0, width: 1440, height: 700 } });
      } finally { await c3.ctx.close(); }
    }

    // ── M: mobilde düzenleme (390, Android WebView) ──
    {
      const mock = createWorkspaceMock({ enabled: true });
      mock.seed({ applied: design({ layout: "C", bg: { mode: "theme", theme: "lavanta" } }) });
      const c = await open(mock, { width: 390, height: 844 }, ANDROID_WV_UA);
      const p = c.page;
      try {
        await studio(p);
        const band = drawer(p).locator('[data-testid="studio-band"]');
        await band.scrollIntoViewIfNeeded();
        const slider = band.getByRole("slider", { name: "Genişlik" });
        await slider.focus();
        for (let i = 0; i < 8; i++) await p.keyboard.press("ArrowLeft");
        await p.waitForTimeout(300);
        let g = await geo(p);
        ok("M", "390: %60 seçilse de mobilde karşılama tam genişlik, açıklama gösterilir, taşma yok",
          (await slider.inputValue()) === "60" && !!g.hero && !!g.content && near(g.hero[2], g.content[2]) && !g.hscroll && /otomatik|kendiliğinden/.test(await band.innerText()), g);
        await p.screenshot({ path: join(OUT, "mobil-panel-60-390.png") });
        await band.getByRole("checkbox", { name: "Karşılama alanını göster" }).uncheck();
        await p.waitForTimeout(300);
        await p.screenshot({ path: join(OUT, "mobil-panel-gizli-390.png") });
        await drawer(p).getByRole("button", { name: "Uygula", exact: true }).click();
        const sync = p.getByRole("button", { name: "Hayır, mobil tasarımım ayrı kalsın" });
        if (await sync.isVisible().catch(() => false)) await sync.click();
        await p.waitForSelector('[role="dialog"][aria-labelledby="studio-title"]', { state: "detached", timeout: 20000 });
        await home(p);
        g = await geo(p);
        ok("M", "390: gizli uygulandı, yenilemede korunur, modüller üstte, taşma yok", !g.hero && g.off && !!g.mods && !!g.content && near(g.mods[1], g.content[1], 1) && !g.hscroll, g);
        await p.screenshot({ path: join(OUT, "mobil-uygulandi-gizli-390.png") });
        ok("M", "mobil akışta sayfa hatası yok", c.errors.length === 0, c.errors);
      } finally { await c.ctx.close(); }
    }
  } finally {
    writeFileSync(join(OUT, "olcum.json"), JSON.stringify(results, null, 1));
    await browser.close();
  }
  console.log(`\nui-band harness: ${pass} PASS / ${fail} FAIL`);
  if (fails.length) console.log(fails.join("\n"));
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
