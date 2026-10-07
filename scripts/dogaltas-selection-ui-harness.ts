/**
 * Doğaltaş TOPLU SEÇİM UX — gerçek tarayıcı UI harness (PRODUCTION'A SIFIR TEMAS, 2026-10-07).
 *
 * Yerel `next start` + Playwright; `/api/**` istekleri bellek-içi SENTETİK arka uçla karşılanır
 * (250 mineral, 1200 taş — sayfalı listede yalnız 30'u yüklü). Sunucu rotaları değişmedi; burada
 * istemci seçim mantığı doğrulanır:
 *   - "Görünenleri Seç" YOK; "Tümünü Seç (N)" N = GERÇEK toplam; tıklayınca seçili sayı = N (30 değil),
 *   - aktif arama → "Sonuçların Tümünü Seç (n)" + yalnız sonuç kümesi seçilir,
 *   - kapsam (arama) değişince seçim temizlenir (gizli seçim yok),
 *   - "✕ Seçimi Temizle" yalnız seçim varken görünür ve aktif; tıklayınca 0,
 *   - toplu silme 3 aşamalı onay (#350) ister; Vazgeç → istek YOK; 3 aşama → silinen id'ler = seçim,
 *     1000+ seçim sunucu sınırına uygun parçalara bölünür,
 *   - Word: mineral modalı yalnız "Tüm Mineraller" + "Seçili Mineraller"; seçili Word id'leri = seçim,
 *   - mobil (390px): "Tümünü Seç" gizli (max-2 kuralı korunur).
 *
 * Ön koşul (gizli değer YOK):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54599 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-w3-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-w3-test-service-role-not-a-secret npx next build
 * Çalıştır: npx tsx scripts/dogaltas-selection-ui-harness.ts [--out <klasör>]
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";
import { bulkDeletePhrase } from "../lib/ui/bulkDeleteGuard";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : path.join(os.tmpdir(), "dogaltas-selection-ui");
const PORT = 3987;
const APP = `http://127.0.0.1:${PORT}`;
const TENANT = "00000000-0000-4000-8000-0000000000a3";
const USER_ID = "00000000-0000-4000-8000-0000000000b3";
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

// ─── Sentetik arka uç ────────────────────────────────────────────────────────
type Mineral = { id: string; tenant_id: string; source_id: string; name: string; aciklama: string; kategori: string | null; created_at: string };
type Stone = { id: string; tenant_id: string; stone_name: string; short_description: string; chakras: string[]; images: unknown[]; updated_at: string };
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const uid = (p: string, i: number) => `${p}000000-0000-4000-8000-${pad(i, 12)}`;

class Backend {
  minerals: Mineral[] = [];
  stones: Stone[] = [];
  deleteCalls: { path: string; ids: string[] }[] = [];
  wordCalls: { path: string; body: Record<string, unknown> }[] = [];
  unknown = new Set<string>();
  reset() {
    this.minerals = Array.from({ length: 250 }, (_, i) => ({
      id: uid("a", i + 1), tenant_id: TENANT, source_id: "src", name: `ZZ_Mineral ${pad(i + 1, 3)}${i % 5 === 0 ? " Çinko" : ""}`,
      aciklama: "Sentetik", kategori: i % 2 ? "İz Mineral" : "Makro", created_at: "2026-10-07T09:00:00.000Z",
    }));
    this.stones = Array.from({ length: 1200 }, (_, i) => ({
      id: uid("b", i + 1), tenant_id: TENANT, stone_name: `ZZ_Taş ${pad(i + 1)}${i % 4 === 0 ? " Ametist" : ""}`,
      short_description: "Sentetik", chakras: [], images: [], updated_at: "2026-10-07T09:00:00.000Z",
    }));
    this.deleteCalls = []; this.wordCalls = [];
  }
}
const be = new Backend();
const norm = (s: string) => s.toLocaleLowerCase("tr-TR");

async function handleApi(route: Route) {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  const sp = url.searchParams;
  const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const body = (() => { try { return req.postDataJSON() as Record<string, unknown>; } catch { return {}; } })();
  const offset = Number(sp.get("offset") ?? 0);
  const limit = Number(sp.get("limit") ?? 30);
  const q = sp.get("q")?.trim() ?? "";

  if (p === "/api/dogaltas/minerals" && req.method() === "GET") {
    const mode = sp.get("mode") ?? "list";
    const cat = sp.get("category")?.trim() ?? "";
    let rows = be.minerals.filter((m) => !q || norm(m.name).includes(norm(q)));
    if (cat) rows = rows.filter((m) => (m.kategori ?? "") === cat);
    if (mode === "count") return json({ ok: true, count: rows.length });
    if (mode === "list") return json({ ok: true, rows: rows.slice(offset, offset + limit) });
    if (mode === "categories") return json({ ok: true, categories: [...new Set(be.minerals.map((m) => m.kategori).filter(Boolean))] });
    return json({ ok: true, rows });
  }
  if (p === "/api/dogaltas/minerals/bulk-delete") {
    const ids = (body.ids as string[]) ?? [];
    be.deleteCalls.push({ path: p, ids });
    const set = new Set(ids);
    const before = be.minerals.length;
    be.minerals = be.minerals.filter((m) => !set.has(m.id));
    return json({ ok: true, deleted: before - be.minerals.length });
  }
  if (p === "/api/dogaltas/stones" && req.method() === "GET") {
    const mode = sp.get("mode") ?? "list";
    const rows = be.stones.filter((s) => !q || norm(s.stone_name).includes(norm(q)));
    if (mode === "count") return json({ ok: true, count: rows.length });
    if (mode === "list") return json({ ok: true, rows: rows.slice(offset, offset + limit), ...(sp.get("withCount") ? { count: rows.length } : {}) });
    return json({ ok: true, rows });
  }
  if (p === "/api/dogaltas/stones/bulk-delete") {
    const ids = (body.ids as string[]) ?? [];
    be.deleteCalls.push({ path: p, ids });
    const set = new Set(ids);
    const deletedIds = be.stones.filter((s) => set.has(s.id)).map((s) => s.id);
    be.stones = be.stones.filter((s) => !set.has(s.id));
    return json({ ok: true, deletedIds });
  }
  if (p === "/api/dogaltas/stone-exclusions") return json({ ok: true, stoneIds: [] });
  if (p === "/api/dogaltas/mineral-report" || p === "/api/dogaltas/word-report") {
    be.wordCalls.push({ path: p, body });
    return route.fulfill({
      status: 200,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      headers: { "Content-Disposition": 'attachment; filename="zz.docx"' },
      body: Buffer.from("PK\u0003\u0004zz"),
    });
  }
  if (p.startsWith("/api/usage")) return json({ ok: true });
  be.unknown.add(`${req.method()} ${p}`);
  return json({ ok: true, rows: [], count: 0 });
}

// ─── Ortam ───────────────────────────────────────────────────────────────────
async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

type Device = { name: string; viewport: { width: number; height: number }; mobile: boolean; ua?: string };
const DESKTOP: Device = { name: "masaüstü", viewport: { width: 1366, height: 900 }, mobile: false };
const MOBILE: Device = {
  name: "mobil 390", viewport: { width: 390, height: 844 }, mobile: true,
  ua: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

async function newContext(browser: Browser, d: Device): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul",
    acceptDownloads: true, ...(d.ua ? { userAgent: d.ua } : {}),
  });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = {
    id: USER_ID, tenant_id: TENANT, full_name: "ZZ_W3 Uzman", email: "zz.w3@example.test", role: "expert",
    active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: { stones: true, dogaltas: true }, is_demo_account: false,
  };
  await ctx.addInitScript(([u]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", "zz-w3-session-not-a-secret");
  }, [JSON.stringify(user)]);
  await ctx.route(`${APP}/api/**`, handleApi);
  // Uygulama dışı her istek (Supabase vb.) kesilir — dış dünyaya sıfır temas.
  await ctx.route((u) => !u.href.startsWith(APP), (r) => r.abort());
  return ctx;
}

const selectedCount = async (page: Page): Promise<number> => {
  const txt = (await page.locator("text=/✓ \\d+ seçili/").first().textContent().catch(() => "")) ?? "";
  return Number(/(\d+) seçili/.exec(txt)?.[1] ?? 0);
};
const selectAllBtn = (page: Page) => page.locator("button", { hasText: /Tümünü Seç \(\d+\)/ }).first();
const clearBtn = (page: Page) => page.getByTestId("bulk-clear-selection").first();

async function waitCount(page: Page, n: number, ms = 15000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if ((await selectedCount(page)) === n) return true; await page.waitForTimeout(150); }
  return false;
}

/** Açık onay modalında 3 aşamayı yürütür (stage2: ifade yazılır). */
async function runThreeStage(page: Page, count: number, label: string) {
  const dlg = () => page.locator("[role=dialog], [role=alertdialog]").last();
  await dlg().waitFor({ state: "visible", timeout: 5000 });
  ok(/Adım 1\/3/.test((await dlg().textContent()) ?? ""), `${label}: Aşama 1/3 görünür`);
  await dlg().getByRole("button", { name: "Devam Et" }).click();
  await page.waitForTimeout(300);
  ok(/Adım 2\/3/.test((await dlg().textContent()) ?? ""), `${label}: Aşama 2/3 görünür`);
  const next = dlg().getByRole("button", { name: "Devam Et" });
  ok(await next.isDisabled(), `${label}: ifade yazılmadan Aşama 2 onayı pasif`);
  await dlg().locator("input").first().fill(bulkDeletePhrase(count, false));
  await next.click();
  await page.waitForTimeout(300);
  const t3 = (await dlg().textContent()) ?? "";
  ok(/Son Onay/.test(t3) && t3.includes(`(${count})`), `${label}: Aşama 3 (Son Onay, ${count})`);
  await dlg().getByRole("button", { name: new RegExp(`\\(${count}\\)`) }).click();
}

