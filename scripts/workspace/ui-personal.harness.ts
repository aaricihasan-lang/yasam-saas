/**
 * KİŞİSEL DİJİTAL OFİS (P4) — kişiselleştirme uçtan uca UI testi (Playwright, yerel sunucu, ağ-mock).
 *
 * Prod'a / dış ağa temas YOK. /api/settings/workspace/* istekleri ui-personal-backend.ts ile karşılanır (gerçek şema, durum
 * geçişi, kontrast kapısı ve görsel işleme hattı); diğer /api/* sentetik ZZ verisi; 127.0.0.1 dışı abort.
 * CI listesinde DEĞİL (çalışan sunucu ister). Çalıştırma (scripts/pre-sale-a2b/ui/README.md: fake-supabase-sink + sahte env):
 *   UI_BASE=http://127.0.0.1:3952 [UI_SINK_PORT=54399] [UI_SHOTS=<klasör>] npx tsx scripts/workspace/ui-personal.harness.ts
 * Bölümler: S senaryo ekranları (A/B/C × 4 mod × genişlik) + geometri · E editör akışı · P tercihler/yetki · G güvenlik/hata.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createWorkspaceMock, type WorkspaceMock } from "./ui-personal-backend";
import { DEFAULT_UI_PREFS, parseDesign, type WorkspaceDesign } from "../../lib/workspace/schema";
import { adaptPlacementToMobile } from "../../lib/workspace/mobileAdapt";
import sharp from "sharp";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3952";
const SINK_PORT = process.env.UI_SINK_PORT ?? "54399";
const SHOTS = process.env.UI_SHOTS ?? "";
const SAMPLES = process.env.UI_SAMPLES ?? "C:/YasamSistemi-Gorsel-Tasarim/kisisel-calisma-alani-p0-son-kabul/assets/ornek";
const FIXED_TIME = new Date("2026-11-02T09:30:00+03:00");
const ANDROID_WV_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36";
const FREEZE_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}";

const ALL = ["clients", "appointments", "numerology", "stones", "stok", "sifa_rehberi", "energy_body", "reflexology",
  "aromatherapy", "personal_archive", "belge_ceviri", "human_design", "digital_content", "cosmic_calendar", "cupping",
  "beslenme", "yasam_hafizasi", "astrology"];
const makeUser = (role: "admin" | "expert", keys: string[], demo = false) => ({
  id: role === "admin" ? "00000000-0000-4000-8000-0000000000ad" : "00000000-0000-4000-8000-0000000000e1",
  email: `zz-${role}@example.invalid`, full_name: `ZZ ${role}`, name: `Deniz ${role}`, role, active: true,
  approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a", is_demo_account: demo,
  module_permissions: Object.fromEntries(ALL.map((k) => [k, keys.includes(k)])),
});
const OWNER = makeUser("admin", ALL);
const EXPERT = makeUser("expert", ["clients", "appointments", "numerology", "human_design", "stones"]);
const DEMO = makeUser("expert", ["clients", "numerology"], true);

let pass = 0, fail = 0;
const fails: string[] = [];
function ok(group: string, name: string, cond: boolean, detail: unknown = "") {
  if (cond) pass++; else { fail++; fails.push(`[${group}] ${name}`); }
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail !== "" ? `  → ${String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)}` : ""}`);
}

let browser: Browser;
type Ctx = { ctx: BrowserContext; page: Page; errors: string[]; mock: WorkspaceMock };

async function open(user: ReturnType<typeof makeUser>, mock: WorkspaceMock, vp = { width: 1440, height: 900 }, o: { ua?: string; failChunks?: boolean; failPrefsPut?: boolean } = {}): Promise<Ctx> {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 768, isMobile: Boolean(o.ua), userAgent: o.ua, deviceScaleFactor: 1, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: "2026-11-01T00:00:00.000Z" }));
    } catch { /* */ }
  }, user);
  const isOwner = user.role === "admin";
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port === SINK_PORT || !url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.startsWith("/api/settings/workspace")) {
      if (o.failChunks && /\/chunks\/\d+$/.test(url.pathname)) return route.fulfill({ status: 503, json: { ok: false, error: "Geçici hata." } });
      if (o.failPrefsPut && url.pathname.endsWith("/prefs") && req.method() === "PUT") return route.fulfill({ status: 503, json: { ok: false, error: "Sunucu geçici olarak yanıt vermiyor." } });
      const r = await mock.handle(req.method(), url.pathname, url.searchParams, req.postDataBuffer());
      return r.body ? route.fulfill({ status: r.status, body: r.body, contentType: r.contentType }) : route.fulfill({ status: r.status, json: r.json });
    }
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: user } });
    if (url.pathname.endsWith("/astroloji/access")) return route.fulfill(isOwner ? { status: 200, json: { ok: true } } : { status: 404, json: { error: "not_found" } });
    if (url.pathname.startsWith("/api/beslenme")) return route.fulfill({ status: isOwner ? 200 : 403, json: { ok: true, access: isOwner } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], items: [], count: 0 } });
  });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(FIXED_TIME);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return { ctx, page, errors, mock };
}

async function home(page: Page, opts: { personal?: boolean } = { personal: true }) {
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForSelector('[data-testid="home-hub-grid"] h3', { timeout: 90000 });
  if (opts.personal) await page.waitForSelector('[data-testid="home-view-mode"]', { timeout: 30000 });
  await page.addStyleTag({ content: FREEZE_CSS });
  await settle(page);
}
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  await page.waitForTimeout(700);
}
/** Kişiselleştirme merkezi: Ayarlar → Çalışma Alanım bağlantısının hedefi (/?calisma-alanim=1). */
async function openStudio(page: Page) {
  await page.goto(BASE + "/?calisma-alanim=1", { waitUntil: "load" });
  await page.waitForSelector('[role="dialog"][aria-labelledby="studio-title"]', { timeout: 90000 });
  await page.addStyleTag({ content: FREEZE_CSS });
}
const studio = (page: Page) => page.locator('[role="dialog"][aria-labelledby="studio-title"]');
async function tab(page: Page, name: RegExp) { await studio(page).getByRole("tab", { name }).click(); await page.waitForTimeout(200); }
async function waitFor(cond: () => boolean | Promise<boolean>, ms = 20000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 150)); }
  return false;
}

