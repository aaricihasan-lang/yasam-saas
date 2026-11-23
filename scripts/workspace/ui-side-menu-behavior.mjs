// SOL MENÜ — modül bazlı daraltma davranışı (components/layout/side-menu/SideMenu.tsx, 2026-11-23 owner kararı):
// ana sayfa genişletilmiş başlar; modüle / başka ana modüle geçişte otomatik daralır; aynı modülün alt sayfalarında ve
// yenilemede elle seçilen durum korunur; ana sayfaya dönüşte yeniden genişler; mobil çekmece, bağlantılar aynen.
// Playwright, yerel sunucu, ağ-mock (prod'a / dış ağa SIFIR temas; 127.0.0.1 dışı abort). CI listesinde DEĞİL (çalışan sunucu ister).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/workspace/ui-side-menu-behavior.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3981";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-admin@example.invalid", full_name: "ZZ Admin", name: "ZZ Admin",
  role: "admin", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a", is_demo_account: false, module_permissions: {},
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(g, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${g}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}

const browser = await chromium.launch();

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 768, isMobile: viewport.width < 768 });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: "2026-11-01T00:00:00.000Z" }));
    } catch {}
  }, USER);
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const p = url.pathname;
    if (p === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (p === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0, items: [], data: [] } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" && /hydrat/i.test(m.text())) errors.push("HYDRATION: " + m.text().slice(0, 200)); });
  return { ctx, page, errors };
}

const aside = (page) => page.locator('aside[data-testid="side-menu"]').first();
const isCollapsed = (page) => aside(page).evaluate((el) => /collapsed/.test(el.className));
const variant = (page) => aside(page).getAttribute("data-side-menu");
const toggle = async (page) => { await aside(page).locator("[data-side-toggle]").click(); await sleep(300); };
const waitPath = async (page, path) => { await page.waitForURL((u) => new URL(u).pathname === path, { timeout: 90000 }); await aside(page).waitFor({ timeout: 90000 }); await sleep(700); };
async function clickMenuLink(page, href) {
  const link = aside(page).locator(`a[href="${href}"]`);
  if (!(await link.count())) {
    await aside(page).getByTestId("home-all-modules-toggle").click();
    await sleep(300);
  }
  await aside(page).locator(`a[href="${href}"]`).first().waitFor({ timeout: 60000 });
  await aside(page).locator(`a[href="${href}"]`).first().click();
}

