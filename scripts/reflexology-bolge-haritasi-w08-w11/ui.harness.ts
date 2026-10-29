/**
 * W08–W11 — Refleksoloji Bölge Haritası — gerçek tarayıcı UI harness (PRODUCTION'A SIFIR TEMAS).
 *
 * Yerel `next start` + Playwright; `/api/**` bellek-içi SENTETİK arka uç (tenant oturum token'ından).
 * Masaüstü 1366 (düzenleme açık):
 *   W08: Ekle → organ anında listede + seçili; arama açıkken eklenen organ görünür; uzun listede
 *        satıra kaydırılır; tekrar ekleme (farklı büyük/küçük harf) satır üretmez, mevcut organ seçilir;
 *        daha önce silinmiş (mezar taşlı) organ yeniden eklenince listeden DÜŞMEZ.
 *   W09: kaydedilmemiş çizim kırmızı / kaydedilmiş yeşil; Kaydet sonrası yeşil; kayıtlı bölge taşınınca
 *        kırmızı; depolama yazımı başarısızsa kırmızı KALIR (renk gerçek kayıt durumuna bağlı).
 *   W10: "Bölge Ekle" yok; organ seçimi sonrası hiçbir araç basılı değil, çizim denemesi bölge
 *        üretmez + "Önce alttan çizim modelini seçin"; Oval/Kare/Manuel/Kalın Çizgi/Nokta seçilince
 *        çizim doğrudan başlar; organ değişince yeniden korumalı.
 *   W11: çizim talimatı ve uyarı harita görselinin DIŞINDA (görseldeki Sağ/Sol etiketlerine binmez);
 *        Taban / Yan İç / Yan Dış / Avuç İçi / El Sırtı görünümlerinde.
 *   Koruma: Taşı/Düzenle sürükleme, Çizimi Sil, görünüm değiştirme, Kaydet → sunucu PUT, B uzmanı dokunulmaz.
 * Mobil 390 (salt okuma — mevcut ürün kuralı): düzenleme kontrolleri yok, kayıtlı bölgeler yeşil,
 *   görünüm değiştirme çalışır, dokunuş bölge üretmez, yatay taşma yok.
 *
 * Ön koşul: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54599 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-… \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-… npx next build --webpack
 * Çalıştır: npx tsx scripts/reflexology-bolge-haritasi-w08-w11/ui.harness.ts [--out <klasör>]
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page, type Route } from "playwright";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : path.join(os.tmpdir(), "reflexology-bolge-w08-w11-ui");
const PORT = 3995;
const APP = `http://127.0.0.1:${PORT}`;
const TOKEN_A = "zz-w0811-session-a-not-a-secret";
const TOKEN_B = "zz-w0811-session-b-not-a-secret";
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

type R = Record<string, unknown>;
const RED = "rgb(220, 38, 38)";
const GREEN = "rgb(22, 163, 74)";
function entryWith(regions: R[]) {
  return { taban: { sol: regions, sag: [] as R[] }, yan_ic: { sol: [], sag: [] }, yan_dis: { sol: [], sag: [] }, el_avuc: { sol: [], sag: [] }, el_sirt: { sol: [], sag: [] } };
}
const FILLER = Array.from({ length: 30 }, (_, i) => `ZZ Organ ${String(i + 1).padStart(2, "0")}`);

class Backend {
  rows = new Map<string, { updated_at: string; document: R; organ_list: string[] }>();
  puts: { token: string; organs: string[]; organList: string[]; doc: R }[] = [];
  clock = 0;
  tick() { return new Date(Date.UTC(2026, 9, 29, 9, 0, 0) + (this.clock += 1000)).toISOString(); }
  reset() {
    const docA: R = {
      _meta: { version: "1", updated_at: "2026-10-29T08:00:00.000Z", tombstones: { "zz dalak": "2026-10-28T10:00:00.000Z" }, organUpdatedAt: { "zz kalp": "2026-10-28T09:00:00.000Z" } },
      "ZZ Kalp": entryWith([
        { id: "zz-kalp-1", shape: "oval", cx: 0.3, cy: 0.35, rx: 0.06, ry: 0.05, angle: 0, color: "rgba(239, 68, 68, 0.22)" },
        { id: "zz-kalp-2", shape: "rect", cx: 0.25, cy: 0.6, rx: 0.05, ry: 0.04, angle: 0, color: "rgba(239, 68, 68, 0.22)" },
      ]),
    };
    const docB: R = { _meta: { version: "1", updated_at: "2026-10-29T08:00:00.000Z" }, "ZZ Xorgan": entryWith([{ id: "zz-x-1", shape: "oval", cx: 0.5, cy: 0.5, rx: 0.05, ry: 0.05, angle: 0 }]) };
    this.rows = new Map([
      [TOKEN_A, { updated_at: this.tick(), document: docA, organ_list: ["ZZ Kalp", ...FILLER] }],
      [TOKEN_B, { updated_at: this.tick(), document: docB, organ_list: ["ZZ Xorgan"] }],
    ]);
    this.puts = [];
  }
}
const be = new Backend();
const organsOf = (doc: R) => Object.keys(doc).filter((k) => k !== "_meta");

async function handleApi(route: Route) {
  const req = route.request();
  const p = new URL(req.url()).pathname;
  const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const hv = Object.values(req.headers());
  const tok = hv.some((v) => v.includes(TOKEN_B)) ? TOKEN_B : hv.some((v) => v.includes(TOKEN_A)) ? TOKEN_A : null;
  if (p === "/api/refleksoloji/atlas") {
    if (!tok) return json({ ok: false }, 401);
    const row = be.rows.get(tok)!;
    if (req.method() === "GET") return json({ ok: true, document: row.document, organ_list: row.organ_list, updated_at: row.updated_at });
    const body = req.postDataJSON() as { document: R; organ_list: string[]; expected_updated_at?: string };
    if (body.expected_updated_at !== row.updated_at) return json({ ok: false, conflict: true }, 409);
    be.puts.push({ token: tok, organs: organsOf(body.document), organList: body.organ_list, doc: body.document });
    const updated_at = be.tick();
    be.rows.set(tok, { updated_at, document: body.document, organ_list: body.organ_list });
    return json({ ok: true, updated_at });
  }
  if (p.startsWith("/api/refleksoloji/notes")) return json({ ok: true, notes: [] });
  if (p.startsWith("/api/refleksoloji/protocols")) return json({ ok: true, count: 0, titles: [], protocols: [], data: [] });
  return json({ ok: true });
}

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

type Device = { name: string; viewport: { width: number; height: number }; mobile: boolean; ua?: string };
const DESKTOP: Device = { name: "masaüstü 1366", viewport: { width: 1366, height: 900 }, mobile: false };
const MOBILE: Device = {
  name: "mobil 390", viewport: { width: 390, height: 844 }, mobile: true,
  ua: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

async function newContext(browser: Browser, d: Device): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul",
    ...(d.mobile ? { screen: { width: 390, height: 844 } } : { screen: { width: 1920, height: 1080 } }),
    ...(d.ua ? { userAgent: d.ua } : {}),
  });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = {
    id: "00000000-0000-4000-8000-0000000008b1", tenant_id: "00000000-0000-4000-8000-0000000008a1", full_name: "ZZ_W0811 Uzman",
    email: "zz.w0811@example.test", role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: { reflexology: true }, is_demo_account: false,
  };
  await ctx.addInitScript(([u, t]) => {
    if (!sessionStorage.getItem("zz-w0811-seeded")) {
      localStorage.setItem("yasam_user", u as string);
      localStorage.setItem("yasam_session_token", t as string);
      sessionStorage.setItem("zz-w0811-seeded", "1");
    }
  }, [JSON.stringify(user), TOKEN_A]);
  await ctx.route(`${APP}/api/**`, handleApi);
  await ctx.route((u) => !u.href.startsWith(APP), (r) => r.abort());
  return ctx;
}

async function waitFor(fn: () => Promise<boolean>, ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 150)); }
  return false;
}
const overlay = (page: Page) => page.getByTestId("region-overlay");
const organBtn = (page: Page, name: string) => page.locator("aside li button", { hasText: new RegExp(`^\\s*✓?\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) });
const tool = (page: Page, name: string) => page.getByRole("toolbar", { name: "Bölge haritası araçları" }).getByRole("button", { name, exact: true });
const statusText = async (page: Page) => (await page.locator("section[aria-label='Ayak haritası çalışma alanı'] p").first().innerText()).replace(/\s+/g, " ");
const regionCount = async (page: Page) => Number(/(\d+) bölge/.exec(await statusText(page))?.[1] ?? -1);
const states = (page: Page) => page.evaluate(() => [...document.querySelectorAll("[data-testid='region-overlay'] [data-region-state]")].map((e) => (e as HTMLElement).dataset.regionState));
const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const pressedTools = (page: Page) => page.evaluate(() => [...document.querySelectorAll("[role='toolbar'][aria-label='Bölge haritası araçları'] button[aria-pressed='true']")].map((b) => (b.textContent ?? "").trim()));

/** Bir bölgenin çizim rengi (kutu: kenarlık, nokta: arka plan, çizgi: stroke). */
async function regionColors(page: Page): Promise<{ state: string; color: string }[]> {
  return page.evaluate(() => [...document.querySelectorAll("[data-testid='region-overlay'] [data-region-state]")].map((root) => {
    const el = root as HTMLElement;
    const svgStroke = el.querySelector("line,polyline,path")?.getAttribute("stroke");
    const dot = el.querySelector("span.rounded-full") as HTMLElement | null;
    const box = el.querySelector("[role='button']") as HTMLElement | null; // oval/kare: renk iç gövdede
    const color = svgStroke && svgStroke !== "transparent" ? svgStroke : dot ? getComputedStyle(dot).backgroundColor : getComputedStyle(box ?? el).borderTopColor;
    return { state: el.dataset.regionState ?? "", color };
  }));
}