const design = (v: unknown): WorkspaceDesign => { const r = parseDesign(v, { allowAssets: true }); if (!r.ok) throw new Error(`${r.error} ${r.path}`); return r.value; };

/** Geometri: yatay taşma yok; kişisel logo Yaşam Sistemi logosuna / sol menüye ve karşılama metnine binmez; fotoğraf oranı korunur. */
// Not: tsx/esbuild adlandırılmış iç fonksiyonlara __name ekler; tarayıcıda tanımsız olduğu için ölçüm betiği düz metindir.
const GEOMETRY_JS = `(() => {
  var r = function (el) { return el ? el.getBoundingClientRect() : null; };
  var inter = function (a, b) { return !!a && !!b && a.width > 0 && b.width > 0 && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1; };
  var hscroll = document.documentElement.scrollWidth > window.innerWidth + 1;
  var sideLogo = r(document.querySelector('[data-testid="home-brand-logo"]'));
  var sideEl = document.querySelector('[data-testid="side-menu"]');
  var side = r(sideEl);
  var sideVisible = !!side && side.width > 0 && side.right > 0 && getComputedStyle(sideEl).visibility !== "hidden";
  var logos = Array.from(document.querySelectorAll("img[data-pw-logo]")).map(function (e) { return e.getBoundingClientRect(); }).filter(function (b) { return b.width > 0; });
  var heroText = Array.from(document.querySelectorAll("[data-pw-obstacle]")).map(function (e) { return e.getBoundingClientRect(); });
  var logoOverSide = logos.some(function (b) { return inter(b, sideLogo) || (sideVisible && inter(b, side)); });
  var logoOverText = logos.some(function (b) { return heroText.some(function (t) { return inter(b, t); }); });
  var distorted = Array.from(document.querySelectorAll("img")).filter(function (i) { return i.naturalWidth > 0 && i.getBoundingClientRect().width > 4; }).some(function (i) {
    var cs = getComputedStyle(i);
    if (cs.objectFit === "cover" || cs.objectFit === "contain") return false;
    var b = i.getBoundingClientRect();
    var ar = i.naturalWidth / i.naturalHeight;
    return Math.abs(b.width / b.height - ar) > 0.03 * ar;
  });
  return { hscroll: hscroll, logos: logos.length, logoOverSide: logoOverSide, logoOverText: logoOverText, distorted: distorted, sideLogo: !!sideLogo && sideLogo.width > 0 };
})()`;

/** Geometri: yatay taşma yok; kişisel logo Yaşam Sistemi logosuna / sol menüye ve karşılama metnine binmez; fotoğraf oranı korunur. */
async function geometry(page: Page): Promise<{ hscroll: boolean; logos: number; logoOverSide: boolean; logoOverText: boolean; distorted: boolean; sideLogo: boolean }> {
  return page.evaluate(GEOMETRY_JS);
}

async function seedScenario(mock: WorkspaceMock, name: "varsayilan" | "frekans" | "aile", layout: "A" | "B" | "C") {
  if (name === "varsayilan") { mock.seed({ applied: design({ layout }), prefs: { favorites: ["module:client_journey", "module:human_design", "module:numerology"] } }); return; }
  const logo = await mock.seedAsset("logo", readFileSync(join(SAMPLES, "logo-bedenin-frekansi-yatay.png")), "logo.png", "image/png");
  if (name === "frekans") {
    mock.seed({
      applied: design({
        layout, logo: { assetId: logo, plate: "yok" },
        text: { useGreeting: false, lines: [
          { id: "l1", role: "label", text: "Hoş geldiniz" },
          { id: "l2", role: "quote", text: "“Her beden kendi frekansında iyileşir.”", color: "brand" },
          { id: "l3", role: "body", text: "Beden, zihin ve enerji dengesini birlikte ele alan bütünsel danışmanlık merkezi." },
        ] },
        bg: { mode: "theme", theme: "lavanta" },
        brand: { accent: "#6d28d9", soft: "#f3eefe", ink: "#1e1638", accent2: "#a78bfa", name: "Frekans" },
      }),
      prefs: { favorites: ["module:client_journey", "module:human_design", "module:numerology"] },
    });
    return;
  }
  const photo = await mock.seedAsset("photo", readFileSync(join(SAMPLES, "temsili-aile-fotografi.jpg")), "aile.jpg", "image/jpeg");
  mock.seed({ applied: design({ layout, logo: { assetId: logo, plate: "beyaz" }, bg: { mode: "photo", photoAssetId: photo, tone: "light" } }) });
}

