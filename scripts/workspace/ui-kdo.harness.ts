/**
 * KİŞİSEL DİJİTAL OFİS — KDO-01…06 uçtan uca doğrulama (Playwright, yerel sunucu, ağ-mock).
 *
 * Prod'a / dış ağa temas YOK: /api/settings/workspace/* → ui-personal-backend.ts (gerçek şema, durum geçişi, kontrast kapısı,
 * görsel hattı; veriler bellekte); diğer /api/* sentetik ZZ verisi; 127.0.0.1 dışı abort. CI listesinde DEĞİL.
 *   UI_BASE=http://127.0.0.1:3972 [UI_OUT=<kanıt klasörü>] [UI_ONCE=<önce görüntüleri>] npx tsx scripts/workspace/ui-kdo.harness.ts
 * Bölümler:
 *   K  KDO-01 kontrast: karşılama metni ↔ GERÇEK piksel zemini (metin gizlenerek ölçülür), gündüz / gece / odak, A/B/C,
 *      tema, marka, fotoğraf, yazı zemini, tasarımsız hesap; ölçülemeyen öğe PASS sayılmaz.
 *   B  KDO-02 A/B/C ayrımı (+ A ve C eski görünümle piksel aynı).
 *   H  KDO-03 satır başına hiza (bağımsızlık, eski kayıt, 320/375/390/1440, taşma yok).
 *   Z  KDO-04 yazı alanı zemini (canlı önizleme, Uygula sonrası kalıcı, varsayılan renk değişmez).
 *   L  KDO-05 Serbest Yerleştir (sürükle-bırak, geçersiz bırakma, sol menü, yenileme, klavye, panel, dokunmatik, eski kayıt,
 *      mobil eşitleme, korunan alanlar).
 *   R  KDO-06 Okuma kaldırma (seçici, panel, eski kayıt → Otomatik, diğer tercihler korunur).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createWorkspaceMock, type WorkspaceMock } from "./ui-personal-backend";
import { parseDesign, type UiPrefs, type WorkspaceDesign } from "../../lib/workspace/schema";
import { adaptPlacementToMobile } from "../../lib/workspace/mobileAdapt";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3972";
const OUT = process.env.UI_OUT ?? "";
const ONCE = process.env.UI_ONCE ?? "";
const SAMPLES = process.env.UI_SAMPLES ?? "C:/YasamSistemi-Gorsel-Tasarim/kisisel-calisma-alani-p0-son-kabul/assets/ornek";
const FIXED_TIME = new Date("2026-11-02T09:30:00+03:00");
const ANDROID_WV_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36";
const FREEZE_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}";
const ALL = ["clients", "appointments", "numerology", "stones", "stok", "sifa_rehberi", "energy_body", "reflexology",
  "aromatherapy", "personal_archive", "belge_ceviri", "human_design", "digital_content", "cosmic_calendar", "cupping",
  "beslenme", "yasam_hafizasi", "astrology"];
const makeUser = (role: "admin" | "expert", demo = false) => ({
  id: role === "admin" ? "00000000-0000-4000-8000-0000000000ad" : "00000000-0000-4000-8000-0000000000e1",
  email: `zz-${role}@example.invalid`, full_name: `ZZ ${role}`, name: "Deniz", role, active: true, approval_status: "approved",
  package_type: "premium", membership_status: "active", tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a", is_demo_account: demo,
  module_permissions: Object.fromEntries(ALL.map((k) => [k, true])),
});
const EXPERT = makeUser("expert");

let pass = 0, fail = 0;
const fails: string[] = [];
function ok(group: string, name: string, cond: boolean, detail: unknown = "") {
  if (cond) pass++; else { fail++; fails.push(`[${group}] ${name}`); }
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail !== "" ? `  → ${String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)}` : ""}`);
}
const design = (v: unknown): WorkspaceDesign => { const r = parseDesign(v, { allowAssets: true }); if (!r.ok) throw new Error(`${r.error} ${r.path}`); return r.value; };

let browser: Browser;
type Ctx = { ctx: BrowserContext; page: Page; errors: string[] };
async function open(mock: WorkspaceMock, vp = { width: 1440, height: 900 }, o: { ua?: string; user?: ReturnType<typeof makeUser> } = {}): Promise<Ctx> {
  const user = o.user ?? EXPERT;
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 768, isMobile: Boolean(o.ua), userAgent: o.ua, deviceScaleFactor: 1, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: "2026-11-01T00:00:00.000Z" }));
    } catch { /* */ }
  }, user);
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
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: user } });
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
  await page.waitForTimeout(800);
}
async function home(page: Page) {
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForSelector('[data-testid="home-hub-grid"] h3', { timeout: 180000 });
  await page.waitForSelector('[data-testid="home-view-mode"]', { timeout: 60000 });
  await settle(page);
}
async function studio(page: Page) {
  await page.goto(BASE + "/?calisma-alanim=1", { waitUntil: "load" });
  await page.waitForSelector('[role="dialog"][aria-labelledby="studio-title"]', { timeout: 180000 });
  await settle(page);
}
const dlg = (page: Page) => page.locator('[role="dialog"][aria-labelledby="studio-title"]');
async function tab(page: Page, name: RegExp) { await dlg(page).getByRole("tab", { name }).click(); await page.waitForTimeout(250); }
async function waitFor(cond: () => boolean | Promise<boolean>, ms = 15000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 150)); }
  return false;
}
async function shot(page: Page, name: string) { if (OUT) await page.screenshot({ path: join(OUT, `${name}.png`) }); }
async function applyFromStudio(page: Page, mobileAnswer: "Evet" | "Hayır" | null = "Hayır") {
  await dlg(page).locator("button", { hasText: /^Uygula$/ }).last().click();
  if (mobileAnswer) {
    const md = page.locator('[role="alertdialog"]');
    if (await md.isVisible({ timeout: 1500 }).catch(() => false)) {
      await md.locator("button", { hasText: mobileAnswer === "Evet" ? /Evet/ : /Hayır/ }).first().click();
    }
  }
  await waitFor(async () => !(await dlg(page).isVisible().catch(() => false)), 15000);
  await page.waitForTimeout(400);
}

