/**
 * Refleksoloji Bölge Haritası — KALIN ÇİZGİ etkileşim engeli regresyon testi (gerçek tarayıcı, PROD'A SIFIR TEMAS).
 *
 * Yerel `next start` + Playwright; `/api/**` bellek-içi SENTETİK arka uç (tenant oturum token'ından).
 * Atlas: aynı görünümde (Taban) oval, kare, manuel çizim, nokta + İKİ kalın çizgi (biri ovali kesiyor,
 * biri hiçbir şekle değmiyor); kalın çizgiler DOM'da diğer şekillerden SONRA (üstte) çizilir.
 * Yan İç görünümünde de oval + kalın çizgi.
 *
 * Masaüstü 1366:
 *   H1  isabet: her şeklin (çizgiye değmeyen) merkezindeki öğe o şeklin kendisidir (kalın çizgi katmanı değil)
 *   H2  Taşı/Düzenle: oval, kare, manuel çizim ve nokta kalın çizgi varken taşınır → kırmızı (kaydedilmemiş)
 *   H3  örtüşme: ovalin kalın çizgiye değmeyen kısmından ovali taşı; tam çizgi üzerinden tıklama çizgiyi seçer
 *   H4  kalın çizginin kendisi: seçilir (uç/döndür tutamaçları görünür), gövdesi taşınır, ucu sürüklenir
 *   H5  Seç modu: kalın çizgi varken oval ve kalın çizgi tıklanarak seçilir; Çizimi Sil kalın çizgiyi siler
 *   H6  Kaydet → hepsi yeşil + sunucu PUT; sayfa yeniden açılınca konumlar korunur ve yeniden düzenlenir
 *   H7  W10: kalın çizgi varken araçsız çizim denemesi bölge üretmez + uyarı görünür (boş alan tıklaması
 *       kalın çizgi katmanına yutulmaz); araç seçilince kalın çizginin üstünden de yeni çizim başlar
 *   H8  görünüm değiştirme: Yan İç'te kalın çizgi varken oval taşınır
 * Mobil 390: salt okuma korunur (taşıma yok, düzenleme kontrolü yok), bölgeler yeşil, yatay taşma yok.
 *
 * Ön koşul: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54599 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-… \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-… npx next build --webpack
 * Çalıştır: npx tsx scripts/reflexology-bolge-haritasi-kalin-cizgi/ui.harness.ts [--out <klasör>]
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : path.join(os.tmpdir(), "reflexology-kalin-cizgi-ui");
const PORT = 3998;
const APP = `http://127.0.0.1:${PORT}`;
const TOKEN_A = "zz-kalin-session-a-not-a-secret";
const TOKEN_B = "zz-kalin-session-b-not-a-secret";
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
const ORGAN = "ZZ Kalp";
// Taban: kalın çizgiler EN SONDA (DOM'da üstte). L1 ovali (0.30,0.30) yatay keser; L2 hiçbir şekle değmez.
const TABAN: R[] = [
  { id: "zz-oval", shape: "oval", cx: 0.3, cy: 0.3, rx: 0.08, ry: 0.07, angle: 0, color: "rgba(239, 68, 68, 0.22)" },
  { id: "zz-rect", shape: "rect", cx: 0.3, cy: 0.62, rx: 0.06, ry: 0.05, angle: 0, color: "rgba(239, 68, 68, 0.22)" },
  { id: "zz-free", shape: "free_draw", points: [{ x: 0.7, y: 0.55 }, { x: 0.74, y: 0.6 }, { x: 0.78, y: 0.55 }, { x: 0.82, y: 0.62 }], color: "rgba(239, 68, 68, 0.22)" },
  { id: "zz-point", shape: "point", cx: 0.72, cy: 0.3, pointSize: "lg", color: "rgba(239, 68, 68, 0.22)" },
  { id: "zz-line1", shape: "thick_line", x1: 0.18, y1: 0.3, x2: 0.45, y2: 0.3, lineWidth: 0.003, color: "rgba(239, 68, 68, 0.22)" },
  { id: "zz-line2", shape: "thick_line", x1: 0.55, y1: 0.85, x2: 0.85, y2: 0.88, lineWidth: 0.003, color: "rgba(239, 68, 68, 0.22)" },
];
const YAN_IC: R[] = [
  { id: "zz-yan-oval", shape: "oval", cx: 0.3, cy: 0.5, rx: 0.07, ry: 0.06, angle: 0, color: "rgba(239, 68, 68, 0.22)" },
  { id: "zz-yan-line", shape: "thick_line", x1: 0.55, y1: 0.4, x2: 0.8, y2: 0.45, lineWidth: 0.003, color: "rgba(239, 68, 68, 0.22)" },
];

class Backend {
  rows = new Map<string, { updated_at: string; document: R; organ_list: string[] }>();
  puts: { token: string; doc: R }[] = [];
  clock = 0;
  tick() { return new Date(Date.UTC(2026, 9, 29, 9, 0, 0) + (this.clock += 1000)).toISOString(); }
  reset() {
    const docA: R = {
      _meta: { version: "1", updated_at: "2026-10-29T08:00:00.000Z", tombstones: {}, organUpdatedAt: {} },
      [ORGAN]: { taban: { sol: TABAN, sag: [] }, yan_ic: { sol: YAN_IC, sag: [] }, yan_dis: { sol: [], sag: [] }, el_avuc: { sol: [], sag: [] }, el_sirt: { sol: [], sag: [] } },
    };
    const docB: R = { _meta: { version: "1", updated_at: "2026-10-29T08:00:00.000Z" }, "ZZ Xorgan": { taban: { sol: [{ id: "zz-x", shape: "oval", cx: 0.5, cy: 0.5, rx: 0.05, ry: 0.05, angle: 0 }], sag: [] }, yan_ic: { sol: [], sag: [] }, yan_dis: { sol: [], sag: [] } } };
    this.rows = new Map([
      [TOKEN_A, { updated_at: this.tick(), document: docA, organ_list: [ORGAN] }],
      [TOKEN_B, { updated_at: this.tick(), document: docB, organ_list: ["ZZ Xorgan"] }],
    ]);
    this.puts = [];
  }
}
const be = new Backend();

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
    be.puts.push({ token: tok, doc: body.document });
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
    screen: d.mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
    ...(d.ua ? { userAgent: d.ua } : {}),
  });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = {
    id: "00000000-0000-4000-8000-00000000c0b1", tenant_id: "00000000-0000-4000-8000-00000000c0a1", full_name: "ZZ_Kalin Uzman",
    email: "zz.kalin@example.test", role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: { reflexology: true }, is_demo_account: false,
  };
  await ctx.addInitScript(([u, t]) => {
    if (!localStorage.getItem("yasam_user")) {
      localStorage.setItem("yasam_user", u as string);
      localStorage.setItem("yasam_session_token", t as string);
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
const tool = (page: Page, name: string) => page.getByRole("toolbar", { name: "Bölge haritası araçları" }).getByRole("button", { name, exact: true });
const organBtn = (page: Page) => page.locator("aside li button", { hasText: ORGAN });
const statusText = async (page: Page) => (await page.locator("section[aria-label='Ayak haritası çalışma alanı'] p").first().innerText()).replace(/\s+/g, " ");
const regionCount = async (page: Page) => Number(/(\d+) bölge/.exec(await statusText(page))?.[1] ?? -1);
const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/** Overlay-normalize (0..1) noktayı sayfa piksellerine çevirir. */
async function px(page: Page, x: number, y: number) {
  const b = (await overlay(page).boundingBox())!;
  return { x: b.x + b.width * x, y: b.y + b.height * y };
}