async function ovBox(page: Page) {
  const b = await overlay(page).boundingBox();
  if (!b) throw new Error("overlay yok");
  return b;
}
async function drag(page: Page, from: [number, number], to: [number, number], steps = 8) {
  const b = await ovBox(page);
  await page.mouse.move(b.x + b.width * from[0], b.y + b.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * to[0], b.y + b.height * to[1], { steps });
  await page.mouse.up();
  await page.waitForTimeout(250);
}
async function freehand(page: Page, pts: [number, number][]) {
  const b = await ovBox(page);
  await page.mouse.move(b.x + b.width * pts[0]![0], b.y + b.height * pts[0]![1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(b.x + b.width * x, b.y + b.height * y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}
async function tap(page: Page, at: [number, number]) {
  const b = await ovBox(page);
  await page.mouse.click(b.x + b.width * at[0], b.y + b.height * at[1]);
  await page.waitForTimeout(250);
}
function disjoint(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5 || a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5;
}
async function addOrgan(page: Page, name: string) {
  await page.getByPlaceholder("Organ adı yaz...").fill(name);
  await page.getByRole("button", { name: "Ekle", exact: true }).click();
  await page.waitForTimeout(300);
}
async function inListViewport(page: Page, btn: Locator) {
  const ul = await page.locator("aside ul", { has: page.locator("li[data-organ-key]") }).boundingBox();
  const b = await btn.boundingBox();
  return !!ul && !!b && b.y >= ul.y - 1 && b.y + b.height <= ul.y + ul.height + 1;
}

async function desktop(browser: Browser) {
  const d = DESKTOP;
  section(d.name);
  be.reset();
  const bBefore = JSON.stringify(be.rows.get(TOKEN_B));
  const ctx = await newContext(browser, d);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${APP}/refleksoloji/bolge-haritasi`, { waitUntil: "domcontentloaded" });
  ok(await waitFor(async () => (await organBtn(page, "ZZ Kalp").count()) === 1, 30000), "sayfa + organ listesi yüklendi");
  ok(await page.getByPlaceholder("Organ adı yaz...").isVisible(), "masaüstünde düzenleme açık (Organ Ekle alanı görünür)");

  // ── W10: Bölge Ekle yok, organ seçimi sonrası korumalı ──
  ok((await page.getByRole("button", { name: /Bölge Ekle/ }).count()) === 0, "W10: 'Bölge Ekle' düğmesi kaldırıldı");
  await organBtn(page, "ZZ Kalp").click();
  await waitFor(async () => (await overlay(page).count()) === 1, 15000);
  await waitFor(async () => (await regionCount(page)) === 2, 8000);
  ok((await pressedTools(page)).filter((t) => /Oval|Kare|Manuel|Kalın|Nokta/.test(t)).length === 0, "W10: organ seçimi sonrası hiçbir çizim aracı basılı değil", await pressedTools(page));
  const putsBefore = be.puts.length;
  await drag(page, [0.6, 0.3], [0.7, 0.4]);
  ok((await regionCount(page)) === 2, "W10: araç seçilmeden sürükleme bölge ÜRETMEZ", await regionCount(page));
  const warn = page.getByTestId("tool-required");
  ok(await warn.isVisible().catch(() => false) && (await warn.innerText()).trim() === "Önce alttan çizim modelini seçin", "W10: 'Önce alttan çizim modelini seçin' uyarısı");
  ok(disjoint((await warn.boundingBox())!, await ovBox(page)), "W11: uyarı harita görselinin DIŞINDA");
  await page.screenshot({ path: path.join(OUT, "w10-uyari-1366.png") });

  // ── W09: kayıtlı bölgeler yeşil ──
  let cols = await regionColors(page);
  ok(cols.length === 2 && cols.every((c) => c.state === "saved" && c.color === GREEN), "W09: kayıtlı bölgeler yeşil", cols);

  // ── Taşı/Düzenle: kayıtlı bölge taşınınca kırmızı, Kaydet → yeşil ──
  // (Kalın çizgi çizilmeden önce: kalın çizginin tam yüzey isabet katmanı diğer bölgelerin taşınmasını
  //  engelliyor — main'de de var olan ayrı bulgu, bu PR'ın kapsamı dışında.)
  await tool(page, "Taşı / Düzenle").click();
  const kalpOval = page.locator("[data-testid='region-overlay'] [data-region-state] [role='button'].border-2").first();
  const kb = (await kalpOval.boundingBox())!;
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150); // gerçek kullanıcı hızı: bekleyen taşıma dinleyicisi bağlansın
  for (let i = 1; i <= 6; i += 1) { await page.mouse.move(kb.x + kb.width / 2 + i * 5, kb.y + kb.height / 2 + i * 3); await page.waitForTimeout(40); }
  await page.mouse.up();
  await page.waitForTimeout(300);
  const kb2 = (await kalpOval.boundingBox())!;
  cols = await regionColors(page);
  ok(Math.abs(kb2.x - kb.x) > 10 && cols.filter((c) => c.state === "unsaved" && c.color === RED).length === 1, "Taşı/Düzenle çalışır; taşınan kayıtlı bölge kırmızıya döner", { dx: kb2.x - kb.x, cols });
  await tool(page, "Kaydet").click();
  ok(await waitFor(async () => (await regionColors(page)).every((c) => c.state === "saved" && c.color === GREEN)), "taşıma kaydedilince yeniden yeşil");
  await organBtn(page, "ZZ Kalp").click(); // Kaydet seçimi korur; korumalı başlangıç için yeniden seç
  await organBtn(page, "ZZ Kalp").click();

  // ── W10: her araç çizimi doğrudan başlatır ──
  const drawWith = async (label: string, act: () => Promise<void>, expectCount: number) => {
    await tool(page, label).click();
    ok((await tool(page, label).getAttribute("aria-pressed")) === "true", `W10: ${label} seçilince basılı`);
    const instr = page.getByTestId("draw-instruction");
    ok(await instr.isVisible() && /ZZ Kalp/.test(await instr.innerText()) && disjoint((await instr.boundingBox())!, await ovBox(page)), `W11: ${label} talimatı harita görselinin dışında`);
    await act();
    ok((await regionCount(page)) === expectCount, `W10: ${label} ile çizim doğrudan başladı (${expectCount} bölge)`, await regionCount(page));
  };
  await drawWith("Oval", () => drag(page, [0.55, 0.2], [0.65, 0.3]), 3);
  ok((await pressedTools(page)).filter((t) => /Oval|Kare|Manuel|Kalın|Nokta/.test(t)).length === 0, "W10: çizim bitince yeniden korumalı (araç basılı değil)");
  await drawWith("Kare", () => drag(page, [0.55, 0.45], [0.65, 0.55]), 4);
  await drawWith("Manuel Çizim", () => freehand(page, [[0.7, 0.6], [0.74, 0.64], [0.78, 0.6], [0.8, 0.66]]), 5);
  await drawWith("Kalın Çizgi", () => drag(page, [0.6, 0.75], [0.75, 0.8]), 6);
  await drawWith("Nokta", () => tap(page, [0.45, 0.5]), 7);
  await page.screenshot({ path: path.join(OUT, "w09-kaydedilmemis-1366.png") });

  // ── W09: yeni çizimler kırmızı, kayıtlılar yeşil ──
  cols = await regionColors(page);
  const unsaved = cols.filter((c) => c.state === "unsaved");
  ok(unsaved.length === 5 && unsaved.every((c) => c.color === RED) && cols.filter((c) => c.state === "saved").every((c) => c.color === GREEN), "W09: 5 kaydedilmemiş çizim kırmızı, 2 kayıtlı yeşil", cols);
  ok(/5 kaydedilmemiş/.test(await statusText(page)), "W09: durum satırında '5 kaydedilmemiş'");

  // ── W09: depolama yazımı başarısız → kırmızı KALIR ──
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    (window as unknown as { __zzOrigSet: typeof orig }).__zzOrigSet = orig;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (/:atlas$/.test(k)) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
      return orig.call(this, k, v);
    };
  });
  await tool(page, "Kaydet").click();
  await page.waitForTimeout(600);
  cols = await regionColors(page);
  ok(cols.filter((c) => c.state === "unsaved").length === 5 && cols.filter((c) => c.color === RED).length === 5, "W09: kayıt başarısızsa çizimler kırmızı KALIR (renk gerçek kayıt durumuna bağlı)", cols);
  await page.evaluate(() => { Storage.prototype.setItem = (window as unknown as { __zzOrigSet: Storage["setItem"] }).__zzOrigSet; });

  // ── Kaydet → yeşil + sunucu PUT ──
  const putsBeforeSave = be.puts.length;
  await tool(page, "Kaydet").click();
  ok(await waitFor(async () => (await regionColors(page)).every((c) => c.state === "saved" && c.color === GREEN)), "W09: başarılı Kaydet sonrası tüm çizimler yeşil");
  ok(!/kaydedilmemiş/.test(await statusText(page)), "W09: 'kaydedilmemiş' sayacı kalktı");
  ok(await waitFor(async () => be.puts.length > putsBeforeSave && be.puts.length > putsBefore && be.puts.at(-1)!.organs.includes("ZZ Kalp"), 8000), "Kaydet → sunucuya PUT gitti");
  const kalp = be.puts.at(-1)!.doc["ZZ Kalp"] as Record<string, Record<string, R[]>>;
  const savedCount = Object.values(kalp).reduce((a, v) => a + (v.sol?.length ?? 0) + (v.sag?.length ?? 0), 0);
  ok(savedCount === 7, `kayıtta 7 bölge (got ${savedCount})`);
  await page.screenshot({ path: path.join(OUT, "w09-kaydedildi-1366.png") });

  // ── Çizimi Sil ──
  await tool(page, "Taşı / Düzenle").click();
  const dot = page.locator("[data-testid='region-overlay'] [data-region-state] span.rounded-full").first();
  await dot.click({ force: true });
  await page.getByRole("button", { name: "Çizimi Sil" }).click();
  await page.waitForTimeout(300);
  ok((await regionCount(page)) === 6, "Çizimi Sil çalışır (6 bölge)", await regionCount(page));
  await tool(page, "Kaydet").click();
  await page.waitForTimeout(500);

  // ── W11: görünüm değiştirme + talimat görselin dışında (ayak + el) ──
  for (const view of ["Yan İç", "Yan Dış", "Avuç İçi", "El Sırtı", "Taban"]) {
    await tool(page, view).click();
    await page.waitForTimeout(500);
    await tool(page, "Oval").click();
    const instr = page.getByTestId("draw-instruction");
    const vis = await instr.isVisible().catch(() => false);
    ok(vis && disjoint((await instr.boundingBox())!, await ovBox(page)), `W11: ${view} — talimat görseldeki Sağ/Sol etiketlerine binmez (harita dışında)`);
    if (view === "Taban") await page.screenshot({ path: path.join(OUT, "w11-talimat-taban-1366.png") });
    if (view === "Avuç İçi") await page.screenshot({ path: path.join(OUT, "w11-talimat-avuc-1366.png") });
    await tool(page, "Oval").click(); // aynı aracı yeniden seçmek modu değiştirmez; korumaya dönmek için organ seçimi
    await organBtn(page, "ZZ Kalp").click(); // seçimi kaldır
    await organBtn(page, "ZZ Kalp").click(); // yeniden seç → korumalı
  }
  ok((await regionCount(page)) === 6, "görünüm değişimi sonrası Taban bölgeleri korunur (6)", await regionCount(page));

  // ── W10: araç seçiliyken organ değişince yeniden korumalı ──
  await tool(page, "Kare").click();
  await organBtn(page, "ZZ Organ 01").click();
  ok((await pressedTools(page)).filter((t) => /Oval|Kare|Manuel|Kalın|Nokta/.test(t)).length === 0, "W10: organ seçimi değişince çizim yeniden korumalı");
  await organBtn(page, "ZZ Organ 01").click();

  // ── W08: Organ Ekle ──
  await addOrgan(page, "ZZ Yeni Organ");
  const yeni = organBtn(page, "ZZ Yeni Organ");
  ok((await yeni.count()) === 1 && (await yeni.getAttribute("aria-pressed")) === "true", "W08: eklenen organ anında listede ve seçili");
  ok(await inListViewport(page, yeni), "W08: uzun listede eklenen organ görünür alanda (kaydırıldı)");
  ok(/ZZ Yeni Organ/.test(await statusText(page)), "W08: eklenen organ aktif organ");
  await page.getByPlaceholder("Organ ara...").fill("kalp");
  await addOrgan(page, "ZZ Zeytin");
  const zey = organBtn(page, "ZZ Zeytin");
  ok((await page.getByPlaceholder("Organ ara...").inputValue()) === "" && (await zey.count()) === 1 && await inListViewport(page, zey), "W08: arama açıkken eklenen organ da anında görünür (arama temizlenir)");
  const rowsBefore = await page.locator("aside li[data-organ-key]").count();
  await addOrgan(page, "zz KALP");
  ok((await page.locator("aside li[data-organ-key]").count()) === rowsBefore && (await organBtn(page, "ZZ Kalp").count()) === 1, "W08: tekrar ekleme (farklı harf) yeni satır üretmez");
  ok((await organBtn(page, "ZZ Kalp").getAttribute("aria-pressed")) === "true" && /ZZ Kalp/.test(await statusText(page)), "W08: tekrar eklemede mevcut organ seçildi");
  ok(await page.getByText("«ZZ Kalp» zaten listede — mevcut organ seçildi.").isVisible(), "W08: 'zaten listede — mevcut organ seçildi' bilgisi");
  await addOrgan(page, "ZZ Dalak");
  await page.waitForTimeout(1500);
  ok((await organBtn(page, "ZZ Dalak").count()) === 1 && (await organBtn(page, "ZZ Dalak").getAttribute("aria-pressed")) === "true", "W08: daha önce silinmiş organ yeniden eklenince listeden DÜŞMEZ ve seçili");
  await tool(page, "Oval").click();
  await drag(page, [0.6, 0.2], [0.7, 0.3]);
  await tool(page, "Kaydet").click();
  ok(await waitFor(async () => (be.puts.at(-1)?.organs ?? []).includes("ZZ Dalak"), 8000), "W08: yeniden eklenen organın çizimi kaydedilir (sunucuda canlı)");
  ok(await waitFor(async () => ["ZZ Yeni Organ", "ZZ Zeytin"].every((o) => (be.puts.at(-1)?.organList ?? []).includes(o)), 8000), "W08: eklenen organlar organ listesiyle sunucuya gider");
  await page.screenshot({ path: path.join(OUT, "w08-organ-ekle-1366.png") });

  ok(JSON.stringify(be.rows.get(TOKEN_B)) === bBefore && be.puts.every((x) => x.token === TOKEN_A), "B uzmanının verisine dokunulmadı");
  ok(await noHScroll(page), "masaüstü: yatay taşma yok");
  ok(errors.length === 0, "masaüstü: sayfa hatası yok", errors);
  await ctx.close();
}

async function mobile(browser: Browser) {
  const d = MOBILE;
  section(d.name);
  be.reset();
  const ctx = await newContext(browser, d);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${APP}/refleksoloji/bolge-haritasi`, { waitUntil: "domcontentloaded" });
  ok(await waitFor(async () => (await organBtn(page, "ZZ Kalp").count()) === 1, 30000), "mobil: sayfa + organ listesi");
  ok((await page.getByPlaceholder("Organ adı yaz...").count()) === 0 && (await page.getByRole("button", { name: "Oval", exact: true }).count()) === 0 && (await page.getByRole("button", { name: "Kaydet", exact: true }).count()) === 0, "mobil: salt okuma korunur (Organ Ekle / çizim araçları / Kaydet yok)");
  await organBtn(page, "ZZ Kalp").click();
  await waitFor(async () => (await overlay(page).count()) === 1, 15000);
  await waitFor(async () => (await regionCount(page)) === 2, 8000);
  const cols = await regionColors(page);
  ok(cols.length === 2 && cols.every((c) => c.state === "saved" && c.color === GREEN), "mobil W09: kayıtlı bölgeler yeşil", cols);
  const b = await ovBox(page);
  await page.touchscreen.tap(b.x + b.width * 0.6, b.y + b.height * 0.3);
  await page.waitForTimeout(400);
  ok((await regionCount(page)) === 2 && (await page.getByTestId("tool-required").count()) === 0, "mobil: dokunuş bölge üretmez, uyarı göstermez (salt okuma)");
  await page.getByRole("button", { name: "Yan İç", exact: true }).click();
  await page.waitForTimeout(400);
  ok(/Yan İç/.test(await page.locator("section[aria-label='Ayak haritası çalışma alanı']").innerText()), "mobil: görünüm değiştirme çalışır");
  ok(await noHScroll(page), "mobil: yatay taşma yok");
  ok(errors.length === 0, "mobil: sayfa hatası yok", errors);
  await page.screenshot({ path: path.join(OUT, "mobil-390.png") });
  await ctx.close();
}

async function main() {
  const server: ChildProcess = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "production" },
  });
  server.stderr?.on("data", (d) => process.stderr.write(`[next] ${d}`));
  let browser: Browser | null = null;
  try {
    await waitHttp(`${APP}/`, 90000);
    browser = await chromium.launch();
    await desktop(browser);
    await mobile(browser);
  } catch (e) {
    fail++;
    console.error("HARNESS HATASI:", e);
  } finally {
    await browser?.close().catch(() => {});
    server.kill();
    if (process.platform === "win32" && server.pid) spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"]);
  }
  console.log(`Ekran görüntüleri: ${OUT}`);
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

void main();