// ── Piksel kontrast ölçümü: metni gizle → aynı kutunun zemin pikselleri → her pikselde oran → %10'luk alt değer ──
const TEXT_PROBE_JS = `(() => {
  var hero = document.querySelector('section[aria-labelledby="home-hero-title"]');
  if (!hero) return [];
  var els = Array.from(hero.querySelectorAll('p, h1, h1 > span')).filter(function (e) {
    var r = e.getBoundingClientRect(); var cs = getComputedStyle(e);
    return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && (e.textContent || '').trim() !== '' && !e.closest('[data-pw-logo]') && !(e.tagName === 'H1' && e.querySelector('span'));
  });
  return els.map(function (e, i) {
    e.setAttribute('data-kdo-probe', String(i));
    var cs = getComputedStyle(e); var r = e.getBoundingClientRect();
    var grad = (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') && cs.backgroundImage !== 'none' ? cs.backgroundImage : null;
    return { i: i, text: (e.textContent || '').trim().slice(0, 28), color: cs.color, grad: grad, fill: cs.webkitTextFillColor, size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10) || 400,
      x: Math.max(0, Math.floor(r.left)), y: Math.max(0, Math.floor(r.top)), w: Math.ceil(r.width), h: Math.ceil(r.height) };
  });
})()`;
const HIDE_CSS = "[data-kdo-probe],[data-kdo-probe] *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}[data-kdo-probe][style*=background-image],[data-kdo-probe] span[style*=background-image]{background-image:none!important}";
type Rgb = [number, number, number];
const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const L = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: Rgb, b: Rgb) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const parseRgbs = (s: string): Rgb[] => [...s.matchAll(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/g)].filter((m) => m[4] === undefined || Number(m[4]) > 0.5).map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
type Measure = { text: string; fg: string; need: number; ratio: number | null; pass: boolean; note?: string };
async function measureHero(page: Page): Promise<Measure[]> {
  const items = await page.evaluate(TEXT_PROBE_JS) as { i: number; text: string; color: string; grad: string | null; fill: string; size: number; weight: number; x: number; y: number; w: number; h: number }[];
  const style = await page.addStyleTag({ content: HIDE_CSS });
  await page.waitForTimeout(120);
  const vp = page.viewportSize()!;
  const out: Measure[] = [];
  for (const it of items) {
    const fgs = it.grad ? parseRgbs(it.grad) : parseRgbs(it.color);
    const large = it.size >= 24 || (it.size >= 18.66 && it.weight >= 700);
    const need = large ? 3 : 4.5;
    if (!fgs.length) { out.push({ text: it.text, fg: it.grad ?? it.color, need, ratio: null, pass: false, note: "ölçülemedi (renk okunamadı)" }); continue; }
    const w = Math.min(it.w, vp.width - it.x), h = Math.min(it.h, vp.height - it.y);
    if (w < 2 || h < 2) { out.push({ text: it.text, fg: String(fgs[0]), need, ratio: null, pass: false, note: "ölçülemedi (ekran dışı)" }); continue; }
    const png = await page.screenshot({ clip: { x: it.x, y: it.y, width: w, height: h } });
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const rs: number[] = [];
    for (let p = 0; p < info.width * info.height; p += 1) {
      const px: Rgb = [data[p * 3], data[p * 3 + 1], data[p * 3 + 2]];
      rs.push(Math.min(...fgs.map((f) => ratio(f, px))));
    }
    rs.sort((a, b) => a - b);
    const r10 = rs[Math.floor(rs.length * 0.1)];
    out.push({ text: it.text, fg: fgs.map((f) => `rgb(${f.join(",")})`).join("→"), need, ratio: Math.round(r10 * 100) / 100, pass: r10 >= need });
  }
  await style.evaluate((n) => (n as HTMLElement).remove());
  await page.evaluate(() => document.querySelectorAll("[data-kdo-probe]").forEach((e) => e.removeAttribute("data-kdo-probe")));
  return out;
}

const GEOMETRY_JS = `(() => {
  var r = function (el) { return el ? el.getBoundingClientRect() : null; };
  var inter = function (a, b) { return !!a && !!b && a.width > 0 && b.width > 0 && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1; };
  var logo = r(document.querySelector('[data-pw-free-logo] [role="img"]') || document.querySelector('[data-pw-zone][data-used] [role="img"]'));
  var protectedEls = Array.from(document.querySelectorAll('[data-testid="home-brand-logo"], [data-pw-obstacle], [data-testid="home-hub-grid"] > *, [data-pw-part="content"] > aside > section, button, a[href], h1, h2')).filter(function (e) { return !e.closest('[data-pw-free-logo]') && !e.closest('[role="dialog"]'); });
  var hits = protectedEls.filter(function (e) { return inter(logo, e.getBoundingClientRect()); }).map(function (e) { return (e.getAttribute('data-testid') || e.tagName) + ':' + (e.textContent || '').trim().slice(0, 20); });
  var main = r(document.querySelector('[data-pw-free="page"]'));
  var side = r(document.querySelector('[data-pw-free="side"]'));
  var inMain = !!logo && !!main && logo.left >= main.left - 0.5 && logo.right <= main.right + 0.5 && logo.top >= main.top - 0.5 && logo.bottom <= main.bottom + 0.5;
  var inSide = !!logo && !!side && logo.left >= side.left - 0.5 && logo.right <= side.right + 0.5 && logo.top >= side.top - 0.5 && logo.bottom <= side.bottom + 0.5;
  return { logo: logo ? [logo.left, logo.top, logo.width, logo.height] : null, hits: hits, hscroll: document.documentElement.scrollWidth > window.innerWidth + 1, inMain: inMain, inSide: inSide };
})()`;
type Geo = { logo: number[] | null; hits: string[]; hscroll: boolean; inMain: boolean; inSide: boolean };
const geometry = (page: Page) => page.evaluate(GEOMETRY_JS) as Promise<Geo>;

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 14) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await page.waitForTimeout(80);
}
const center = (b: number[]) => ({ x: b[0] + b[2] / 2, y: b[1] + b[3] / 2 });
const sameBox = (a: number[] | null, b: number[] | null, tol = 1.5) => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) <= tol);