// ─── Senaryolar ──────────────────────────────────────────────────────────────
async function mineralsDesktop(browser: Browser) {
  section("Mineral Listesi — masaüstü");
  be.reset();
  const ctx = await newContext(browser, DESKTOP);
  const page = await ctx.newPage();
  await page.goto(`${APP}/dogaltas/mineral-listesi`, { waitUntil: "domcontentloaded" });
  await selectAllBtn(page).waitFor({ state: "visible", timeout: 30000 });
  const body = await page.locator("body").innerText();
  ok(!/Görünenleri Seç/.test(body), "\"Görünenleri Seç\" yok");
  ok(/Tümünü Seç \(250\)/.test((await selectAllBtn(page).textContent()) ?? ""), "\"Tümünü Seç (250)\" gerçek toplam");
  ok(!(await clearBtn(page).isVisible().catch(() => false)), "seçim yokken Seçimi Temizle görünmez");

  await selectAllBtn(page).click();
  ok(await waitCount(page, 250), "Tümünü Seç → 250 seçili (yalnız 30 yüklüyken)", await selectedCount(page));
  const cb = clearBtn(page);
  ok(await cb.isVisible() && await cb.isEnabled(), "Seçimi Temizle görünür + aktif");
  ok(/✕/.test((await cb.textContent()) ?? "") && /border-slate-400/.test((await cb.getAttribute("class")) ?? ""), "Seçimi Temizle belirgin stil (✕ + koyu kenarlık)");
  await page.screenshot({ path: path.join(OUT, "mineral-tumu-secili-1366.png") });

  // Word modal: yalnız iki kapsam; seçili Word id'leri = seçim
  await page.getByRole("button", { name: /Word Raporu/ }).first().click();
  await page.waitForTimeout(400);
  const modalText = await page.locator("body").innerText();
  ok(/Tüm Mineraller/.test(modalText), "Word modal: \"Tüm Mineraller\" var");
  ok(/Seçili Mineraller/.test(modalText), "Word modal: \"Seçili Mineraller\" var");
  ok(!/Sadece Görüntülenen|Sadece Filtrelenmiş/.test(modalText), "Word modal: görünenler/filtrelenmiş kapsamı yok");
  await page.locator("label", { hasText: /Seçili Mineraller/ }).first().click();
  await page.getByRole("button", { name: /Rapor Oluştur/ }).first().click();
  await page.waitForTimeout(1200);
  const w = be.wordCalls.at(-1);
  ok(w?.body.exportMode === "selected" && (w.body.mineralIds as string[])?.length === 250, "Seçili Word → 250 id", { mode: w?.body.exportMode, n: (w?.body.mineralIds as string[])?.length });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const closeBtn = page.getByRole("button", { name: /Kapat|✕|×/ }).last();
  if (await page.getByText("Rapor Oluştur").first().isVisible().catch(() => false)) await closeBtn.click().catch(() => {});

  // Temizle
  await clearBtn(page).click();
  ok(await waitCount(page, 0), "Seçimi Temizle → 0");

  // Arama kapsamı: "Sonuçların Tümünü Seç (n)"; kapsam değişince seçim temizlenir
  await page.locator('input[type="search"]').first().fill("Çinko");
  await page.waitForTimeout(1500);
  const lbl = (await page.locator("button", { hasText: /Tümünü Seç \(\d+\)/ }).first().textContent()) ?? "";
  ok(/Sonuçların Tümünü Seç \(50\)/.test(lbl), "arama aktif → \"Sonuçların Tümünü Seç (50)\"", lbl);
  await selectAllBtn(page).click();
  ok(await waitCount(page, 50), "sonuçların tümü → 50 seçili");

  // Silme: Vazgeç → istek yok
  await page.getByRole("button", { name: /Seçilenleri Sil|Sil \(50\)/ }).first().click();
  const dlg = page.locator("[role=dialog], [role=alertdialog]").last();
  await dlg.waitFor({ state: "visible", timeout: 5000 });
  await dlg.getByRole("button", { name: "Vazgeç" }).click();
  await page.waitForTimeout(400);
  ok(be.deleteCalls.length === 0, "3 aşamalı onayda Vazgeç → silme isteği YOK");
  // 3 aşama → silinen = seçim
  await page.getByRole("button", { name: /Seçilenleri Sil|Sil \(50\)/ }).first().click();
  await runThreeStage(page, 50, "mineral silme");
  await page.waitForTimeout(1500);
  const delIds = be.deleteCalls.flatMap((c) => c.ids);
  ok(delIds.length === 50 && delIds.every((id) => Number(id.slice(-12)) % 5 === 1), "silinen id'ler = 50 seçili (Çinko) kayıt", { n: delIds.length });
  ok(be.minerals.length === 200, "arka uçta 200 mineral kaldı");

  // Kapsam değişimi seçim temizler
  await page.locator('input[type="search"]').first().fill("");
  await selectAllBtn(page).waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(1500);
  await selectAllBtn(page).click();
  ok(await waitCount(page, 200), "arama temizlendi → Tümünü Seç (200)");
  await page.locator('input[type="search"]').first().fill("ZZ_Mineral 01");
  await page.waitForTimeout(1500);
  ok(await waitCount(page, 0, 4000), "arama değişince seçim temizlendi (gizli seçim yok)", await selectedCount(page));
  await ctx.close();
}