// ---------- Masaüstü 1366 ----------
{
  const g = "desktop-1366";
  const { ctx, page, errors } = await newPage({ width: 1366, height: 860 });
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await aside(page).waitFor({ timeout: 120000 });
  await sleep(800);
  ok(g, "1) Ana sayfa ilk açılış: genişletilmiş", (await variant(page)) === "home" && !(await isCollapsed(page)));
  await toggle(page);
  ok(g, "2) Ana sayfada elle daraltma çalışır", await isCollapsed(page));
  await page.reload({ waitUntil: "load" }); await aside(page).waitFor(); await sleep(800);
  ok(g, "R) Ana sayfa yenilemesi elle seçilen durumu bozmaz (daraltılmış kalır)", await isCollapsed(page));
  await toggle(page);
  ok(g, "2b) Ana sayfada elle yeniden genişletme", !(await isCollapsed(page)));

  // 3) Ana sayfa → modül (istemci geçişi)
  await clickMenuLink(page, "/urun-stok/canli-stok");
  await waitPath(page, "/urun-stok/canli-stok");
  ok(g, "3) Ana sayfa → modül: otomatik daraltılmış", (await variant(page)) === "app" && (await isCollapsed(page)));
  // 4) Modülde elle genişlet / daralt
  await toggle(page);
  ok(g, "4) Modülde elle genişletme", !(await isCollapsed(page)));
  await toggle(page);
  ok(g, "4b) Modülde elle daraltma", await isCollapsed(page));
  await toggle(page);
  ok(g, "4c) Modülde elle yeniden genişletme", !(await isCollapsed(page)));
  // 5) Aynı modülün alt sayfası
  await clickMenuLink(page, "/urun-stok/yag");
  await waitPath(page, "/urun-stok/yag");
  ok(g, "5) Aynı modül alt sayfası: elle seçilen (genişletilmiş) durum korunur", !(await isCollapsed(page)));
  await page.reload({ waitUntil: "load" }); await aside(page).waitFor(); await sleep(1000);
  ok(g, "R2) Modül sayfası yenilemesi elle seçilen durumu korur (genişletilmiş)", !(await isCollapsed(page)));
  await toggle(page);
  await page.reload({ waitUntil: "load" }); await aside(page).waitFor(); await sleep(1000);
  ok(g, "R3) Modülde daraltıp yenileme → daraltılmış kalır", await isCollapsed(page));
  await toggle(page);
  // 6) Başka ana modül
  await clickMenuLink(page, "/aromaterapi");
  await waitPath(page, "/aromaterapi");
  ok(g, "6) Başka ana modüle geçiş: yeniden otomatik daraltılmış", await isCollapsed(page));
  // 7) Ana sayfaya dönüş (logo)
  await aside(page).locator('a[href="/"]').first().click();
  await waitPath(page, "/");
  ok(g, "7) Ana sayfaya dönüş: genişletilmiş başlar", (await variant(page)) === "home" && !(await isCollapsed(page)));
  // 7b) Ana sayfada daraltıp modüle gidip geri dönme
  await toggle(page);
  await clickMenuLink(page, "/urun-stok/canli-stok");
  await waitPath(page, "/urun-stok/canli-stok");
  ok(g, "7b) Daraltılmış ana sayfadan modüle: daraltılmış", await isCollapsed(page));
  await page.goBack({ waitUntil: "load" });
  await waitPath(page, "/");
  ok(g, "7c) Tarayıcı geri ile ana sayfa: genişletilmiş başlar", !(await isCollapsed(page)));
  // 8) Bağlantılar/yetki: admin düğmesi + Ayarlar bağlantısı hâlâ var
  ok(g, "8) Menü bağlantıları korunur (Ayarlar + Yönetim Paneli)", (await aside(page).locator('a[href="/settings"]').count()) === 1 && (await aside(page).getByTitle(/Admin Paneli|Yönetim Paneli/).count()) >= 1);
  ok(g, "Sayfa hatası / hidrasyon hatası yok", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------- Modül sayfasının doğrudan (soğuk) açılışı ----------
{
  const g = "cold-module";
  const { ctx, page, errors } = await newPage({ width: 1366, height: 860 });
  const html = await (await page.request.get(`${BASE}/urun-stok/yag`)).text();
  const m = html.match(/<aside[^>]*data-testid="side-menu"[^>]*>/);
  ok(g, "SSR: modül sayfası sunucuda da daraltılmış çizilir (açılıp kapanma yok)", !!m && /collapsed/.test(m[0]), m?.[0]);
  await page.goto(`${BASE}/urun-stok/yag`, { waitUntil: "load" });
  await aside(page).waitFor(); await sleep(1000);
  ok(g, "Yeni sekmede modül sayfası daraltılmış", await isCollapsed(page));
  const homeHtml = await (await page.request.get(`${BASE}/`)).text();
  const hm = homeHtml.match(/<aside[^>]*data-testid="side-menu"[^>]*>/);
  ok(g, "SSR: ana sayfa genişletilmiş çizilir", !hm || !/collapsed/.test(hm[0]), hm?.[0]);
  ok(g, "Sayfa hatası / hidrasyon hatası yok", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------- Mobil 390 (çekmece) ----------
{
  const g = "mobile-390";
  const { ctx, page, errors } = await newPage({ width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await aside(page).waitFor({ state: "attached", timeout: 120000 }); await sleep(800);
  ok(g, "Ana sayfa: çekmece kapalı (aria-hidden)", (await aside(page).getAttribute("aria-hidden")) === "true");
  await page.locator('button[aria-controls="home-side"]:not([data-side-toggle])').first().click(); await sleep(400);
  ok(g, "Ana sayfa: menü düğmesi çekmeceyi açar", (await aside(page).getAttribute("aria-hidden")) === null && (await aside(page).evaluate((el) => /drawerOpen/.test(el.className))));
  await clickMenuLink(page, "/urun-stok/canli-stok");
  await page.waitForURL((u) => new URL(u).pathname === "/urun-stok/canli-stok", { timeout: 90000 });
  await aside(page).waitFor({ state: "attached" }); await sleep(900);
  ok(g, "Modül: çekmece kapalı başlar", (await aside(page).getAttribute("aria-hidden")) === "true");
  const btn = page.locator('button[aria-controls="quick-nav"]:not([data-side-toggle])').first();
  await btn.click(); await sleep(400);
  const opened = await aside(page).evaluate((el) => ({ drawer: /drawerOpen/.test(el.className), collapsed: /collapsed/.test(el.className), w: el.getBoundingClientRect().width }));
  ok(g, "Modül: çekmece açılır, tam (ikon değil) görünür", opened.drawer && !opened.collapsed && opened.w > 150, JSON.stringify(opened));
  const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok(g, "Yatay kaydırma yok", !hscroll);
  ok(g, "Sayfa hatası / hidrasyon hatası yok", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