/** Noktadaki en üst öğe hangi bölgeye ait? (region id'yi şekil kökünün çocuklarından çıkarmak için data/aria kullanılır) */
async function hitInfo(page: Page, x: number, y: number) {
  const p = await px(page, x, y);
  return page.evaluate(({ px: X, py: Y }) => {
    const el = document.elementFromPoint(X, Y) as Element | null;
    if (!el) return { tag: "yok", kind: "yok" };
    const root = el.closest("[data-region-state]");
    const isLineLayer = !!root && !!root.querySelector("line[stroke='transparent']") && (el.tagName.toLowerCase() === "svg" || el === root);
    const kind = el.tagName.toLowerCase() === "line" ? "kalin-cizgi-govdesi"
      : isLineLayer ? "kalin-cizgi-katmani"
        : el.getAttribute("role") === "button" ? "sekil-govdesi"
          : el.closest("[role='button']") ? "sekil-govdesi"
            : el.getAttribute("data-testid") === "region-overlay" ? "bos-alan" : el.tagName.toLowerCase();
    return { tag: el.tagName.toLowerCase(), kind };
  }, { px: p.x, py: p.y });
}

/** Bölgenin ekrandaki konum özeti (taşındı mı karşılaştırmak için). */
async function regionSnapshot(page: Page) {
  return page.evaluate(() => {
    // Konum çizim yüzeyine GÖRELİ ve normalize (üst şerit sarınca yüzey kayabilir).
    const ov = (document.querySelector("[data-testid='region-overlay']") as HTMLElement).getBoundingClientRect();
    return [...document.querySelectorAll("[data-testid='region-overlay'] [data-region-state]")].map((root) => {
    const el = root as HTMLElement;
    const line = el.querySelector("line[stroke='transparent']");
    const poly = el.querySelector("polyline");
    const rr = el.getBoundingClientRect();
    const r = { x: ((rr.x - ov.x) / ov.width) * 1000, y: ((rr.y - ov.y) / ov.height) * 1000 };
    return {
      state: el.dataset.regionState ?? "",
      key: line ? `line:${line.getAttribute("x1")},${line.getAttribute("y1")},${line.getAttribute("x2")},${line.getAttribute("y2")}` : poly ? `poly:${poly.getAttribute("points")}` : `box:${Math.round(r.x)},${Math.round(r.y)}`,
    };
    });
  });
}
async function regionColors(page: Page): Promise<{ state: string; color: string }[]> {
  return page.evaluate(() => [...document.querySelectorAll("[data-testid='region-overlay'] [data-region-state]")].map((root) => {
    const el = root as HTMLElement;
    const svgStroke = [...el.querySelectorAll("line,polyline,path")].map((n) => n.getAttribute("stroke")).find((s) => s && s !== "transparent");
    const dot = el.querySelector("span.rounded-full") as HTMLElement | null;
    const box = el.querySelector("[role='button']") as HTMLElement | null;
    const color = svgStroke ?? (dot ? getComputedStyle(dot).backgroundColor : getComputedStyle(box ?? el).borderTopColor);
    return { state: el.dataset.regionState ?? "", color };
  }));
}