async function stonesDesktop(browser: Browser) {
  section("Doğaltaş Listesi — masaüstü");
  be.reset();
  const ctx = await newContext(browser, DESKTOP);
  const page = await ctx.newPage();
  await page.goto(`${APP}/dogaltas/dogaltas-listesi`, { waitUntil: "domcontentloaded" });
  await selectAllBtn(page).waitFor({ state: "visible", timeout: 30000 });
  const body = await page.locator("body").innerText();
  ok(!/Görünenleri Seç/.test(body), "\"Görünenleri Seç\" yok");
  ok(/Tümünü Seç \(1200\)/.test((await selectAllBtn(page).textContent()) ?? ""), "\"Tümünü Seç (1200)\" gerçek toplam", await selectAllBtn(page).textContent());
  await selectAllBtn(page).click();
  ok(await waitCount(page, 1200, 30000), "Tümünü Seç → 1200 seçili", await selectedCount(page));
  await page.screenshot({ path: path.join(OUT, "taslar-tumu-secili-1366.png") });

  // Seçili Word → 1200 id
  const wordBtn = page.locator("button", { hasText: /📄.*\(1200\)/ }).first();
  if (await wordBtn.isVisible().catch(() => false)) {
    await wordBtn.click();
    await page.waitForTimeout(1500);
    const w = be.wordCalls.at(-1);
    const ids = (w?.body.selectedStoneIds ?? w?.body.stoneIds ?? w?.body.ids) as string[] | undefined;
    ok(ids?.length === 1200, "Seçili Word → 1200 id", { keys: Object.keys(w?.body ?? {}), n: ids?.length });
  } else ok(false, "Seçili Word butonu görünür");

  // 3 aşama + 1000'lik parçalar
  await page.getByRole("button", { name: /Sil \(1200\)/ }).first().click();
  await runThreeStage(page, 1200, "taş silme");
  await page.waitForTimeout(2500);
  ok(be.deleteCalls.length === 2 && be.deleteCalls[0]!.ids.length === 1000 && be.deleteCalls[1]!.ids.length === 200,
    "1200 silme → 1000 + 200 parça (sunucu sınırı)", be.deleteCalls.map((c) => c.ids.length));
  ok(new Set(be.deleteCalls.flatMap((c) => c.ids)).size === 1200, "parçalar birlikte 1200 benzersiz id");
  ok(be.stones.length === 0, "arka uçta taş kalmadı");

  // Arama kapsamı
  be.reset();
  await page.reload({ waitUntil: "domcontentloaded" });
  await selectAllBtn(page).waitFor({ state: "visible", timeout: 30000 });
  await page.locator('input[type="search"]').first().fill("Ametist");
  await page.waitForTimeout(1800);
  const lbl = (await selectAllBtn(page).textContent()) ?? "";
  ok(/Sonuçların Tümünü Seç \(300\)/.test(lbl), "arama aktif → \"Sonuçların Tümünü Seç (300)\"", lbl);
  await selectAllBtn(page).click();
  ok(await waitCount(page, 300, 20000), "sonuçların tümü → 300 seçili");
  await page.locator('input[type="search"]').first().fill("Ametis");
  await page.waitForTimeout(1800);
  ok(await waitCount(page, 0, 4000), "arama değişince seçim temizlendi", await selectedCount(page));
  await clearBtn(page).isVisible().then((v) => ok(!v, "seçim yokken Seçimi Temizle görünmez"));
  await ctx.close();
}