// ── S) Senaryo ekranları + geometri ─────────────────────────────────────────
async function testScenarios() {
  const modes = ["day", "night", "reading", "focus"] as const;
  for (const name of ["varsayilan", "frekans", "aile"] as const) {
    for (const layout of ["A", "B", "C"] as const) {
      for (const width of [1440, 390]) {
        const mock = createWorkspaceMock({ enabled: true });
        await seedScenario(mock, name, layout);
        const c = await open(OWNER, mock, { width, height: width > 640 ? 900 : 844 });
        for (const mode of modes) {
          mock.seed({ prefs: { viewMode: mode } });
          await home(c.page);
          const g = `S-${width}-${name}-${layout}-${mode}`;
          const attr = await c.page.evaluate(() => { const m = document.querySelector("main"); return { mode: m?.getAttribute("data-pw-mode"), layout: m?.getAttribute("data-pw-layout") }; });
          ok(g, "mod + düzen uygulandı", attr.mode === mode && attr.layout === layout, attr);
          const geo = await geometry(c.page);
          ok(g, "yatay taşma yok", !geo.hscroll);
          ok(g, "Yaşam Sistemi logosu görünür ve üzerine logo binmiyor", geo.sideLogo || width <= 900 ? !geo.logoOverSide : false, geo);
          ok(g, "kişisel logo karşılama metnine binmiyor", !geo.logoOverText, geo);
          ok(g, "görsel oranı bozulmuyor", !geo.distorted);
          if (name === "aile" && layout !== "C") {
            await c.page.waitForTimeout(600);
            const rd = await c.page.evaluate("(() => { var e = document.querySelector('[data-pw-readability]'); return e ? { s: e.getAttribute('data-pw-readability'), r: Number(e.getAttribute('data-pw-readability-ratio')) } : null; })()") as { s: string; r: number } | null;
            ok(g, "fotoğraf üzerindeki metin ölçüldü ve okunur (≥ 4,5:1) — ölçülemeyen PASS sayılmaz", !!rd && (rd.s === "pass" || rd.s === "fixed") && rd.r >= 4.5, rd);
          }
          // Okuma modunda karşılama metni büyür; logo seçilen bölgeye sığmazsa P0 Revizyon 2 gereği başka bölgeye taşınmaz ve
          // son geçerli konum yoksa gösterilmez (yalnız düzenlemede uyarı). Bu durum kabul edilen davranıştır.
          if (name !== "varsayilan" && mode !== "reading") ok(g, "kişisel logo çizildi", geo.logos >= 1 || width <= 640, geo);
          if (SHOTS) await c.page.screenshot({ path: join(SHOTS, `${width}-${name}-${layout}-${mode}.png`), fullPage: width <= 640 });
        }
        ok(`S-${width}-${name}-${layout}`, "sayfa hatası yok", c.errors.length === 0, c.errors);
        await c.ctx.close();
      }
    }
  }
  // Ek genişlikler (taşma / bozulma): 320, 375, 1024, 1280 × A/B/C fotoğraflı + Android WebView
  for (const layout of ["A", "B", "C"] as const) {
    const mock = createWorkspaceMock({ enabled: true });
    await seedScenario(mock, "aile", layout);
    mock.seed({ applied: { ...design({ layout }), logo: mock.raw.applied ? (mock.raw.applied as WorkspaceDesign).logo : design({ layout }).logo, bg: { ...(mock.raw.applied as WorkspaceDesign).bg, scope: "page", pageAttach: "scroll" } } as WorkspaceDesign });
    for (const [width, ua] of [[320], [375], [1024], [1280], [390, ANDROID_WV_UA]] as [number, string?][]) {
      const c = await open(OWNER, mock, { width, height: width > 640 ? 900 : 844 }, { ua });
      await home(c.page);
      const g = `S+-${width}${ua ? "-android" : ""}-${layout}-tumsayfa`;
      const geo = await geometry(c.page);
      ok(g, "yatay taşma yok", !geo.hscroll);
      ok(g, "logo menüye / metne binmiyor", !geo.logoOverSide && !geo.logoOverText, geo);
      ok(g, "görsel oranı bozulmuyor", !geo.distorted);
      const bg = await c.page.evaluate(() => {
        const el = document.querySelector('[data-testid="home-page-bg"]');
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { h: b.height + window.scrollY, doc: document.documentElement.scrollHeight };
      });
      ok(g, "tüm sayfa fotoğrafı sayfanın sonuna kadar uzanıyor", !!bg && bg.h >= bg.doc - 2, bg);
      ok(g, "sayfa hatası yok", c.errors.length === 0, c.errors);
      if (SHOTS) await c.page.screenshot({ path: join(SHOTS, `extra-${width}${ua ? "-android" : ""}-${layout}-tumsayfa.png`), fullPage: true });
      await c.ctx.close();
    }
  }
}