async function strongDiff(a: Buffer, b: Buffer): Promise<{ strong: number; total: number }> {
  const A = await sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (A.info.width !== B.info.width || A.info.height !== B.info.height) return { strong: -1, total: 0 };
  let strong = 0;
  for (let i = 0; i < A.data.length; i += 3) if (Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2])) > 16) strong++;
  return { strong, total: A.info.width * A.info.height };
}

const logoBytes = () => readFileSync(join(SAMPLES, "logo-bedenin-frekansi-yatay.png"));
const photoBytes = () => readFileSync(join(SAMPLES, "temsili-aile-fotografi.jpg"));

// ── K) KDO-01 kontrast ──────────────────────────────────────────────────────
async function testContrast() {
  const table: unknown[] = [];
  const info: unknown[] = [];
  const brand = { accent: "#6d28d9", soft: "#f3eefe", ink: "#1e1638", accent2: "#a78bfa", name: "Frekans" };
  const lines = [
    { id: "l1", role: "label", text: "Hoş geldiniz" }, { id: "l2", role: "title", text: "Bedenin Frekansı", size: 44 },
    { id: "l3", role: "quote", text: "Her beden kendi frekansında iyileşir.", color: "brand" }, { id: "l4", role: "body", text: "Bütünsel danışmanlık merkezi." },
  ];
  type Sc = { name: string; applied: unknown | null; photo?: boolean };
  const scenes: Sc[] = [
    { name: "tasarımsız (ilk günkü)", applied: null },
    { name: "A varsayılan", applied: { layout: "A" } },
    { name: "B varsayılan", applied: { layout: "B" } },
    { name: "C varsayılan", applied: { layout: "C" } },
    { name: "A markalı serbest satırlar", applied: { layout: "A", brand, text: { useGreeting: false, lines } } },
    { name: "B markalı serbest satırlar", applied: { layout: "B", brand, text: { useGreeting: false, lines } } },
    { name: "C markalı serbest satırlar", applied: { layout: "C", brand, text: { useGreeting: false, lines } } },
    { name: "A lavanta tema", applied: { layout: "A", bg: { mode: "theme", theme: "lavanta" } } },
    { name: "B gece tema", applied: { layout: "B", bg: { mode: "theme", theme: "gece" } } },
    { name: "C marka tema", applied: { layout: "C", brand, bg: { mode: "theme", theme: "marka" } } },
    { name: "A yazı zemini koyu", applied: { layout: "A", text: { surface: "#1f1a33" } } },
    { name: "C yazı zemini adaçayı", applied: { layout: "C", text: { surface: "#eef5ee", useGreeting: false, lines } , brand } },
    { name: "A fotoğraf + yazı zemini", applied: "photoSurface", photo: true },
    { name: "A fotoğraf (zemin yok → piksel kapısı)", applied: "photo", photo: true },
  ];
  const vps = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
  for (const sc of scenes) for (const mode of ["day", "night", "focus"] as const) for (const vp of vps) {
    if (vp.width === 390 && mode === "focus") continue;
    const mock = createWorkspaceMock({ enabled: true });
    let applied: WorkspaceDesign | null = null;
    if (sc.photo) {
      const ph = await mock.seedAsset("photo", photoBytes(), "p.jpg", "image/jpeg");
      applied = design({ layout: "A", bg: { mode: "photo", photoAssetId: ph, tone: "light" }, text: sc.applied === "photoSurface" ? { surface: "#fffdf8" } : {} });
    } else if (sc.applied) applied = design(sc.applied);
    mock.seed({ applied, prefs: { viewMode: mode } as Partial<UiPrefs> });
    const c = await open(mock, vp);
    try {
      await home(c.page);
      await c.page.waitForTimeout(sc.photo ? 1800 : 300);
      const m = await measureHero(c.page);
      const bad = m.filter((x) => !x.pass);
      const label = `${sc.name} · ${mode} · ${vp.width}`;
      table.push({ scene: sc.name, mode, width: vp.width, rows: m });
      const ro = await c.page.locator("[data-pw-readability]").getAttribute("data-pw-readability").catch(() => null);
      if (!sc.applied && mode === "day") {
        // Kapsam dışı (P3, Owner onaylı ilk günkü ekran HomeHero — bu işte DEĞİŞMEDİ): yalnız bilgi olarak kaydedilir.
        info.push({ label, bad });
        ok("K", `${label}: P3 ilk günkü ekran gündüz birebir korunur (HomeHero çizildi; ölçüm bilgi olarak raporda)`, (await c.page.locator('[data-testid="home-hero-glow"]').count()) === 1);
      } else if (sc.applied === "photo") {
        // Fotoğrafta tarayıcı piksel kapısı: ölçüldüyse "ok" + gerçek oran ≥ eşik; ölçülemiyorsa PASS gösterilmez.
        ok("K", `${label}: piksel ölçümü AA veya kapı açıkça "yetersiz/ölçülemedi"`, bad.length === 0 || ro !== "ok", { ro, bad: bad.slice(0, 3) });
      } else {
        ok("K", `${label}: ${m.length} metin öğesi gerçek pikselde AA`, m.length >= 3 && bad.length === 0, bad.slice(0, 3));
      }
      if (sc.name === "tasarımsız (ilk günkü)" && vp.width === 1440) await shot(c.page, `K-tasarimsiz-${mode}`);
    } finally { await c.ctx.close(); }
  }
  if (OUT) writeFileSync(join(OUT, "K-kontrast-olcum.json"), JSON.stringify({ table, kapsamDisiBilgi: info }, null, 2));
  if (info.length) console.log("ℹ️  [K] kapsam dışı bilgi (P3 gündüz HomeHero):", JSON.stringify(info).slice(0, 400));
}

