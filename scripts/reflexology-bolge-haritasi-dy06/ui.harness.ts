/**
 * DY-06 — Refleksoloji Bölge Haritası: Kaydet + sunucu eşitlemesi sonrası çalışma alanı temizliği
 * (gerçek tarayıcı, PRODUCTION'A SIFIR TEMAS). Yerel `next start` + Playwright; `/api/**` sentetik arka uç.
 *
 * Masaüstü 1366:
 *   C1  Kaydet → sunucu eşitlendi → organ seçimi, seçili çizim ve çizim aracı kaldırılır ("Aktif organ yok");
 *       sunucuya giden belgede bölgeler var; organ yeniden seçilince kayıtlı bölgeler (yeşil) yerinde;
 *       Kayıtlı Atlas'ta kayıt silinmemiş.
 *   C2  sunucu gönderimi BAŞARISIZ (500) → hiçbir şey temizlenmez; organ seçili, bölgeler ekranda.
 *   C3  yerel kayıt BAŞARISIZ (depolama) → çizimler kırmızı kalır, organ seçili.
 *   C4  Kaydet sonrası eşitleme beklenirken yeni çizim başladı → eşitlenince temizlenmez (yeni çizim kaybolmaz).
 * Mobil 390: salt okuma korunur (Kaydet yok), bölgeler görünür.
 *
 * Ön koşul: `next build --webpack` (Supabase adresi önemsiz; /api/** yakalanır).
 * Çalıştır: npx tsx scripts/reflexology-bolge-haritasi-dy06/ui.harness.ts [--out <klasör>]
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : path.join(os.tmpdir(), "reflexology-dy06-ui");
const PORT = 3992;
const APP = `http://127.0.0.1:${PORT}`;
const TOKEN = "zz-dy06-session-not-a-secret";
const ORGAN = "ZZ Kalp";
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

type R = Record<string, unknown>;
const GREEN = "rgb(22, 163, 74)";
const RED = "rgb(220, 38, 38)";

class Backend {
  row = { updated_at: "", document: {} as R, organ_list: [] as string[] };
  puts: R[] = [];
  putMode: "ok" | "fail" = "ok";
  putDelayMs = 0;
  clock = 0;
  tick() { return new Date(Date.UTC(2026, 9, 30, 9, 0, 0) + (this.clock += 1000)).toISOString(); }
  reset() {
    this.row = {
      updated_at: this.tick(),
      document: {
        _meta: { version: "1", updated_at: "2026-10-30T08:00:00.000Z", tombstones: {}, organUpdatedAt: {} },
        [ORGAN]: {
          taban: { sol: [
            { id: "zz-k1", shape: "oval", cx: 0.3, cy: 0.35, rx: 0.06, ry: 0.05, angle: 0, color: "rgba(239, 68, 68, 0.22)" },
            { id: "zz-k2", shape: "rect", cx: 0.3, cy: 0.6, rx: 0.05, ry: 0.04, angle: 0, color: "rgba(239, 68, 68, 0.22)" },
          ], sag: [] },
          yan_ic: { sol: [], sag: [] }, yan_dis: { sol: [], sag: [] }, el_avuc: { sol: [], sag: [] }, el_sirt: { sol: [], sag: [] },
        },
      },
      organ_list: [ORGAN, "ZZ Mide"],
    };
    this.puts = [];
    this.putMode = "ok";
    this.putDelayMs = 0;
  }
}
const be = new Backend();
const regionsOf = (doc: R, organ: string) => {
  const e = doc[organ] as Record<string, Record<string, R[]>> | undefined;
  return e ? Object.values(e).reduce((a, v) => a + (v.sol?.length ?? 0) + (v.sag?.length ?? 0), 0) : 0;
};

async function handleApi(route: Route) {
  const req = route.request();
  const p = new URL(req.url()).pathname;
  const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (p === "/api/refleksoloji/atlas") {
    if (req.method() === "GET") return json({ ok: true, document: be.row.document, organ_list: be.row.organ_list, updated_at: be.row.updated_at });
    const body = req.postDataJSON() as { document: R; organ_list: string[]; expected_updated_at?: string };
    if (be.putDelayMs) await new Promise((r) => setTimeout(r, be.putDelayMs));
    if (be.putMode === "fail") return json({ ok: false }, 500);
    if (body.expected_updated_at !== be.row.updated_at) return json({ ok: false, conflict: true }, 409);
    be.puts.push(body.document);
    be.row = { updated_at: be.tick(), document: body.document, organ_list: body.organ_list };
    return json({ ok: true, updated_at: be.row.updated_at });
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

async function newContext(browser: Browser, mobile: boolean): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 },
    screen: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
    isMobile: mobile, hasTouch: mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul",
  });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = {
    id: "00000000-0000-4000-8000-00000000d6b1", tenant_id: "00000000-0000-4000-8000-00000000d6a1", full_name: "ZZ_DY06 Uzman",
    email: "zz.dy06@example.test", role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: { reflexology: true }, is_demo_account: false,
  };
  await ctx.addInitScript(([u, t]) => {
    if (!localStorage.getItem("yasam_user")) {
      localStorage.setItem("yasam_user", u as string);
      localStorage.setItem("yasam_session_token", t as string);
    }
  }, [JSON.stringify(user), TOKEN]);
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
const organBtn = (page: Page, name = ORGAN) => page.locator("aside li button", { hasText: name });
const statusText = async (page: Page) => (await page.locator("section[aria-label='Ayak haritası çalışma alanı'] p").first().innerText()).replace(/\s+/g, " ");
const regionCount = async (page: Page) => Number(/(\d+) bölge/.exec(await statusText(page))?.[1] ?? -1);
const pressedTools = (page: Page) => page.evaluate(() => [...document.querySelectorAll("[role='toolbar'][aria-label='Bölge haritası araçları'] button[aria-pressed='true']")].map((b) => (b.textContent ?? "").trim()).filter((t) => /Oval|Kare|Manuel|Kalın|Nokta|Taşı/.test(t)));
async function colors(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll("[data-testid='region-overlay'] [data-region-state]")].map((root) => {
    const el = root as HTMLElement;
    const box = el.querySelector("[role='button']") as HTMLElement | null;
    return { state: el.dataset.regionState ?? "", color: getComputedStyle(box ?? el).borderTopColor };
  }));
}
async function drawOval(page: Page, at: [number, number]) {
  await tool(page, "Oval").click();
  const b = (await overlay(page).boundingBox())!;
  await page.mouse.move(b.x + b.width * at[0], b.y + b.height * at[1]);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * (at[0] + 0.08), b.y + b.height * (at[1] + 0.07), { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}
async function openWithOrgan(page: Page) {
  await page.goto(`${APP}/refleksoloji/bolge-haritasi`, { waitUntil: "domcontentloaded" });
  await waitFor(async () => (await organBtn(page).count()) === 1, 30000);
  await organBtn(page).click();
  await waitFor(async () => (await overlay(page).count()) === 1, 15000);
  await waitFor(async () => (await regionCount(page)) >= 2, 8000);
}
const organSelected = async (page: Page) => (await organBtn(page).getAttribute("aria-pressed")) === "true";

async function desktop(browser: Browser) {
  section("masaüstü 1366");
  // ── C1 ──
  be.reset();
  let ctx = await newContext(browser, false);
  let page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openWithOrgan(page);
  await drawOval(page, [0.6, 0.25]);
  ok((await regionCount(page)) === 3 && (await colors(page)).filter((c) => c.state === "unsaved").length === 1, "C1: yeni çizim kırmızı (kaydedilmemiş)");
  await tool(page, "Kaydet").click();
  ok(await waitFor(async () => be.puts.length === 1, 8000), "C1: sunucuya PUT gitti");
  ok(regionsOf(be.puts[0] ?? {}, ORGAN) === 3, "C1: sunucudaki belgede 3 bölge (kayıt silinmedi)", regionsOf(be.puts[0] ?? {}, ORGAN));
  ok(await waitFor(async () => !(await organSelected(page)) && /Aktif organ yok/.test(await statusText(page)), 8000), "C1: eşitleme sonrası organ seçimi kaldırıldı ('Aktif organ yok')");
  ok((await pressedTools(page)).length === 0, "C1: çizim aracı seçimi kaldırıldı", await pressedTools(page));
  ok((await page.locator("[data-testid='region-overlay'] [data-region-state]").count()) === 0, "C1: çalışma alanında çizim kalmadı (ekran temizlendi)");
  await page.screenshot({ path: path.join(OUT, "c1-temizlendi-1366.png") });
  await organBtn(page).click();
  ok(await waitFor(async () => (await regionCount(page)) === 3), "C1: organ yeniden seçilince 3 kayıtlı bölge yerinde");
  ok((await colors(page)).every((c) => c.state === "saved" && c.color === GREEN), "C1: kayıtlı bölgeler yeşil");
  await page.goto(`${APP}/refleksoloji/kayitli-atlas`, { waitUntil: "domcontentloaded" });
  ok(await waitFor(async () => (await page.locator("article", { hasText: ORGAN }).count()) === 1 && /3 bölge/.test(await page.locator("article", { hasText: ORGAN }).innerText()), 20000), "C1: Kayıtlı Atlas'ta kayıt duruyor (3 bölge)");
  await ctx.close();

  // ── C2: sunucu gönderimi başarısız ──
  be.reset();
  ctx = await newContext(browser, false);
  page = await ctx.newPage();
  await openWithOrgan(page);
  be.putMode = "fail";
  await drawOval(page, [0.6, 0.25]);
  await tool(page, "Kaydet").click();
  await page.waitForTimeout(3500);
  ok(await organSelected(page) && (await regionCount(page)) === 3, "C2: gönderim başarısız → organ seçili, bölgeler ekranda (temizlenmedi)", await statusText(page));
  ok(/gönderilemedi/.test((await page.locator("body").innerText())), "C2: 'sunucuya gönderilemedi' bildirimi");
  await ctx.close();

  // ── C3: yerel kayıt başarısız ──
  be.reset();
  ctx = await newContext(browser, false);
  page = await ctx.newPage();
  await openWithOrgan(page);
  await drawOval(page, [0.6, 0.25]);
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (/:atlas$/.test(k)) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
      return orig.call(this, k, v);
    };
  });
  await tool(page, "Kaydet").click();
  await page.waitForTimeout(1500);
  const c3 = await colors(page);
  ok(await organSelected(page) && c3.filter((c) => c.state === "unsaved" && c.color === RED).length === 1, "C3: yerel kayıt başarısız → çizim kırmızı kalır, organ seçili", c3);
  ok(be.puts.length === 0, "C3: sunucuya gönderim yok");
  await ctx.close();

  // ── C4: eşitleme beklenirken yeni çizim → temizlenmez ──
  be.reset();
  ctx = await newContext(browser, false);
  page = await ctx.newPage();
  await openWithOrgan(page);
  be.putDelayMs = 3000;
  await drawOval(page, [0.6, 0.25]);
  await tool(page, "Kaydet").click();
  await page.waitForTimeout(300);
  await drawOval(page, [0.6, 0.5]);
  ok(await waitFor(async () => be.puts.length === 1, 10000), "C4: ilk kayıt sunucuya ulaştı");
  await page.waitForTimeout(800);
  const c4 = await colors(page);
  ok(await organSelected(page) && c4.filter((c) => c.state === "unsaved").length === 1, "C4: eşitleme sırasında başlayan yeni çizim korunur (temizlenmedi)", { c4, status: await statusText(page) });
  ok(errors.length === 0, "masaüstü: sayfa hatası yok", errors);
  await ctx.close();
}

async function mobile(browser: Browser) {
  section("mobil 390");
  be.reset();
  const ctx = await newContext(browser, true);
  const page = await ctx.newPage();
  await openWithOrgan(page);
  ok((await page.getByRole("button", { name: "Kaydet", exact: true }).count()) === 0, "mobil: salt okuma (Kaydet yok)");
  ok((await regionCount(page)) === 2 && (await colors(page)).every((c) => c.color === GREEN), "mobil: kayıtlı bölgeler görünür (yeşil)");
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "mobil: yatay taşma yok");
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