// ── E) Editör akışı: yükle → yerleştir → taslak → uygula → geçmiş → sıfırla ─────
async function testEditor() {
  const mock = createWorkspaceMock({ enabled: true });
  mock.seed({ prefs: { hiddenModules: ["center:stok"], favorites: ["module:numerology"] } });
  const c = await open(OWNER, mock);
  const { page } = c;
  await home(page);
  const g = "E-editör";
  ok(g, "kişisel tasarım yokken karşılama varsayılan (home-hero-glow)", (await page.$('[data-testid="home-hero-glow"]')) !== null);
  ok(g, "üst çubukta düzenleme düğmesi yok (Owner kararı)", (await page.$('[data-testid="home-edit-workspace"]')) === null);
  await openStudio(page);
  ok(g, "kişiselleştirme merkezi açıldı", await waitFor(() => studio(page).isVisible(), 30000));
  ok(g, "adres çubuğundan açılış parametresi temizlendi", !page.url().includes("calisma-alanim"), page.url());

  await tab(page, /Logo/);
  const inputs = studio(page).locator('input[type="file"]');
  ok(g, "dosya seçicide capture yok, accept PNG/JPEG/WebP", await inputs.first().evaluate((i: HTMLInputElement) => !i.hasAttribute("capture") && i.accept === "image/png,image/jpeg,image/webp"));
  await inputs.first().setInputFiles(join(SAMPLES, "logo-bedenin-frekansi-yatay.png"));
  ok(g, "logo P2 parçalı yüklemeyle yüklendi", await waitFor(() => mock.assetCount === 1, 30000), mock.log.slice(-5));
  ok(g, "logo taslakta görünüyor (blob görsel)", await waitFor(async () => (await page.$$eval("img[data-pw-logo]", (a) => a.filter((i) => (i as HTMLImageElement).src.startsWith("blob:") && (i as HTMLImageElement).naturalWidth > 0).length)) > 0, 20000));
  ok(g, "Uygula'ya kadar sunucuda uygulanan tasarım yok", mock.raw.applied === null);

  // Fotoğraf: arka plan "Kendi fotoğrafım"
  await studio(page).getByRole("radio", { name: /Kendi fotoğrafım/ }).click().catch(() => {});
  const photoInput = studio(page).locator('input[type="file"]').nth(1);
  if (await photoInput.count()) await photoInput.setInputFiles(join(SAMPLES, "test-panorama-dag.jpg"));
  ok(g, "fotoğraf yüklendi", await waitFor(() => mock.assetCount === 2, 40000), mock.log.slice(-5));

  // Düzen C
  await tab(page, /Marka/);
  await studio(page).getByRole("radio", { name: /Kartvizit Stüdyo/ }).click();
  ok(g, "düzen önizlemede C", await waitFor(async () => (await page.getAttribute("main", "data-pw-layout")) === "C"));
  await studio(page).getByRole("button", { name: /^Taslağı kaydet$/ }).click();
  ok(g, "taslak sunucuya kaydedildi", await waitFor(() => (mock.raw.draft as WorkspaceDesign | null)?.layout === "C"), mock.log.slice(-3));
  await studio(page).getByRole("button", { name: /^Uygula$/ }).click();
  ok(g, "uygulandı (applied C, taslak boş)", await waitFor(() => (mock.raw.applied as WorkspaceDesign | null)?.layout === "C" && mock.raw.draft === null), mock.log.slice(-3));
  ok(g, "panel uygulama sonrası kapandı", await waitFor(async () => !(await studio(page).isVisible())));
  const applied1 = mock.raw.applied as WorkspaceDesign;
  ok(g, "uygulanan tasarım yalnız varlık kimliği içeriyor (yol/URL yok)", !/https?:|\/storage\/|\.png|\.jpg/.test(JSON.stringify(applied1)) && !!applied1.logo.assetId);

  // Yeniden düzenle → B uygula → geçmiş
  await openStudio(page);
  await studio(page).getByRole("radio", { name: /Dijital Ofis/ }).click();
  await studio(page).getByRole("button", { name: /^Uygula$/ }).click();
  ok(g, "ikinci uygulama B, geçmişte 1 kayıt", await waitFor(() => (mock.raw.applied as WorkspaceDesign | null)?.layout === "B" && mock.raw.history.length === 1), { h: mock.raw.history.length });
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector('[data-testid="home-view-mode"]', { timeout: 60000 });
  ok(g, "yeniden yüklemede uygulanan tasarım (B) gösteriliyor", (await page.getAttribute("main", "data-pw-layout")) === "B");

  // Geçmişten dön
  await openStudio(page);
  await tab(page, /Kayıt/);
  await studio(page).getByRole("button", { name: /Bu tasarıma dön/ }).first().click();
  await page.getByRole("button", { name: /Evet, bu tasarıma dön/ }).click();
  ok(g, "geçmişteki tasarıma dönüldü (C)", await waitFor(() => (mock.raw.applied as WorkspaceDesign | null)?.layout === "C"));

  // Vazgeç: kaydedilmemiş değişiklik uyarısı
  await openStudio(page);
  await studio(page).getByRole("radio", { name: /İmza Bandı/ }).click();
  await studio(page).getByRole("button", { name: /Tasarım modundan çık/ }).click();
  ok(g, "kaydedilmemiş değişiklik uyarısı", await page.getByText("Kaydedilmemiş değişiklikler var").isVisible());
  await page.getByRole("button", { name: /Kaydetmeden çık/ }).click();
  ok(g, "kaydetmeden çıkınca uygulanan değişmedi (C)", await waitFor(async () => (await page.getAttribute("main", "data-pw-layout")) === "C" && (mock.raw.applied as WorkspaceDesign).layout === "C"));

  // Kullanılan görsel silinemez (409 where)
  await openStudio(page);
  await tab(page, /Logo/);
  await studio(page).getByRole("button", { name: /Görsellerimi göster/ }).first().click();
  await page.waitForTimeout(600);
  const delBtn = studio(page).getByRole("button", { name: /Sil/ }).first();
  if (await delBtn.count()) {
    await delBtn.click();
    const confirmBtn = page.getByRole("button", { name: /Evet, sil|Sil$/ }).last();
    if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();
  }
  ok(g, "kullanılan görsel silinmedi", await waitFor(() => mock.assetCount === 2, 3000));
  await studio(page).getByRole("button", { name: /Tasarım modundan çık/ }).click();
  if (await page.getByRole("button", { name: /Kaydetmeden çık/ }).isVisible().catch(() => false)) await page.getByRole("button", { name: /Kaydetmeden çık/ }).click();

  // Tasarımımı sıfırla: tercihler korunur
  await openStudio(page);
  await tab(page, /Kayıt/);
  await studio(page).getByTestId("studio-reset-design").click();
  await page.getByRole("button", { name: /^Evet, sıfırla$/ }).click();
  ok(g, "sıfırlama: applied null", await waitFor(() => mock.raw.applied === null));
  ok(g, "sıfırlama: gizlenen modül ve Favorilerim korundu", mock.prefs.hiddenModules.includes("center:stok") && mock.prefs.favorites.includes("module:numerology"), mock.prefs);
  ok(g, "sıfırlama: görseller silinmedi", mock.assetCount === 2);
  ok(g, "sıfırlama sonrası varsayılan karşılama", await waitFor(async () => (await page.$('[data-testid="home-hero-glow"]')) !== null));
  ok(g, "sayfa hatası yok", c.errors.length === 0, c.errors);
  await c.ctx.close();
}