// ── B) KDO-02 A / B / C ayrımı ──────────────────────────────────────────────
async function testLayouts() {
  const shots: Record<string, Buffer> = {};
  for (const layout of ["A", "B", "C"] as const) {
    const mock = createWorkspaceMock({ enabled: true });
    mock.seed({ applied: design({ layout }) });
    const c = await open(mock);
    try {
      await home(c.page);
      shots[layout] = await c.page.screenshot();
      const info = await c.page.evaluate(`(() => { var m = document.querySelector('main'); var card = document.querySelector('[data-testid="home-hub-grid"] > * > div'); var bg = card ? getComputedStyle(card).backgroundColor : ''; return { office: m.getAttribute('data-pw-office'), page: m.getAttribute('data-pw-page'), layer: !!document.querySelector('[data-testid="home-page-bg"]'), cardBg: bg, hero: (document.querySelector('[data-pw-hero]') || {}).className || '' }; })()`) as { office: string | null; page: string | null; layer: boolean; cardBg: string; hero: string };
      if (layout === "B") ok("B", "B varsayılan: tam sayfa ofis zemini + cam kartlar + ofis cam bandı", info.office === "1" && info.page === "1" && info.layer && /rgba\(255, 255, 255, 0\.9/.test(info.cardBg), info);
      else ok("B", `${layout} varsayılan: tam sayfa ofis zemini YOK (klasik düzen)`, !info.office && !info.layer, info);
      if (ONCE && existsSync(join(ONCE, `02-${layout}-varsayilan-1440.png`)) && layout !== "B") {
        const d = await strongDiff(readFileSync(join(ONCE, `02-${layout}-varsayilan-1440.png`)), shots[layout]);
        ok("B", `${layout} varsayılan önceki kabul edilmiş görünümle piksel aynı (güçlü fark ${d.strong})`, d.strong === 0, d);
      }
      await shot(c.page, `B-${layout}-varsayilan-1440`);
    } finally { await c.ctx.close(); }
  }
  const ab = await strongDiff(shots.A, shots.B);
  ok("B", `A ↔ B varsayılan gerçekten farklı (güçlü fark %${((ab.strong / ab.total) * 100).toFixed(1)})`, ab.strong / ab.total > 0.25, ab);
  // B + tema ve fotoğrafta tam sayfa + cam davranışı korunur
  const mock = createWorkspaceMock({ enabled: true });
  const ph = await mock.seedAsset("photo", photoBytes(), "p.jpg", "image/jpeg");
  mock.seed({ applied: design({ layout: "B", bg: { mode: "photo", photoAssetId: ph, tone: "light" } }) });
  const c = await open(mock);
  try {
    await home(c.page);
    const info = await c.page.evaluate(`(() => { var m = document.querySelector('main'); return { office: m.getAttribute('data-pw-office'), photopage: m.getAttribute('data-pw-photopage'), page: m.getAttribute('data-pw-page') }; })()`) as Record<string, string | null>;
    ok("B", "B + fotoğraf: tam sayfa fotoğraf + cam kart (P4 davranışı korunur; ofis duvarı devre dışı)", info.page === "1" && info.photopage === "1" && !info.office, info);
  } finally { await c.ctx.close(); }
  for (const w of [320, 375, 390]) {
    const m2 = createWorkspaceMock({ enabled: true });
    m2.seed({ applied: design({ layout: "B" }) });
    const c2 = await open(m2, { width: w, height: 800 });
    try {
      await home(c2.page);
      const g = await geometry(c2.page);
      ok("B", `B varsayılan ${w} px: yatay kaydırma yok`, !g.hscroll);
      if (w === 390) await shot(c2.page, "B-B-varsayilan-390");
    } finally { await c2.ctx.close(); }
  }
}

// ── H) KDO-03 satır başına hiza ─────────────────────────────────────────────
const ALIGN_JS = `(() => {
  var t = document.querySelector('[data-pw-obstacle="hero-text"]'); var tr = t.getBoundingClientRect();
  return Array.from(t.querySelectorAll('[data-pw-line-align]')).map(function (e) {
    var rg = document.createRange(); rg.selectNodeContents(e); var rr = rg.getBoundingClientRect(); var er = e.getBoundingClientRect();
    return { a: e.getAttribute('data-pw-line-align'), ta: getComputedStyle(e).textAlign, l: rr.left - er.left, r: er.right - rr.right, inT: rr.left >= tr.left - 1 && rr.right <= tr.right + 1 };
  });
})()`;
async function testAlign() {
  const lines3 = [{ id: "a", role: "title", text: "Bioasera", size: 40 }, { id: "b", role: "subtitle", text: "Kendini Keşfet" }, { id: "c", role: "body", text: "Bütünsel danışmanlık" }];
  // Eski kayıt (satırlarda align yok) → ortak hizayla birebir
  for (const layout of ["A", "B", "C"] as const) {
    const mock = createWorkspaceMock({ enabled: true });
    mock.seed({ applied: design({ layout, text: { useGreeting: false, align: "center", lines: lines3 } }) });
    const c = await open(mock);
    try {
      await home(c.page);
      const a = await c.page.evaluate(ALIGN_JS) as { a: string; ta: string }[];
      ok("H", `${layout} eski kayıt: hizası olmayan satırlar ortak hizayla (orta)`, a.length === 3 && a.every((x) => x.a === "center" && x.ta === "center"), a);
    } finally { await c.ctx.close(); }
  }
  // Studio: satır 2'yi Sağ yap → yalnız o satır değişir; ortak hiza değişince satırlar değişmez
  const mock = createWorkspaceMock({ enabled: true });
  mock.seed({ applied: design({ layout: "A", text: { useGreeting: false, align: "left", lines: lines3 } }) });
  const c = await open(mock);
  try {
    await studio(c.page);
    const before = await c.page.evaluate(ALIGN_JS) as { a: string }[];
    await dlg(c.page).getByRole("radiogroup", { name: /Satır hizası 2/ }).getByRole("radio", { name: "Sağ" }).click();
    await c.page.waitForTimeout(300);
    const after = await c.page.evaluate(ALIGN_JS) as { a: string; ta: string; r: number }[];
    ok("H", "satır 2 → Sağ: yalnız satır 2 değişti (canlı önizleme)", before.map((x) => x.a).join() === "left,left,left" && after.map((x) => x.a).join() === "left,right,left" && after[1].ta === "right", { before, after });
    await dlg(c.page).getByRole("radiogroup", { name: /Satır hizası 1/ }).getByRole("radio", { name: "Orta" }).click();
    await dlg(c.page).getByRole("radiogroup", { name: /Ortak yatay hiza/ }).getByRole("radio", { name: "Sağ" }).click();
    await c.page.waitForTimeout(300);
    const after2 = await c.page.evaluate(ALIGN_JS) as { a: string; inT: boolean; r: number; l: number }[];
    ok("H", "ortak hiza değişince satırların kendi hizası korunur (orta, sağ, sol)", after2.map((x) => x.a).join() === "center,right,left", after2);
    ok("H", "sağ satır sağa, orta satır ortaya gerçekten yaslı; hepsi metin alanı içinde", after2[1].r < 2 && Math.abs(after2[0].l - after2[0].r) < 3 && after2.every((x) => x.inT), after2);
    await shot(c.page, "H-satir-hizasi-studio");
    await applyFromStudio(c.page);
    const saved = (mock.raw.applied as WorkspaceDesign | null)?.text.lines.map((l) => l.align).join();
    ok("H", "Uygula → kayıtta satır hizaları (center,right,left)", saved === "center,right,left", saved);
    for (const w of [320, 375, 390, 1440]) {
      await c.page.setViewportSize({ width: w, height: 820 });
      await c.page.goto(BASE + "/", { waitUntil: "load" });
      await c.page.waitForSelector('[data-testid="home-hub-grid"] h3', { timeout: 120000 });
      await settle(c.page);
      const a = await c.page.evaluate(ALIGN_JS) as { a: string; inT: boolean }[];
      const g = await geometry(c.page);
      ok("H", `${w} px: hizalar korunur, satırlar metin alanında, yatay kaydırma yok`, a.map((x) => x.a).join() === "center,right,left" && a.every((x) => x.inT) && !g.hscroll, { a, h: g.hscroll });
      if (w === 390 || w === 1440) await shot(c.page, `H-satir-hizasi-${w}`);
    }
  } finally { await c.ctx.close(); }
}

// ── Z) KDO-04 yazı alanı zemini ─────────────────────────────────────────────
async function testSurface() {
  for (const layout of ["C", "A", "B"] as const) {
    const mock = createWorkspaceMock({ enabled: true });
    mock.seed({ applied: design({ layout, brand: { accent: "#6d28d9", soft: "#f3eefe", ink: "#1e1638", accent2: "#a78bfa" } }) });
    const c = await open(mock);
    try {
      await studio(c.page);
      const sel = layout === "C" ? '[data-pw-hero] [class*="plaque"]' : '[data-pw-obstacle="hero-text"]';
      const bg0 = await c.page.locator(sel).first().evaluate((e) => getComputedStyle(e).backgroundColor);
      // Marka "zemin tonu" değişince yazı zemini DEĞİŞMEZ (ayrı kontrol)
      await dlg(c.page).locator('input[type="color"]').nth(1).evaluate((el: HTMLInputElement) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; set.call(el, "#e8f3ec"); el.dispatchEvent(new Event("input", { bubbles: true })); });
      await c.page.waitForTimeout(250);
      const bgBrand = await c.page.locator(sel).first().evaluate((e) => getComputedStyle(e).backgroundColor);
      ok("Z", `${layout}: marka zemin tonu değişince yazı alanı zemini aynı kalır (açık isimli ayrı kontrol)`, bg0 === bgBrand, { bg0, bgBrand });
      await dlg(c.page).getByRole("radiogroup", { name: "Karşılama yazı alanı zemini" }).getByRole("radio", { name: /#1f1a33/ }).click();
      await c.page.waitForTimeout(300);
      const bg1 = await c.page.locator(sel).first().evaluate((e) => getComputedStyle(e).backgroundColor);
      ok("Z", `${layout}: yazı alanı zemini canlı önizlemede anında (#1f1a33)`, bg1 === "rgb(31, 26, 51)", bg1);
      await c.page.locator('button[aria-label="Paneli küçült"], button[title="Paneli küçült"]').first().click().catch(() => undefined);
      const m = await measureHero(c.page);
      ok("Z", `${layout}: koyu yazı zemininde metin pikselde AA (${m.length} öğe)`, m.length >= 3 && m.every((x) => x.pass), m.filter((x) => !x.pass));
      await shot(c.page, `Z-yazi-zemini-${layout}`);
      await studio(c.page).catch(() => undefined);
      if (!(await dlg(c.page).isVisible().catch(() => false))) await studio(c.page);
      await dlg(c.page).getByRole("radiogroup", { name: "Karşılama yazı alanı zemini" }).getByRole("radio", { name: /#1f1a33/ }).click();
      await applyFromStudio(c.page);
      ok("Z", `${layout}: Uygula → kayıtta text.surface`, (mock.raw.applied as WorkspaceDesign | null)?.text.surface === "#1f1a33", (mock.raw.applied as WorkspaceDesign | null)?.text.surface);
      await home(c.page);
      const bg2 = await c.page.locator(sel).first().evaluate((e) => getComputedStyle(e).backgroundColor);
      ok("Z", `${layout}: yeniden yüklemede yazı zemini korunur`, bg2 === "rgb(31, 26, 51)", bg2);
    } finally { await c.ctx.close(); }
  }
  // Varsayılan renkler, kullanıcı seçmedikçe değişmez
  for (const layout of ["A", "C"] as const) {
    if (!ONCE) break;
    const mock = createWorkspaceMock({ enabled: true });
    mock.seed({ applied: design({ layout }) });
    const c = await open(mock);
    try {
      await home(c.page);
      const d = await strongDiff(readFileSync(join(ONCE, `02-${layout}-varsayilan-1440.png`)), await c.page.screenshot());
      ok("Z", `${layout}: yazı zemini seçilmeden varsayılan renkler aynı (güçlü fark ${d.strong})`, d.strong === 0, d);
    } finally { await c.ctx.close(); }
  }
}

// ── L) KDO-05 Serbest Yerleştir ─────────────────────────────────────────────
async function testLogo() {
  const mock = createWorkspaceMock({ enabled: true });
  const id = await mock.seedAsset("logo", logoBytes(), "logo.png", "image/png");
  mock.seed({ applied: design({ layout: "A", logo: { assetId: id } }) });
  const c = await open(mock);
  const p = c.page;
  try {
    await home(p);
    let g = await geometry(p);
    ok("L", "varsayılan serbest konum: logo çizildi, korunan hiçbir şeyi örtmüyor, içerik alanında", !!g.logo && g.hits.length === 0 && g.inMain && !g.hscroll, g);
    await studio(p);
    // Panelde hazır bölge seçimi YOK
    await tab(p, /Logo/);
    const zoneUi = await dlg(p).locator("text=/Karşılama bandı|Fotoğraf çerçevesi|Üst şerit|Modüller başlığı yanı|Sağ sütun üstü|Sayfa altı imza/").count();
    ok("L", "panelde hazır bölge seçimleri kaldırıldı (tek Serbest Yerleştir)", zoneUi === 0 && (await dlg(p).getByTestId("studio-free-place").count()) === 1, zoneUi);
    await shot(p, "L-studio-serbest-yerlestir");
    g = await geometry(p);
    const start = g.logo!;
    // 1) Geçerli boş alana sürükle-bırak (karşılama bandında metnin sağı, panel görünür alanı içinde)
    await drag(p, center(start), { x: center(start).x + 40, y: center(start).y + 120 });
    const ghostOk = await p.getByTestId("free-logo-ghost").getAttribute("data-valid").catch(() => null);
    await p.mouse.up();
    await p.waitForTimeout(300);
    g = await geometry(p);
    ok("L", "geçerli noktaya bırakma: canlı yeşil gösterge + logo bırakılan noktada", ghostOk === "1" && !!g.logo && Math.abs(g.logo[1] - (start[1] + 120)) < 2 && g.hits.length === 0, { ghostOk, g, start });
    const dropped = g.logo!;
    // 2) Karşılama metninin üstüne bırakma → reddedilir, logo son geçerli konumda
    const title = await p.locator("#home-hero-title").boundingBox();
    await drag(p, center(dropped), { x: title!.x + 60, y: title!.y + title!.height / 2 });
    const ghostBad = await p.getByTestId("free-logo-ghost").getAttribute("data-valid").catch(() => null);
    await shot(p, "L-gecersiz-birakma-gostergesi");
    await p.mouse.up();
    await p.waitForTimeout(300);
    g = await geometry(p);
    const notice = await p.getByTestId("free-logo-notice").textContent().catch(() => "");
    ok("L", "karşılama metnine bırakma: kırmızı gösterge, uyarı, logo son geçerli konumda", ghostBad === "0" && /bırakılamaz/.test(notice ?? "") && sameBox(g.logo, dropped), { ghostBad, notice, g: g.logo, dropped });
    // 3) Yaşam Sistemi logosuna / adına bırakma → reddedilir
    const brand = await p.getByTestId("home-brand-logo").boundingBox();
    await drag(p, center(dropped), { x: brand!.x + brand!.width / 2, y: brand!.y + brand!.height / 2 });
    await p.mouse.up();
    await p.waitForTimeout(300);
    g = await geometry(p);
    ok("L", "Yaşam Sistemi logosu / kurumsal alan üzerine bırakma reddedilir", sameBox(g.logo, dropped), g.logo);
    // 4) Modül kartına bırakma → reddedilir
    const card = await p.locator('[data-testid="home-hub-grid"] > *').first().boundingBox();
    await drag(p, center(dropped), { x: card!.x + card!.width / 2, y: card!.y + card!.height / 2 });
    await p.mouse.up();
    await p.waitForTimeout(300);
    g = await geometry(p);
    ok("L", "modül kartının üzerine bırakma reddedilir", sameBox(g.logo, dropped), g.logo);
    // 5) Klavye: ok tuşu 8 px, Shift 40 px; + büyütür
    await p.locator('[data-pw-free-logo] [role="img"]').focus();
    await p.keyboard.press("ArrowLeft");
    await p.waitForTimeout(200);
    let g2 = await geometry(p);
    ok("L", "klavye: ← 8 px", !!g2.logo && Math.abs(g2.logo[0] - (dropped[0] - 8)) < 1.5, { g2: g2.logo, dropped });
    await p.keyboard.press("Shift+ArrowDown");
    await p.waitForTimeout(200);
    g = await geometry(p);
    ok("L", "klavye: Shift+↓ 40 px", !!g.logo && Math.abs(g.logo[1] - (g2.logo![1] + 40)) < 1.5, { g: g.logo });
    // 6) Panel düğmeleri (fare olmadan)
    g2 = g;
    await dlg(p).getByRole("button", { name: "Sağa" }).click();
    await p.waitForTimeout(200);
    g = await geometry(p);
    ok("L", "panel düğmesi: Sağa 8 px", !!g.logo && Math.abs(g.logo[0] - (g2.logo![0] + 8)) < 1.5, { g: g.logo, g2: g2.logo });
    // 7) Sol menünün alt boş alanına sürükle
    const side = await p.locator('[data-pw-free="side"]').boundingBox();
    await drag(p, center(g.logo!), { x: side!.x + side!.width / 2, y: side!.y + 60 });
    await p.mouse.up();
    await p.waitForTimeout(400);
    g = await geometry(p);
    ok("L", "sol menünün alt boş alanına yerleştirme", g.inSide && g.hits.length === 0, g);
    await shot(p, "L-sol-menu-alt-alan");
    const sideBox = g.logo!;
    // 8) Uygula → yenile → konum korunur
    await applyFromStudio(p, "Hayır");
    ok("L", "Uygula → kayıtta desktop.zone = side (mobil konum Hayır ile korunur)", (mock.raw.applied as WorkspaceDesign | null)?.logo.layout.desktop.zone === "side" && (mock.raw.applied as WorkspaceDesign | null)?.logo.layout.mobile.zone === "page", (mock.raw.applied as WorkspaceDesign | null)?.logo.layout);
    await home(p);
    g = await geometry(p);
    ok("L", "yenileme / yeniden girişte konum korunur (±1,5 px)", sameBox(g.logo, sideBox) && g.inSide, { g: g.logo, sideBox });
    // Gece modunda sol menüdeki logo gizlenmez
    mock.seed({ prefs: { viewMode: "night" } as Partial<UiPrefs> });
    await home(p);
    g = await geometry(p);
    ok("L", "Gece modunda sol menü alt alanındaki logo görünür", !!g.logo && g.inSide, g.logo);
    mock.seed({ prefs: { viewMode: "auto" } as Partial<UiPrefs> });
    // 9) Masaüstünü mobile uygula: Evet
    await studio(p);
    await dlg(p).getByRole("button", { name: "Ana sayfa alanına taşı" }).click().catch(async () => { await tab(p, /Logo/); await dlg(p).getByRole("button", { name: "Ana sayfa alanına taşı" }).click(); });
    await p.waitForTimeout(400);
    g = await geometry(p);
    ok("L", "erişilebilir alternatif: 'Ana sayfa alanına taşı' çerçeve değiştirir", g.inMain && g.hits.length === 0, g);
    await applyFromStudio(p, "Evet");
    const ap = mock.raw.applied as WorkspaceDesign;
    ok("L", "Uygula + 'mobilde de uygula: Evet' → mobil konum masaüstünden güvenle uyarlanır", JSON.stringify(ap.logo.layout.mobile) === JSON.stringify(adaptPlacementToMobile(ap.logo.layout.desktop, ap)), ap.logo.layout);
  } finally { await c.ctx.close(); }

  // 10) Mobil (dokunmatik) + Android WebView: dokunarak taşıma, güvenli sınırlar
  for (const vp of [{ width: 320, height: 720 }, { width: 375, height: 812 }, { width: 390, height: 844 }]) {
    const m = createWorkspaceMock({ enabled: true });
    const lid = await m.seedAsset("logo", logoBytes(), "logo.png", "image/png");
    m.seed({ applied: design({ layout: "A", logo: { assetId: lid } }) });
    const cm = await open(m, vp, { ua: vp.width === 390 ? ANDROID_WV_UA : undefined });
    try {
      await home(cm.page);
      let gm = await geometry(cm.page);
      ok("L", `${vp.width} px${vp.width === 390 ? " (Android WebView)" : ""}: logo güvenli konumda, korunanları örtmüyor, yatay kaydırma yok`, !!gm.logo && gm.hits.length === 0 && !gm.hscroll && gm.inMain, gm);
      if (vp.width !== 390) continue;
      await shot(cm.page, "L-mobil-390-gorunum");
      await studio(cm.page);
      await cm.page.locator('button[aria-label*="küçült" i], button[title*="küçült" i]').first().click().catch(() => undefined);
      await cm.page.waitForTimeout(300);
      gm = await geometry(cm.page);
      const from = center(gm.logo!);
      const to = { x: from.x + 70, y: from.y + 230 };
      // Dokunmatik işaretçi olayları (pointerType: touch)
      await cm.page.evaluate(`(() => {
        var el = document.querySelector('[data-pw-free-logo] [role="img"]');
        var o = function (t, x, y) { return { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: t === 'pointerup' ? 0 : 1 }; };
        el.dispatchEvent(new PointerEvent('pointerdown', o('pointerdown', ${from.x}, ${from.y})));
        for (var i = 1; i <= 10; i++) window.dispatchEvent(new PointerEvent('pointermove', o('pointermove', ${from.x} + ${to.x - from.x} * i / 10, ${from.y} + ${to.y - from.y} * i / 10)));
        window.dispatchEvent(new PointerEvent('pointerup', o('pointerup', ${to.x}, ${to.y})));
      })()`);
      await cm.page.waitForTimeout(400);
      const g3 = await geometry(cm.page);
      const moved = !!g3.logo && Math.abs(g3.logo[1] - (gm.logo![1] + 230)) < 2;
      ok("L", "Android WebView: dokunarak taşıma çalışır (geçerli noktada) ya da geçersizse son konumda kalır; hiçbir durumda korunanı örtmez",
        g3.hits.length === 0 && !g3.hscroll && (moved || sameBox(g3.logo, gm.logo)), { g3, gm: gm.logo });
      await shot(cm.page, "L-mobil-390-dokunmatik");
    } finally { await cm.ctx.close(); }
  }

  // 11) Eski kayıt (hazır bölge) → ilk dokunuşta aynı noktada serbest yerleşim, sürükleme kesintisiz
  const ml = createWorkspaceMock({ enabled: true });
  const lid = await ml.seedAsset("logo", logoBytes(), "logo.png", "image/png");
  ml.seed({ applied: design({ layout: "A", logo: { assetId: lid, layout: { desktop: { zone: "hero", x: 1, y: 0.5, w: 0.2 }, mobile: { zone: "toolbar", x: 0.5, y: 0.5, w: 1 } } } }) });
  const cl = await open(ml);
  try {
    await home(cl.page);
    let gl = await geometry(cl.page);
    ok("L", "eski hazır bölge kaydı eski yerinde çizilir (bozulmaz)", !!gl.logo && (await cl.page.locator('[data-pw-zone="hero"][data-used]').count()) === 1, gl);
    await studio(cl.page);
    await tab(cl.page, /Logo/);
    ok("L", "panel eski kayıt notunu gösterir", (await dlg(cl.page).locator("text=/eski hazır bölge/").count()) === 1);
    gl = await geometry(cl.page);
    if (gl.logo && gl.logo[0] + gl.logo[2] > 1000) {
      // Logo panelin altında kalıyorsa panel küçültülür (Owner'ın da yapacağı gibi)
      await dlg(cl.page).locator('button[aria-label*="küçült" i]').first().click().catch(() => undefined);
      await cl.page.waitForTimeout(300);
      gl = await geometry(cl.page);
    }
    const from = center(gl.logo!);
    await drag(cl.page, from, { x: from.x - 60, y: from.y + 90 });
    await cl.page.mouse.up();
    await cl.page.waitForTimeout(400);
    const g4 = await geometry(cl.page);
    const placed = Math.abs(g4.logo![1] - (gl.logo![1] + 90)) < 2.5;
    ok("L", "eski kayıt: ilk sürüklemede aynı noktadan serbest yerleşime geçer ve bırakılan yerde kalır", (await cl.page.locator("[data-pw-free-logo]").count()) === 1 && g4.hits.length === 0 && (placed || sameBox(g4.logo, gl.logo, 3)), { g4: g4.logo, gl: gl.logo });
    ok("L", "eski kayıt dönüşümü aynı noktadan başlar (zıplama yok)", placed, { g4: g4.logo, gl: gl.logo });
  } finally { await cl.ctx.close(); }
}

// ── R) KDO-06 Okuma kaldırma ────────────────────────────────────────────────
async function testReading() {
  const mock = createWorkspaceMock({ enabled: true });
  mock.seed({ applied: design({ layout: "A" }), prefs: { viewMode: "reading", favorites: ["module:numerology", "module:client_journey"], hiddenModules: ["center:stok"], reading: { scale: 1.3, lineHeight: 1.9, width: 58 } } as Partial<UiPrefs> });
  const c = await open(mock);
  const p = c.page;
  try {
    await home(p);
    const root = await p.locator("main").evaluate((m) => ({ mode: m.getAttribute("data-pw-mode"), choice: m.getAttribute("data-pw-choice") }));
    const label = await p.getByTestId("home-view-mode").getAttribute("aria-label");
    ok("R", "eski 'Okuma' kaydı → Otomatik uygulanır (kök + seçici etiketi)", root.choice === "auto" && (root.mode === "day" || root.mode === "night") && /Otomatik/.test(label ?? ""), { root, label });
    await p.getByTestId("home-view-mode").click();
    const items = await p.locator('[role="menu"] [role="menuitemradio"] b').allTextContents();
    ok("R", "görünüm seçicide Okuma yok (Otomatik, Gündüz, Gece, Odak)", items.join(",") === "Otomatik,Gündüz,Gece,Odak", items);
    await shot(p, "R-gorunum-menusu");
    await p.keyboard.press("Escape");
    await studio(p);
    await tab(p, /Görünüm/);
    const txt = await dlg(p).innerText();
    ok("R", "Görünüm sekmesinde Okuma modu, yazı boyutu, satır aralığı ve Dar/Orta/Geniş yok", !/Okuma|Satır aralığı|Yazı boyutu|Dar sütun|Geniş/.test(txt), txt.slice(0, 200));
    await shot(p, "R-studio-gorunum");
    await dlg(p).getByRole("button", { name: /Gece/ }).click();
    await waitFor(() => mock.prefs.viewMode === "night", 8000);
    const pr = mock.prefs;
    ok("R", "mod değişince yeni kayıt; Favorilerim, gizlenen modüller ve eski okuma değerleri korunur",
      pr.viewMode === "night" && pr.favorites.join() === "module:numerology,module:client_journey" && pr.hiddenModules.join() === "center:stok" && pr.reading.scale === 1.3, pr);
    const css = await p.evaluate(() => [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText); } catch { return []; } }).filter((t) => t.includes('data-pw-mode="reading"')).length);
    ok("R", "Okuma modu stilleri temizlendi", css === 0, css);
  } finally { await c.ctx.close(); }
}

async function main() {
  if (OUT) mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch();
  const only = (process.env.UI_ONLY ?? "KBHZLR").split("");
  try {
    if (only.includes("K")) await testContrast();
    if (only.includes("B")) await testLayouts();
    if (only.includes("H")) await testAlign();
    if (only.includes("Z")) await testSurface();
    if (only.includes("L")) await testLogo();
    if (only.includes("R")) await testReading();
  } catch (e) {
    fail++;
    fails.push(`ÇÖKME: ${(e as Error).message.slice(0, 300)}`);
    console.log("❌ ÇÖKME", e);
  } finally {
    await browser.close();
  }
  console.log(`\nui-kdo harness: ${pass} PASS / ${fail} FAIL`);
  if (fails.length) console.log(fails.join("\n"));
  if (OUT) writeFileSync(join(OUT, "ui-kdo-sonuc.json"), JSON.stringify({ pass, fail, fails }, null, 2));
  process.exit(fail ? 1 : 0);
}
main();