async function mobile(browser: Browser) {
  section("Mobil 390px");
  for (const route of ["/dogaltas/mineral-listesi", "/dogaltas/dogaltas-listesi"]) {
    be.reset();
    const ctx = await newContext(browser, MOBILE);
    const page = await ctx.newPage();
    await page.goto(`${APP}${route}`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="search"]').first().waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(2000);
    const body = await page.locator("body").innerText();
    ok(!/Görünenleri Seç/.test(body), `${route}: "Görünenleri Seç" yok`);
    ok(!(await selectAllBtn(page).isVisible().catch(() => false)), `${route}: mobilde Tümünü Seç gizli (max-2 kuralı)`);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(sw <= 390, `${route}: yatay taşma yok (scrollWidth=${sw})`);
    await page.screenshot({ path: path.join(OUT, `mobil${route.replace(/\//g, "-")}.png`) });
    await ctx.close();
  }
}

async function kayit(browser: Browser) {
  section("Doğaltaş Kayıt — kamera kaldırıldı, galeri korunur");
  for (const d of [DESKTOP, MOBILE]) {
    be.reset();
    const ctx = await newContext(browser, d);
    const page = await ctx.newPage();
    await page.goto(`${APP}/dogaltas/dogaltas-kayit`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Yeni Kayıt Oluştur/ }).first().click({ timeout: 30000 });
    await page.getByText("Elementler").first().waitFor({ state: "attached", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const txt = await page.locator("body").innerText();
    const gallery = page.getByRole("button", { name: "Galeriden Seç" });
    if (d.mobile) {
      // Mevcut bakım kararı: mobilde (<768px) fotoğraf ekleme gizli — değişmedi.
      ok(!(await gallery.first().isVisible().catch(() => false)), `${d.name}: fotoğraf ekleme mobilde gizli (mevcut karar korunur)`);
    } else {
      ok(await gallery.first().isVisible().catch(() => false), `${d.name}: "Galeriden Seç" görünür`);
    }
    ok(!/Fotoğraf Çek/.test(txt), `${d.name}: "Fotoğraf Çek" yok`);
    ok(await page.locator('input[type="file"][capture]').count() === 0, `${d.name}: kamera (capture) input'u yok`);
    ok(await page.locator('input[type="file"]').count() >= 1, `${d.name}: galeri dosya input'u var`);
    // Atama bölümü akordeonu açılır (varsayılan kapalı).
    const asg = page.locator("button", { hasText: /Atama/ }).filter({ hasText: /Göster/ }).first();
    if (await asg.isVisible().catch(() => false)) { await asg.click(); await page.waitForTimeout(400); }
    // Atama bölümü sekme/akordeon içinde olabilir → DOM'da (gizli dahil) aranır; script etiketleri hariç.
    ok(await page.getByText("Elementler", { exact: true }).count() > 0 || /Elementler/.test(txt), `${d.name}: "Elementler" adı değişmedi`);
    await page.screenshot({ path: path.join(OUT, `kayit-${d.mobile ? "390" : "1366"}.png`), fullPage: false });
    await ctx.close();
  }
}

async function main() {
  const server: ChildProcess = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production" },
  });
  server.stderr?.on("data", (d) => process.stderr.write(`[next] ${d}`));
  let browser: Browser | null = null;
  try {
    await waitHttp(`${APP}/`, 90000);
    browser = await chromium.launch();
    await mineralsDesktop(browser);
    await stonesDesktop(browser);
    await mobile(browser);
    await kayit(browser);
  } catch (e) {
    fail++;
    console.error("HATA:", e);
  } finally {
    await browser?.close().catch(() => {});
    server.kill();
  }
  if (be.unknown.size) console.log(`\n(bilgi) varsayılan yanıtla karşılanan API'ler: ${[...be.unknown].join(", ")}`);
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL — ekran görüntüleri: ${OUT}`);
  process.exit(fail ? 1 : 0);
}
void main();