// ── P) Tercihler, yetki ayrımı, görünüm modu kapsamı ───────────────────────────
async function testPrefs() {
  const mock = createWorkspaceMock({ enabled: true });
  // Uzmanın Atlas yetkisi yok: favoride kayıtlı olsa da görünmemeli.
  mock.seed({ prefs: { favorites: ["module:astrology", "module:human_design"] } });
  const c = await open(EXPERT, mock);
  const { page } = c;
  await home(page);
  const g = "P-tercih";
  const favText = await page.getByTestId("home-favorites").innerText().catch(() => "");
  ok(g, "yetkisiz modül favoride görünmez", !/Atlas|Gökyüzü/i.test(favText) && /Human Design/i.test(favText), favText);
  const cardsBefore = await page.$$eval('[data-testid="home-hub-grid"] h3', (h) => h.map((x) => x.textContent?.trim()));
  const linksBefore = await page.$$eval('[data-testid="side-menu"] a', (a) => a.map((x) => x.getAttribute("href")));

  await openStudio(page);
  await tab(page, /Modüller/);
  await studio(page).getByRole("button", { name: /Merkezi gizle: Danışan Yolculuğu/ }).click().catch(async () => {
    await studio(page).getByRole("checkbox", { name: /Danışan Yolculuğu/ }).first().click();
  });
  ok(g, "merkez gizleme anında kaydedildi (taslaktan bağımsız)", await waitFor(() => mock.prefs.hiddenModules.includes("center:clients")), mock.prefs);
  ok(g, "tasarım taslağı değişmedi", mock.raw.draft === null && mock.raw.applied === null);
  await studio(page).getByRole("button", { name: /Tasarım modundan çık/ }).click();
  const cardsAfter = await page.$$eval('[data-testid="home-hub-grid"] h3', (h) => h.map((x) => x.textContent?.trim()));
  ok(g, "gizlenen merkez kartı ana sayfada yok", !cardsAfter.includes("Danışan Yolculuğu") && cardsBefore.includes("Danışan Yolculuğu"), cardsAfter);
  const linksAfter = await page.$$eval('[data-testid="side-menu"] a', (a) => a.map((x) => x.getAttribute("href")));
  ok(g, "gizleme yetkiyi/menüyü değiştirmez (menü bağlantıları aynı)", JSON.stringify(linksBefore) === JSON.stringify(linksAfter), { linksBefore, linksAfter });
  await page.goto(BASE + "/danisan-yolculugu", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  ok(g, "gizlenen modülün sayfası hâlâ açılıyor (yetki aynı)", new URL(page.url()).pathname.startsWith("/danisan-yolculugu"), page.url());

  // Görünüm modu yalnız ana sayfa
  await home(page);
  await page.getByTestId("home-view-mode").click();
  await page.getByRole("menuitemradio", { name: /Gece/ }).click().catch(async () => { await page.getByRole("radio", { name: /Gece/ }).click(); });
  ok(g, "Gece modu kaydedildi ve uygulandı", await waitFor(async () => mock.prefs.viewMode === "night" && (await page.getAttribute("main", "data-pw-mode")) === "night"), mock.prefs.viewMode);
  await page.goto(BASE + "/danisan-yolculugu", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const inner = await page.evaluate(() => ({ pw: document.querySelectorAll("[data-pw-mode]").length, bg: getComputedStyle(document.body).backgroundColor }));
  ok(g, "iç modül ekranında görünüm modu yok", inner.pw === 0, inner);
  ok(g, "sayfa hatası yok", c.errors.length === 0, c.errors);
  await c.ctx.close();

  // Favori sınırı / sıralama (Owner, tüm yetkiler)
  const m2 = createWorkspaceMock({ enabled: true });
  const c2 = await open(OWNER, m2);
  await home(c2.page);
  await openStudio(c2.page);
  await tab(c2.page, /Modüller/);
  const addBtns = studio(c2.page).getByRole("button", { name: /Favorilere ekle/ });
  const n = await addBtns.count();
  for (let i = 0; i < Math.min(n, 10); i++) {
    const b = studio(c2.page).getByRole("button", { name: /Favorilere ekle/ }).first();
    if (!(await b.isEnabled().catch(() => false))) break;
    await b.click();
    await waitFor(() => m2.prefs.favorites.length === i + 1, 5000);
  }
  ok("P-favori", "en fazla 8 favori", m2.prefs.favorites.length === 8, m2.prefs.favorites);
  const first = m2.prefs.favorites[0];
  await studio(c2.page).getByRole("button", { name: /Favoriyi aşağı taşı/ }).first().click();
  ok("P-favori", "favori sıralaması değişti", await waitFor(() => m2.prefs.favorites[1] === first), m2.prefs.favorites);
  await studio(c2.page).getByRole("button", { name: /Tasarım modundan çık/ }).click();
  const chips = await c2.page.$$eval('[data-testid="home-favorites"] a', (a) => a.map((x) => x.getAttribute("href")));
  ok("P-favori", "ana sayfada 8 favori, kullanıcı sırasıyla", chips.length === 8, chips);
  await c2.ctx.close();
}

// ── R) Ayarlar erişimi · tam sıfırlama · yalnız tasarım · mobil eşitleme ──────────────────
/** Üst çubuk (dil / ayar / çıkış + mod seçici) dışındaki bölgede iki ekran görüntüsü arasında güçlü fark var mı? */
async function strongDiff(a: Buffer, b: Buffer, skipTop: number): Promise<{ strong: number; size: string }> {
  const [x, y] = await Promise.all([sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true })]);
  if (x.info.width !== y.info.width || x.info.height !== y.info.height) return { strong: -1, size: `${x.info.width}x${x.info.height} ≠ ${y.info.width}x${y.info.height}` };
  let strong = 0;
  for (let i = skipTop * x.info.width * 4; i < x.data.length; i += 4) {
    const d = Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2]));
    if (d > 16) strong++;
  }
  return { strong, size: `${x.info.width}x${x.info.height}` };
}