/** Önceki anlık görüntüde olmayan (konumu değişmiş) bölge sayısı — sıra bağımsız. */
function movedCount(before: { key: string }[], after: { key: string }[]) {
  const pool = before.map((b) => b.key);
  let moved = 0;
  for (const a of after) {
    const i = pool.indexOf(a.key);
    if (i >= 0) pool.splice(i, 1);
    else moved += 1;
  }
  return moved;
}

/** Gerçek kullanıcı hızında sürükleme (bekleyen taşıma dinleyicisi efektle bağlanır). */
async function dragAt(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  for (let i = 1; i <= 6; i += 1) { await page.mouse.move(from.x + (dx * i) / 6, from.y + (dy * i) / 6); await page.waitForTimeout(40); }
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function openOrgan(page: Page) {
  await page.goto(`${APP}/refleksoloji/bolge-haritasi`, { waitUntil: "domcontentloaded" });
  await waitFor(async () => (await organBtn(page).count()) === 1, 30000);
  await organBtn(page).click();
  await waitFor(async () => (await overlay(page).count()) === 1, 15000);
  await waitFor(async () => (await regionCount(page)) === 6, 10000);
}

async function desktop(browser: Browser) {
  section(DESKTOP.name);
  be.reset();
  const bBefore = JSON.stringify(be.rows.get(TOKEN_B));
  const ctx = await newContext(browser, DESKTOP);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openOrgan(page);
  ok((await regionCount(page)) === 6, "Taban: 6 bölge (oval, kare, manuel, nokta, 2 kalın çizgi)", await regionCount(page));

  // ── H1 isabet ──
  await tool(page, "Taşı / Düzenle").click();
  await page.waitForTimeout(300);
  const centers: [string, number, number][] = [["oval (çizgiye değmeyen alt kısmı)", 0.3, 0.34], ["kare", 0.3, 0.62], ["nokta", 0.72, 0.3], ["boş alan", 0.55, 0.15]];
  for (const [name, x, y] of centers) {
    const h = await hitInfo(page, x, y);
    const want = name === "boş alan" ? "bos-alan" : "sekil-govdesi";
    ok(h.kind === want, `H1: ${name} noktasındaki öğe ${want} (kalın çizgi katmanı DEĞİL)`, h);
  }
  const hl = await hitInfo(page, 0.6, 0.62);
  ok(hl.kind !== "kalin-cizgi-katmani", "H1: manuel çizim bölgesinde kalın çizgi katmanı yok", hl);
  await page.screenshot({ path: path.join(OUT, "h1-tasi-modu-1366.png") });

  // ── H2 Taşı/Düzenle: kalın çizgi varken diğer şekiller ──
  const moveCase = async (name: string, at: [number, number]) => {
    const before = await regionSnapshot(page);
    await dragAt(page, await px(page, at[0], at[1]), 24, 14);
    const after = await regionSnapshot(page);
    const changed = movedCount(before, after);
    const unsaved = after.filter((a) => a.state === "unsaved").length;
    ok(changed === 1, `H2: ${name} kalın çizgi varken taşındı (1 bölge konumu değişti)`, { changed });
    return unsaved;
  };
  let unsaved = await moveCase("oval", [0.3, 0.34]);
  unsaved = await moveCase("kare", [0.3, 0.62]);
  unsaved = await moveCase("nokta", [0.72, 0.3]);
  // Manuel çizim: çizgisinin üstünden tut (polyline'ın ilk noktası yakını)
  const freeRoot = page.locator("[data-testid='region-overlay'] [data-region-state]").filter({ has: page.locator("polyline") }).first();
  const fb = await freeRoot.locator("[role='button']").first().boundingBox().catch(() => null);
  if (fb) {
    const before = await regionSnapshot(page);
    await dragAt(page, { x: fb.x + fb.width / 2, y: fb.y + fb.height / 2 }, 20, 12);
    const after = await regionSnapshot(page);
    ok(movedCount(before, after) === 1, "H2: manuel çizim kalın çizgi varken taşındı");
  } else ok(false, "H2: manuel çizim tutulacak gövde bulunamadı");
  unsaved = (await regionSnapshot(page)).filter((a) => a.state === "unsaved").length;
  const cols = await regionColors(page);
  ok(unsaved === 4 && cols.filter((c) => c.state === "unsaved").every((c) => c.color === RED) && cols.filter((c) => c.state === "saved").every((c) => c.color === GREEN), "H2: taşınan 4 şekil kırmızı, kalın çizgiler yeşil", cols);

  // ── H3 örtüşme: tam çizgi üzerinden tıklama çizgiyi seçer ──
  const onLine1 = await hitInfo(page, 0.2, 0.3);
  ok(onLine1.kind === "kalin-cizgi-govdesi", "H3: örtüşmede tam kalın çizgi üzerinden tıklama çizginin gövdesine gider", onLine1);

  // ── H4 kalın çizginin kendisi ──
  const l2 = await px(page, 0.7, 0.865);
  await page.mouse.click(l2.x, l2.y);
  await page.waitForTimeout(300);
  ok(await page.getByRole("button", { name: "Çizgi başlangıcı" }).isVisible().catch(() => false) && await page.getByRole("button", { name: "Çizgiyi döndür" }).isVisible().catch(() => false), "H4: kalın çizgi seçilir (uç + döndür tutamaçları görünür)");
  let before = await regionSnapshot(page);
  await dragAt(page, l2, 20, -30);
  let after = await regionSnapshot(page);
  ok(movedCount(before, after) === 1 && movedCount(before.filter((b) => b.key.startsWith("line:")), after.filter((a) => a.key.startsWith("line:"))) === 1, "H4: kalın çizginin gövdesi sürüklenerek taşınır");
  const endBtn = page.getByRole("button", { name: "Çizgi bitişi" });
  const eb = await endBtn.boundingBox().catch(() => null);
  if (eb) {
    before = await regionSnapshot(page);
    await dragAt(page, { x: eb.x + eb.width / 2, y: eb.y + eb.height / 2 }, 30, 20);
    after = await regionSnapshot(page);
    ok(movedCount(before, after) === 1 && movedCount(before.filter((b) => b.key.startsWith("line:")), after.filter((a) => a.key.startsWith("line:"))) === 1, "H4: kalın çizginin ucu sürüklenerek düzenlenir");
  } else ok(false, "H4: uç tutamacı bulunamadı");
  await page.screenshot({ path: path.join(OUT, "h4-kalin-cizgi-secili-1366.png") });

  // ── H6 Kaydet → yeşil + PUT; yeniden aç → konumlar korunur ──
  const putsBefore = be.puts.length;
  await tool(page, "Kaydet").click();
  ok(await waitFor(async () => (await regionColors(page)).every((c) => c.state === "saved" && c.color === GREEN)), "H6: Kaydet sonrası tüm bölgeler yeşil");
  ok(await waitFor(async () => be.puts.length > putsBefore, 8000), "H6: sunucuya PUT gitti");
  const savedSnap = (await regionSnapshot(page)).map((r) => r.key).sort();
  await openOrgan(page);
  const reopened = (await regionSnapshot(page)).map((r) => r.key).sort();
  ok(JSON.stringify(reopened) === JSON.stringify(savedSnap) && (await regionColors(page)).every((c) => c.color === GREEN), "H6: sayfa yeniden açılınca konumlar korunur, bölgeler yeşil", { savedSnap, reopened });
  await tool(page, "Taşı / Düzenle").click();
  await page.waitForTimeout(300);
  before = await regionSnapshot(page);
  const rectBody = page.locator("[data-testid='region-overlay'] [data-region-state] [role='button'].border-2").nth(1);
  const rb = (await rectBody.boundingBox())!;
  await dragAt(page, { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 }, -18, 10);
  after = await regionSnapshot(page);
  ok(movedCount(before, after) === 1 && after.filter((a) => a.state === "unsaved").length === 1, "H6: yeniden açılışta kalın çizgi varken düzenleme çalışır (kırmızıya döner)");
  await tool(page, "Kaydet").click();
  await waitFor(async () => (await regionColors(page)).every((c) => c.state === "saved"));

  // ── H5 Seç modu + Çizimi Sil ──
  await organBtn(page).click();
  await organBtn(page).click(); // seç modu / korumalı
  await waitFor(async () => (await regionCount(page)) === 6, 5000);
  const ovalCenter = await px(page, 0.3, 0.38);
  const ovalBody = page.locator("[data-testid='region-overlay'] [data-region-state] [role='button'].border-2").first();
  const ob = (await ovalBody.boundingBox())!;
  await page.mouse.click(ob.x + ob.width / 2, ob.y + ob.height * 0.8);
  await page.waitForTimeout(200);
  ok(await page.getByRole("button", { name: "Çizimi Sil" }).isEnabled(), "H5: seç modunda kalın çizgi varken oval tıklanarak seçilir (Çizimi Sil etkin)");
  void ovalCenter;
  const lineBodyPt = await (async () => {
    // L1'in ovalle örtüşmeyen sol ucu (x=0.19); oval seçiliyken z-20 ile üstte olduğundan örtüşen yerden tıklama ovali seçer.
    return px(page, 0.19, 0.3);
  })();
  await page.mouse.click(lineBodyPt.x, lineBodyPt.y);
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Çizimi Sil" }).click();
  await page.waitForTimeout(300);
  ok((await regionCount(page)) === 5 && (await regionSnapshot(page)).filter((r) => r.key.startsWith("line:")).length === 1, "H5: kalın çizgi seçilip Çizimi Sil ile silinir (5 bölge, 1 kalın çizgi)", await regionCount(page));
  await tool(page, "Kaydet").click();
  await page.waitForTimeout(500);

  // ── H7 W10 korumalı çizim: kalın çizgi varken boş alan uyarısı + araçla çizim ──
  await organBtn(page).click();
  await organBtn(page).click();
  await waitFor(async () => (await regionCount(page)) === 5, 5000);
  const empty = await px(page, 0.55, 0.15);
  await dragAt(page, empty, 30, 30);
  ok((await regionCount(page)) === 5, "H7: araçsız çizim denemesi bölge üretmez", await regionCount(page));
  ok(await page.getByTestId("tool-required").isVisible().catch(() => false), "H7: 'Önce alttan çizim modelini seçin' uyarısı (boş alan tıklaması kalın çizgi katmanına yutulmaz)");
  await tool(page, "Oval").click();
  const remainingLine = page.locator("[data-testid='region-overlay'] line[stroke='transparent']").first();
  const lb = (await remainingLine.boundingBox())!;
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await page.mouse.down();
  await page.mouse.move(lb.x + lb.width / 2 + 40, lb.y + lb.height / 2 + 30, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  ok((await regionCount(page)) === 6, "H7: araç seçiliyken kalın çizginin üstünden başlayan yeni çizim oluşur", await regionCount(page));
  const cols2 = await regionColors(page);
  ok(cols2.filter((c) => c.state === "unsaved").length === 1 && cols2.filter((c) => c.state === "unsaved").every((c) => c.color === RED), "H7: yeni çizim kırmızı (kaydedilmemiş)", cols2);
  await tool(page, "Kaydet").click();
  await page.waitForTimeout(500);

  // ── H8 görünüm değiştirme: Yan İç ──
  await tool(page, "Yan İç").click();
  await page.waitForTimeout(600);
  await tool(page, "Taşı / Düzenle").click();
  await page.waitForTimeout(300);
  ok((await regionCount(page)) === 2, "H8: Yan İç'te 2 bölge (oval + kalın çizgi)", await regionCount(page));
  const yo = page.locator("[data-testid='region-overlay'] [data-region-state] [role='button'].border-2").first();
  const yb = (await yo.boundingBox())!;
  before = await regionSnapshot(page);
  await dragAt(page, { x: yb.x + yb.width / 2, y: yb.y + yb.height / 2 }, 22, 12);
  after = await regionSnapshot(page);
  ok(movedCount(before, after) === 1, "H8: Yan İç'te kalın çizgi varken oval taşınır");
  await tool(page, "Kaydet").click();
  await waitFor(async () => (await regionColors(page)).every((c) => c.state === "saved"));

  ok(JSON.stringify(be.rows.get(TOKEN_B)) === bBefore && be.puts.every((x) => x.token === TOKEN_A), "B uzmanının verisine dokunulmadı");
  ok(await noHScroll(page), "masaüstü: yatay taşma yok");
  ok(errors.length === 0, "masaüstü: sayfa hatası yok", errors);
  await ctx.close();
}

async function mobile(browser: Browser) {
  section(MOBILE.name);
  be.reset();
  const ctx = await newContext(browser, MOBILE);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openOrgan(page);
  ok((await regionCount(page)) === 6, "mobil: 6 bölge görünür");
  ok((await page.getByRole("button", { name: "Taşı / Düzenle", exact: true }).count()) === 0 && (await page.getByRole("button", { name: "Kaydet", exact: true }).count()) === 0, "mobil: salt okuma (Taşı/Düzenle ve Kaydet yok)");
  const cols = await regionColors(page);
  ok(cols.length === 6 && cols.every((c) => c.state === "saved" && c.color === GREEN), "mobil: bölgeler yeşil", cols);
  const before = await regionSnapshot(page);
  const p = await px(page, 0.3, 0.34);
  await page.touchscreen.tap(p.x, p.y);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 30, p.y + 20, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(300);
  ok(JSON.stringify(await regionSnapshot(page)) === JSON.stringify(before), "mobil: dokunuş/sürükleme hiçbir bölgeyi taşımaz");
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