async function testResetMobile() {
  const P = SAMPLES;
  // Ayarlar → Çalışma Alanım (erişim var)
  {
    const mock = createWorkspaceMock({ enabled: true });
    const c = await open(OWNER, mock);
    await c.page.goto(BASE + "/settings", { waitUntil: "load" });
    await c.page.getByRole("button", { name: /Çalışma Alanım/ }).click({ timeout: 90000 });
    await c.page.getByTestId("settings-open-workspace").click();
    ok("R-ayarlar", "Ayarlar → Çalışma Alanım → kişiselleştirme merkezi açılır", await waitFor(() => studio(c.page).isVisible(), 90000));
    await c.ctx.close();
    const off = createWorkspaceMock({ enabled: false });
    const o = await open(OWNER, off);
    await o.page.goto(BASE + "/settings", { waitUntil: "load" });
    await o.page.waitForSelector("text=Hesap Güvenliği", { timeout: 90000 });
    await o.page.waitForTimeout(1500);
    ok("R-ayarlar", "bayrak kapalı / erişim yok: Çalışma Alanım sekmesi yok, diğer sekmeler aynı", (await o.page.getByRole("button", { name: /Çalışma Alanım/ }).count()) === 0 && (await o.page.getByRole("button", { name: /Geri Yükleme/ }).count()) === 1);
    await o.ctx.close();
  }

  // Tam sıfırlama: ilk günkü ana ekran (P3 varsayılanı ile görsel karşılaştırma)
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const g = `R-tamsifir-${vp.width}`;
    const mock = createWorkspaceMock({ enabled: true });
    const logo = await mock.seedAsset("logo", readFileSync(join(P, "logo-bedenin-frekansi-yatay.png")), "logo.png", "image/png");
    const photo = await mock.seedAsset("photo", readFileSync(join(P, "temsili-aile-fotografi.jpg")), "aile.jpg", "image/jpeg");
    mock.seed({ applied: design({ layout: "B" }) });
    mock.seed({ applied: design({ layout: "C", logo: { assetId: logo }, bg: { mode: "photo", photoAssetId: photo, scope: "page" }, brand: { accent: "#6d28d9", soft: "#f3eefe", ink: "#1e1638" } }), prefs: { hiddenModules: ["center:stok", "module:reflexology"], favorites: ["module:numerology", "module:human_design"], viewMode: "night", cardLevel: "center", reading: { scale: 1.3, lineHeight: 1.9, width: 80 } } });
    // geçmişe bir kayıt düşsün (uygulanan B → C)
    mock.seed({});
    const historyBefore = mock.raw.history.length;
    const c = await open(OWNER, mock, vp);
    await openStudio(c.page);
    await tab(c.page, /Kayıt/);
    await studio(c.page).getByTestId("studio-reset-all").click();
    const dlg = await c.page.getByRole("alertdialog").innerText();
    ok(g, "onay penceresi sıfırlanacakları ve korunanları açıkça listeliyor", /Favorilerim listesi temizlenir/.test(dlg) && /Görünüm modu Otomatik/.test(dlg) && /Korunanlar/.test(dlg) && /tasarım geçmişi/.test(dlg), dlg.slice(0, 200));
    await c.page.getByRole("button", { name: /Evet, ilk günkü ana ekrana dön/ }).click();
    ok(g, "tasarım kaldırıldı (applied + taslak null)", await waitFor(() => mock.raw.applied === null && mock.raw.draft === null));
    ok(g, "tercihler başlangıçta (gizleme / Favorilerim / mod / okuma)", await waitFor(() => JSON.stringify(mock.prefs) === JSON.stringify(DEFAULT_UI_PREFS)), mock.prefs);
    ok(g, "tasarım geçmişi ve görseller korundu", mock.raw.history.length >= historyBefore && mock.raw.history.length >= 1 && mock.assetCount === 2, { h: mock.raw.history.length, a: mock.assetCount });
    ok(g, "dürüst başarı bildirimi", await waitFor(async () => /İlk günkü Yaşam Sistemi ana ekranına dönüldü/.test(await c.page.innerText("body")), 5000));
    await c.page.reload({ waitUntil: "load" });
    await c.page.waitForSelector('[data-testid="home-hub-grid"] h3', { timeout: 90000 });
    await c.page.waitForSelector('[data-testid="home-view-mode"]', { timeout: 30000 });
    await c.page.addStyleTag({ content: FREEZE_CSS });
    await settle(c.page);
    const after = await c.page.evaluate(() => ({ pw: document.querySelectorAll("[data-pw-mode],[data-pw-part],[data-testid=home-favorites],[data-testid=home-page-bg]").length, main: document.querySelector("main")?.getAttribute("data-pw-mode") + "|" + document.querySelector("main")?.getAttribute("data-pw-layout") + "|" + location.href, cards: [...document.querySelectorAll('[data-testid="home-hub-grid"] h3')].map((h) => h.textContent?.trim()) }));
    ok(g, "F5 sonrası kişisel katman yok, gizlenen merkez yeniden görünür", after.pw === 0 && after.cards.includes("Ürün & Stok Merkezi"), after);
    await c.page.mouse.move(0, 0); // tıklamadan kalan imleç kartı hover hâlinde tutmasın
    await c.page.waitForTimeout(300);
    const shotOn = await c.page.screenshot({ fullPage: true });
    await c.ctx.close();
    const offMock = createWorkspaceMock({ enabled: false });
    const o = await open(OWNER, offMock, vp);
    await home(o.page, { personal: false });
    const shotOff = await o.page.screenshot({ fullPage: true });
    await o.ctx.close();
    const d = await strongDiff(shotOn, shotOff, vp.width > 900 ? 72 : 120);
    ok(g, "ilk günkü ana ekran = P3 varsayılan ana ekranı (üst çubuk hariç güçlü fark 0)", d.strong === 0, d);
    if (SHOTS) { await sharp(shotOn).toFile(join(SHOTS, `reset-all-${vp.width}.png`)); await sharp(shotOff).toFile(join(SHOTS, `p3-default-${vp.width}.png`)); }
  }

  // Kısmi başarısızlık: tercih kaydı düşerse sahte başarı yok
  {
    const mock = createWorkspaceMock({ enabled: true });
    mock.seed({ applied: design({ layout: "C" }), prefs: { favorites: ["module:numerology"] } });
    const c = await open(OWNER, mock, { width: 1440, height: 900 }, { failPrefsPut: true });
    await openStudio(c.page);
    await tab(c.page, /Kayıt/);
    await studio(c.page).getByTestId("studio-reset-all").click();
    await c.page.getByRole("button", { name: /Evet, ilk günkü ana ekrana dön/ }).click();
    const txt = await waitFor(async () => /sıfırlanamadı/.test(await c.page.innerText("body")), 10000);
    ok("R-kismi", "tercih kaydı başarısız: açık hata, başarı mesajı yok", txt && !/İlk günkü Yaşam Sistemi ana ekranına dönüldü/.test(await c.page.innerText("body")));
    ok("R-kismi", "favoriler korunmuş (yanlış 'sıfırlandı' yok)", mock.prefs.favorites.includes("module:numerology"));
    await c.ctx.close();
  }

  // Masaüstü → mobil: "Evet" ve "Hayır"
  for (const answer of ["yes", "no"] as const) {
    const g = `R-mobil-${answer}`;
    const mock = createWorkspaceMock({ enabled: true });
    const logo = await mock.seedAsset("logo", readFileSync(join(P, "logo-bedenin-frekansi-yatay.png")), "logo.png", "image/png");
    const photo = await mock.seedAsset("photo", readFileSync(join(P, "test-panorama-dag.jpg")), "dag.jpg", "image/jpeg");
    const mobile0 = { zone: "toolbar" as const, x: 0.5, y: 0.5, w: 0.9 };
    mock.seed({ applied: design({ layout: "A", logo: { assetId: logo, layout: { desktop: { zone: "hero", x: 1, y: 0.5, w: 0.22 }, mobile: mobile0 } }, bg: { mode: "photo", photoAssetId: photo, focus: { x: 0.3, y: 0.6 }, mobileFocus: { x: 0.9, y: 0.1 }, separateMobile: true } }) });
    const before = mock.assetCount;
    const c = await open(OWNER, mock);
    await openStudio(c.page);
    await studio(c.page).getByRole("radio", { name: /Kartvizit Stüdyo/ }).click();
    await studio(c.page).getByRole("button", { name: /^Uygula$/ }).click();
    const q = c.page.getByRole("alertdialog");
    ok(g, "masaüstünde 'mobile de uygulansın mı?' sorusu", await waitFor(async () => /mobil görünümünüze de uygulamak/.test(await q.innerText().catch(() => ""))));
    ok(g, "ortak ve cihaza özel ayarlar ayrı listeleniyor", /Ortak/.test(await q.innerText()) && /Cihaza özel/.test(await q.innerText()));
    await c.page.getByRole("button", { name: answer === "yes" ? /Evet, mobilde de uygula/ : /Hayır, mobil tasarımım ayrı kalsın/ }).click();
    ok(g, "uygulandı", await waitFor(() => (mock.raw.applied as WorkspaceDesign | null)?.layout === "C"));
    const ap = mock.raw.applied as WorkspaceDesign;
    if (answer === "yes") {
      const exp = adaptPlacementToMobile(ap.logo.layout.desktop, ap);
      ok(g, "mobil logo masaüstünden UYARLANDI (kopyalanmadı)", JSON.stringify(ap.logo.layout.mobile) === JSON.stringify(exp) && ap.logo.layout.mobile.w !== ap.logo.layout.desktop.w, ap.logo.layout);
      ok(g, "mobil fotoğraf odağı masaüstünü izliyor", ap.bg.separateMobile === false && ap.bg.mobileFocus.x === 0.3);
    } else {
      ok(g, "mobil yerleşim ve odak AYNEN korundu", JSON.stringify(ap.logo.layout.mobile) === JSON.stringify(mobile0) && ap.bg.separateMobile === true && ap.bg.mobileFocus.x === 0.9, ap.logo.layout);
    }
    ok(g, "görseller yeniden yüklenmedi", mock.assetCount === before && ap.logo.assetId === logo && ap.bg.photoAssetId === photo);
    await c.ctx.close();
    // Mobil sonuç: 390 ve Android WebView'de logo güvenli
    for (const ua of [undefined, ANDROID_WV_UA]) {
      const m = await open(OWNER, mock, { width: 390, height: 844 }, { ua });
      await home(m.page);
      const geo = await geometry(m.page);
      ok(`${g}-390${ua ? "-android" : ""}`, "mobilde taşma yok, logo menüye/metne binmiyor, oran korunuyor", !geo.hscroll && !geo.logoOverSide && !geo.logoOverText && !geo.distorted, geo);
      if (answer === "yes") ok(`${g}-390${ua ? "-android" : ""}`, "uyarlanan logo mobilde çizildi", geo.logos >= 1, geo);
      if (SHOTS) await m.page.screenshot({ path: join(SHOTS, `mobile-sync-${answer}-390${ua ? "-android" : ""}.png`), fullPage: false });
      await m.ctx.close();
    }
  }
}

// ── G) Güvenlik / hata durumları ────────────────────────────────────────────
async function testGuards() {
  // Demo: yazma yok
  const md = createWorkspaceMock({ enabled: true, demo: true });
  const d = await open(DEMO, md);
  await home(d.page);
  ok("G-demo", "üst çubukta düzenleme düğmesi yok", (await d.page.$('[data-testid="home-edit-workspace"]')) === null);
  await d.page.goto(BASE + "/?calisma-alanim=1", { waitUntil: "load" });
  await d.page.waitForSelector('[data-testid="home-view-mode"]', { timeout: 60000 });
  await d.page.waitForTimeout(2500);
  ok("G-demo", "demo hesapta kişiselleştirme merkezi açılmaz", (await d.page.$('[role="dialog"][aria-labelledby="studio-title"]')) === null);
  await d.page.goto(BASE + "/settings", { waitUntil: "load" });
  await d.page.getByRole("button", { name: /Çalışma Alanım/ }).click({ timeout: 60000 });
  ok("G-demo", "Ayarlar → Çalışma Alanım: demo uyarısı, düzenleme bağlantısı yok", await waitFor(async () => /yalnız görüntülenebilir/.test(await d.page.innerText("body"))) && (await d.page.$('[data-testid="settings-open-workspace"]')) === null);
  ok("G-demo", "hiç yazma isteği yapılmadı", md.log.every((l) => l.method === "GET"), md.log);
  await d.ctx.close();

  // Bayrak kapalı: kişiselleştirme öğesi yok, yalnız tek 404 yoklaması
  const mo = createWorkspaceMock({ enabled: false });
  const o = await open(OWNER, mo);
  await home(o.page, { personal: false });
  await o.page.waitForTimeout(1500);
  const off = await o.page.evaluate(() => ({ edit: !!document.querySelector('[data-testid="home-edit-workspace"]'), fav: !!document.querySelector('[data-testid="home-favorites"]'), pw: document.querySelectorAll("[data-pw-mode],[data-pw-part]").length, glow: !!document.querySelector('[data-testid="home-hero-glow"]') }));
  ok("G-kapalı", "bayrak kapalı: kişiselleştirme öğesi yok, varsayılan karşılama", !off.edit && !off.fav && off.pw === 0 && off.glow, off);
  ok("G-kapalı", "bayrak kapalı: yalnız tek tasarım yoklaması (404), tercih/görsel isteği yok", mo.log.length === 1 && mo.log[0].path.endsWith("/design") && mo.log[0].status === 404, mo.log);
  await o.ctx.close();

  // Yükleme hataları
  const mu = createWorkspaceMock({ enabled: true });
  const u = await open(OWNER, mu, { width: 1440, height: 900 }, { failChunks: true });
  await home(u.page);
  await openStudio(u.page);
  await tab(u.page, /Logo/);
  const inp = studio(u.page).locator('input[type="file"]').first();
  await inp.setInputFiles({ name: "IMG_0001.HEIC", mimeType: "image/heic", buffer: Buffer.from("ftypheic0000") });
  ok("G-yükleme", "HEIC için anlaşılır yönlendirme", await waitFor(async () => /HEIC/.test(await studio(u.page).innerText()), 5000));
  await inp.setInputFiles({ name: "buyuk.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 10, 1) });
  ok("G-yükleme", "logo 2 MB sınırı", await waitFor(async () => /2 MB/.test(await studio(u.page).innerText()), 5000));
  await inp.setInputFiles(join(SAMPLES, "logo-kare-ornek.png"));
  ok("G-yükleme", "ağ/sunucu hatasında anlaşılır hata, görsel oluşmadı", await waitFor(async () => /yüklenemedi|Bağlantı|Geçici|başarısız/i.test(await studio(u.page).innerText()), 20000) && mu.assetCount === 0);
  ok("G-yükleme", "başarısız yükleme oturumu iptal edildi", mu.log.some((l) => l.method === "DELETE" && /\/uploads\//.test(l.path)), mu.log.slice(-4));
  await u.ctx.close();

  // Sürüm çakışması (çift sekme)
  const mv = createWorkspaceMock({ enabled: true });
  const v = await open(OWNER, mv);
  await home(v.page);
  await openStudio(v.page);
  mv.seed({ applied: design({ layout: "B" }) }); // başka sekme uyguladı
  await studio(v.page).getByRole("radio", { name: /Kartvizit Stüdyo/ }).click();
  await studio(v.page).getByRole("button", { name: /^Taslağı kaydet$/ }).click();
  ok("G-çakışma", "409 çakışma uyarısı gösterildi, veri ezilmedi", await waitFor(async () => /başka bir sekmede/i.test(await v.page.innerText("body"))) && (mv.raw.applied as WorkspaceDesign).layout === "B" && mv.raw.draft === null);
  await v.ctx.close();
}

(async () => {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  browser = await chromium.launch();
  try {
    const only = process.env.UI_ONLY ?? "SEPGR";
    if (only.includes("G")) await testGuards();
    if (only.includes("R")) await testResetMobile();
    if (only.includes("E")) await testEditor();
    if (only.includes("P")) await testPrefs();
    if (only.includes("S")) await testScenarios();
  } finally {
    await browser.close();
  }
  console.log(`\nworkspace ui-personal: ${pass} PASS / ${fail} FAIL`);
  if (fails.length) console.log(fails.join("\n"));
  if (fail) process.exit(1);
})();
