/**
 * UZMAN PROFİLİ (F2) — Ayarlar → Profilim → "Rapor logosu" UI testi (Playwright; yerel production build + `next start`; API mock'lu).
 *
 * Prod'a / dış ağa temas YOK: /api/settings/profile, /api/settings/profile/logo ve Kişisel Dijital Ofis görsel uçları
 * bellekte durum tutan sahte arka uçtur (GERÇEK lib/profile/schema + logoSchema doğrulaması, ORTAK sürüm kuralı);
 * 127.0.0.1 dışı istekler abort. Logolar sharp ile üretilen sentetik görsellerdir. CI listesinde DEĞİL (build + sunucu ister).
 *   UI_BASE=http://127.0.0.1:3984 UI_OUT=<klasör> npx tsx scripts/profile/ui-logo.harness.ts
 * Bölümler:
 *   V  320 / 375 / 390 / 768 / 1024 / 1280 / 1440: ekran görüntüsü + yatay taşma yok + önizleme kartları ekran içinde
 *   S  seçim akışı: Logo kullanma → ayrı logo (listeden) → kaydet → yenile → kalıcı; çalışma alanı logosu; ortak sürüm
 *      (logo kaydı sonrası profil formu kaydı 409 vermez); bekleyen seçim "kaydedilmemiş" sayılır
 *   P  önizleme: yatay / dikey / kare / şeffaf sentetik logolar (Owner için ekran görüntüleri); YS logosu kapakta korunur
 *   U  yükleme: mevcut parçalı yükleme akışı → yeni logo listeye eklenir ve seçilir; istemci ön kontrolü (SVG reddi)
 *   H  hata hâlleri: silinmiş logo (missing) uyarısı, 400 LOGO_ASSET_INVALID, 409 çakışma, workspace_empty, yükleme hatası
 *   A  erişim kapalı: seçenekler yok + açıklama; önceki seçim kaldırılabilir
 *   D  demo: seçenekler kilitli, kaydet yok, PUT yok
 *   B  Firefox + WebKit: 390 px taşma yok + seçim kaydı
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { chromium, firefox, webkit, type Browser, type BrowserContext, type BrowserType, type Page, type Route } from "playwright";
import { EMPTY_PROFILE, parseExpectedVersion, parseProfilePatch, type ProfileFields } from "../../lib/profile/schema";
import { parseLogoSelection, type LogoSourceValue } from "../../lib/profile/logoSchema";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3984";
const OUT = process.env.UI_OUT ?? "profil-logo-ui";
mkdirSync(OUT, { recursive: true });
const FREEZE_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}";
const USER = {
  id: "00000000-0000-4000-8000-0000000000f2", email: "ayse.yilmaz@example.invalid", full_name: "Ayşe Yılmaz", name: "Ayşe", role: "expert",
  active: true, approval_status: "approved", package_type: "premium", membership_status: "active", tenant_id: "aaaaaaaa-0000-4000-8000-0000000000f2",
  is_demo_account: false, module_permissions: { clients: true, numerology: true, human_design: true },
};

let pass = 0, fail = 0;
const fails: string[] = [];
function ok(group: string, name: string, cond: boolean, detail: unknown = "") {
  if (cond) pass++; else { fail++; fails.push(`[${group}] ${name}`); }
  console.log(`${cond ? "PASS" : "FAIL"} [${group}] ${name}${!cond && detail !== "" ? `  → ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
}

// ── Sentetik logolar (sharp) ─────────────────────────────────────────────────
type Fixture = { id: string; label: string; webp: Buffer; w: number; h: number };
const svgLogo = (w: number, h: number, body: string, bg = "none") =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${bg}"/>${body}</svg>`);
async function fixture(id: string, label: string, svg: Buffer): Promise<Fixture> {
  const { data, info } = await sharp(svg).resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toBuffer({ resolveWithObject: true });
  return { id, label, webp: data, w: info.width, h: info.height };
}
const MARK = (cx: number, cy: number, r: number) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#0f6b5a" stroke-width="${r / 4}"/><path d="M${cx - r / 2} ${cy + r / 5} Q ${cx} ${cy - r / 1.6} ${cx + r / 2} ${cy + r / 5}" fill="none" stroke="#0f6b5a" stroke-width="${r / 6}"/>`;

type AssetView = { id: string; kind: "logo"; createdAt: string; original: { format: string; bytes: number; width: number; height: number }; desktop: { width: number; height: number; bytes: number; url: string }; mobile: { width: number; height: number; bytes: number; url: string } };
const viewOf = (f: Fixture, i: number): AssetView => ({
  id: f.id, kind: "logo", createdAt: `2026-11-0${(i % 9) + 1}T09:00:00.000Z`,
  original: { format: "png", bytes: f.webp.length, width: f.w, height: f.h },
  desktop: { width: f.w, height: f.h, bytes: f.webp.length, url: `/api/settings/workspace/assets/${f.id}?v=desktop` },
  mobile: { width: f.w, height: f.h, bytes: f.webp.length, url: `/api/settings/workspace/assets/${f.id}?v=mobile` },
});

type Inject = { status: number; json: Record<string, unknown> } | null;
function createMock(fx: Fixture[], opts: { demo?: boolean; access?: boolean; wsLogo?: string | null } = {}) {
  let profile: ProfileFields = {
    ...EMPTY_PROFILE, title: "Refleksoloji Uzmanı", organization: "Ayşe Yılmaz Yaşam Merkezi", phone: "+90 532 000 00 00",
    contactEmail: "ayse.yilmaz@example.invalid", website: "https://www.ornek-yasam-merkezi.example", reportBrandingEnabled: true,
  };
  let version = 1;
  let source: LogoSourceValue = "none";
  let assetId: string | null = null;
  const assets = new Map(fx.map((f) => [f.id, f]));
  const order = fx.map((f) => f.id);
  const log: { path: string; method: string; status: number; body?: unknown }[] = [];
  let upload: { id: string; chunks: Buffer[] } | null = null;
  let seq = 0;
  const m = {
    access: opts.access !== false,
    wsLogo: opts.wsLogo ?? null,
    nextLogoPut: null as Inject,
    nextComplete: null as Inject,
    log,
    state: () => ({ profile, version, source, assetId }),
    /** Başka sekmede / cihazda değişiklik benzetimi. */
    bumpLogo(s: LogoSourceValue, id: string | null) { source = s; assetId = id; version++; },
    setLogo(s: LogoSourceValue, id: string | null) { source = s; assetId = id; },
    deleteAsset(id: string) { assets.delete(id); },
    status(): string {
      if (source === "none") return "none";
      if (!m.access) return "access_off";
      if (source === "custom") return assetId && assets.has(assetId) ? "ok" : "missing";
      return m.wsLogo ? "ok" : "workspace_empty";
    },
    profileView: () => ({ ok: true, profile: { ...profile, logoSource: source, logoAssetId: assetId }, version, updatedAt: "2026-11-10T09:00:00.000Z", account: { fullName: USER.full_name, email: USER.email }, readOnly: !!opts.demo }),
    logoView: () => ({ ok: true, logo: { source, assetId: source === "custom" ? assetId : null, status: m.status() }, workspace: { access: m.access, logoAssetId: m.access ? m.wsLogo : null }, checkFailed: false, brandingEnabled: profile.reportBrandingEnabled, version, updatedAt: null, readOnly: !!opts.demo }),
    async handle(route: Route): Promise<void> {
      const req = route.request();
      const url = new URL(req.url());
      const p = url.pathname;
      const method = req.method();
      const done = (status: number, json: unknown, body?: unknown) => { log.push({ path: p, method, status, body }); return route.fulfill({ status, json }); };
      let body: Record<string, unknown> = {};
      if (method !== "GET" && !p.includes("/chunks/")) { try { body = JSON.parse(req.postData() ?? "{}"); } catch { /* */ } }
      if (p === "/api/settings/profile") {
        if (method === "GET") return done(200, m.profileView());
        if (opts.demo) return done(403, { ok: false, demo: true, error: "Demo hesabı salt okunurdur." }, body);
        const ev = parseExpectedVersion(body.expectedVersion);
        const pp = parseProfilePatch(body.profile);
        if (!ev.ok || !pp.ok) return done(400, { ok: false, error: "Geçersiz." }, body);
        if (ev.value !== version) return done(409, { ...m.profileView(), ok: false, code: "VERSION_CONFLICT", error: "Profiliniz başka bir sekmede değişti." }, body);
        profile = { ...profile, ...pp.value }; version++;
        return done(200, m.profileView(), body);
      }
      if (p === "/api/settings/profile/logo") {
        if (method === "GET") return done(200, m.logoView());
        if (opts.demo) return done(403, { ok: false, demo: true, error: "Demo hesabı salt okunurdur." }, body);
        if (m.nextLogoPut) { const r = m.nextLogoPut; m.nextLogoPut = null; return done(r.status, r.json, body); }
        const sel = parseLogoSelection(body);
        if (!sel.ok) return done(400, { ok: false, error: sel.error, path: sel.path }, body);
        if (sel.value.source !== "none" && !m.access) return done(403, { ok: false, code: "LOGO_ACCESS_OFF", error: "Erişim kapalı." }, body);
        if (sel.value.source === "custom" && !assets.has(sel.value.assetId!)) return done(400, { ok: false, code: "LOGO_ASSET_INVALID", error: "Logo bulunamadı veya kullanılamıyor. Listeden yeniden seçin.", path: "assetId" }, body);
        if (sel.expectedVersion !== version) return done(409, { ...m.logoView(), ok: false, code: "VERSION_CONFLICT", error: "Profiliniz başka bir sekmede değişti." }, body);
        source = sel.value.source; assetId = sel.value.assetId; version++;
        return done(200, m.logoView(), body);
      }
      if (p.startsWith("/api/settings/workspace")) {
        if (!m.access) return done(404, { ok: false, error: "Bulunamadı." });
        if (p === "/api/settings/workspace/design") return done(200, { ok: true, design: { applied: null, draft: null, history: [], schemaVersion: 1, version: 0, updatedAt: null } });
        if (p === "/api/settings/workspace/prefs") return done(200, { ok: true, prefs: { hiddenModules: [], favorites: [], cardLevel: "center", viewMode: "auto", reading: { scale: 1.15, lineHeight: 1.7, width: 68 }, schemaVersion: 1, version: 0, updatedAt: null } });
        if (p === "/api/settings/workspace/assets" && method === "GET") return done(200, { ok: true, assets: order.filter((id) => assets.has(id)).map((id, i) => viewOf(assets.get(id)!, i)) });
        if (p === "/api/settings/workspace/assets/uploads" && method === "POST") {
          if (opts.demo) return done(403, { ok: false, demo: true, error: "Demo." });
          upload = { id: `00000000-0000-4000-8000-${String(900000000000 + ++seq)}`, chunks: [] };
          return done(200, { ok: true, uploadId: upload.id, chunkSize: 3 * 1024 * 1024, chunkCount: 1, expiresAt: "2026-11-10T10:00:00.000Z" }, body);
        }
        if (upload && p === `/api/settings/workspace/assets/uploads/${upload.id}/chunks/0`) {
          upload.chunks.push(req.postDataBuffer() ?? Buffer.alloc(0));
          return done(200, { ok: true, index: 0 });
        }
        if (upload && p === `/api/settings/workspace/assets/uploads/${upload.id}/complete`) {
          if (m.nextComplete) { const r = m.nextComplete; m.nextComplete = null; return done(r.status, r.json); }
          const f = await fixture(upload.id, "yüklenen", Buffer.concat(upload.chunks));
          assets.set(f.id, f); order.unshift(f.id);
          return done(200, { ok: true, asset: viewOf(f, 0) });
        }
        const am = /^\/api\/settings\/workspace\/assets\/([0-9a-f-]{36})$/.exec(p);
        if (am && method === "GET") {
          const f = assets.get(am[1]);
          if (!f) return done(404, { ok: false, code: "not_found", error: "Görsel bulunamadı." });
          log.push({ path: p, method, status: 200 });
          return route.fulfill({ status: 200, body: f.webp, headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store" } });
        }
        return done(404, { ok: false, code: "not_found", error: "Bulunamadı." });
      }
      return done(200, { ok: true, rows: [], items: [], count: 0, messages: [] });
    },
  };
  return m;
}
type Mock = ReturnType<typeof createMock>;

type Ctx = { ctx: BrowserContext; page: Page; errors: string[]; dialogs: string[] };
async function open(browser: Browser, mock: Mock, vp: { width: number; height: number }, user = USER): Promise<Ctx> {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: "tr-TR", timezoneId: "Europe/Istanbul", hasTouch: vp.width < 768 && browser.browserType().name() !== "firefox" });
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
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: user } });
    return mock.handle(route);
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  const dialogs: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return { ctx, page, errors, dialogs };
}

const tabBtn = (page: Page, label: string) => page.locator("main button[aria-pressed]", { hasText: label });
async function gotoProfile(page: Page) {
  await page.goto(BASE + "/settings", { waitUntil: "load" });
  await tabBtn(page, "Profilim").waitFor({ timeout: 180000 });
  await tabBtn(page, "Profilim").click();
  await page.waitForSelector('[data-testid="report-logo"], [data-testid="report-logo-error"], [data-testid="settings-profile-error"]', { timeout: 60000 });
}
async function settle(page: Page) {
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.evaluate("document.fonts.ready");
  await page.waitForTimeout(500);
}
const overflow = (page: Page) => page.evaluate("({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth })") as Promise<{ sw: number; iw: number; bw: number }>;
const T = (page: Page, id: string) => page.getByTestId(id);
/** Önizlemedeki uzman logosu yüklendi mi (blob: + naturalWidth > 0)? */
/** CSP 'unsafe-eval' içermediği için waitForFunction (sayfada eval) kullanılamaz → page.evaluate ile yoklama. */
async function poll(page: Page, expr: string, timeout = 15000): Promise<boolean> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await page.evaluate(expr).catch(() => false)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}
const previewLoaded = (page: Page) => poll(page, "(() => { const i = document.querySelector('[data-testid=\"report-logo-preview-img\"]'); return !!i && i.complete && i.naturalWidth > 0 && i.src.startsWith('blob:'); })()");
async function shotSection(page: Page, file: string) {
  await T(page, "report-logo").scrollIntoViewIfNeeded();
  await T(page, "report-logo").screenshot({ path: join(OUT, file) });
}

async function main() {
  const fx = [
    await fixture("11111111-1111-4111-8111-111111111111", "yatay", svgLogo(1200, 320, `${MARK(160, 160, 110)}<text x="320" y="150" font-family="Georgia, serif" font-size="96" fill="#1f3a5f">Yılmaz</text><text x="322" y="240" font-family="Arial, sans-serif" font-size="54" letter-spacing="10" fill="#0f6b5a">YAŞAM MERKEZİ</text>`, "#ffffff")),
    await fixture("22222222-2222-4222-8222-222222222222", "dikey", svgLogo(420, 1000, `${MARK(210, 260, 170)}<text x="210" y="620" text-anchor="middle" font-family="Georgia, serif" font-size="88" fill="#1f3a5f">AYŞE</text><text x="210" y="730" text-anchor="middle" font-family="Georgia, serif" font-size="88" fill="#1f3a5f">YILMAZ</text><text x="210" y="840" text-anchor="middle" font-family="Arial" font-size="40" letter-spacing="6" fill="#0f6b5a">DANIŞMANLIK</text>`, "#f3efe6")),
    await fixture("33333333-3333-4333-8333-333333333333", "kare", svgLogo(800, 800, `<rect x="40" y="40" width="720" height="720" rx="140" fill="#7a2e52"/><text x="400" y="470" text-anchor="middle" font-family="Georgia, serif" font-size="300" fill="#fff">AY</text>`)),
    await fixture("44444444-4444-4444-8444-444444444444", "şeffaf", svgLogo(900, 900, `${MARK(450, 380, 260)}<rect x="250" y="720" width="400" height="44" rx="22" fill="#0f6b5a"/>`)),
  ];
  const [HOR, VER, SQ, TR] = fx;
  const browser = await chromium.launch();
  try {
    // ── V: görünüm + taşma (ayrı logo seçili, yatay) ──
    for (const width of [320, 375, 390, 768, 1024, 1280, 1440]) {
      const mock = createMock(fx);
      mock.setLogo("custom", HOR.id);
      const c = await open(browser, mock, { width, height: width < 768 ? 800 : 900 });
      await gotoProfile(c.page);
      const loaded = await previewLoaded(c.page);
      await settle(c.page);
      ok("V", `${width}px: önizlemede uzman logosu blob: URL ile yüklendi`, loaded);
      const o = await overflow(c.page);
      ok("V", `${width}px: yatay taşma yok`, o.sw <= o.iw && o.bw <= o.iw, o);
      const boxes = await c.page.locator('[data-testid="report-logo-preview"] > div > div, [data-testid="report-logo-asset"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right) }; }));
      ok("V", `${width}px: önizleme kartları ve logo kutuları ekran içinde`, boxes.length > 0 && boxes.every((b) => b.l >= 0 && b.r <= width), boxes);
      ok("V", `${width}px: Yaşam Sistemi logosu kapakta`, (await c.page.locator('[data-testid="report-logo-preview"] img[alt="Yaşam Sistemi"]').count()) === 1);
      await c.page.screenshot({ path: join(OUT, `rapor-logosu-${width}.png`), fullPage: true });
      await shotSection(c.page, `rapor-logosu-bolum-${width}.png`);
      ok("V", `${width}px: sayfa hatası yok`, c.errors.length === 0, c.errors);
      await c.ctx.close();
    }

    // ── S: seçim akışı ──
    {
      const mock = createMock(fx, { wsLogo: SQ.id });
      const c = await open(browser, mock, { width: 1280, height: 900 });
      await gotoProfile(c.page);
      ok("S", "başlangıç: Logo kullanma seçili, önizleme logosuz", (await T(c.page, "report-logo-opt-none").isChecked()) && (await T(c.page, "report-logo-preview").getAttribute("data-has-logo")) === "0");
      ok("S", "değişiklik yokken Seçimi kaydet pasif", await T(c.page, "report-logo-save").isDisabled());
      await T(c.page, "report-logo-opt-custom").check();
      await c.page.waitForSelector('[data-testid="report-logo-asset"]');
      ok("S", "ayrı logo: 4 yüklenmiş logo listelenir (yalnız logo türü)", (await T(c.page, "report-logo-asset").count()) === 4);
      await T(c.page, "report-logo-asset").nth(1).click();
      ok("S", "listeden seçim aria-checked", (await T(c.page, "report-logo-asset").nth(1).getAttribute("aria-checked")) === "true");
      ok("S", "seçilen logo önizlemede", await previewLoaded(c.page));
      ok("S", "bekleyen seçim 'kaydedilmemiş' sayılır", ((await T(c.page, "profile-dirty-state").textContent()) ?? "").includes("Rapor logosu seçiminiz kaydedilmedi"));
      const before = await c.page.evaluate("(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })()");
      ok("S", "bekleyen seçimde beforeunload engellenir", before === true);
      await T(c.page, "report-logo-save").click();
      await c.page.waitForSelector('[data-testid="report-logo-notice"][data-tone="ok"]');
      const put = mock.log.find((l) => l.path === "/api/settings/profile/logo" && l.method === "PUT");
      ok("S", "PUT gövdesi: source=custom, assetId, expectedVersion (kimlik yok)", !!put && JSON.stringify(Object.keys(put.body as object).sort()) === JSON.stringify(["assetId", "expectedVersion", "source"]) && (put.body as Json).assetId === VER.id && (put.body as Json).expectedVersion === 1, put?.body);
      ok("S", "mock: custom + VER, sürüm 2", mock.state().source === "custom" && mock.state().assetId === VER.id && mock.state().version === 2);
      ok("S", "kayıt sonrası 'Tüm değişiklikler kaydedildi'", ((await T(c.page, "profile-dirty-state").textContent()) ?? "").includes("Tüm değişiklikler kaydedildi"));
      await c.page.locator('[name="title"]').fill("Uzman Refleksolog");
      await T(c.page, "profile-save").click();
      await c.page.waitForSelector('[data-testid="profile-notice"][data-tone="ok"]');
      ok("S", "ortak sürüm: logo kaydından sonra profil formu kaydı 409 vermez (sürüm 3)", mock.state().version === 3 && mock.state().profile.title === "Uzman Refleksolog");
      ok("S", "önizleme formdaki güncel unvanı gösterir", ((await T(c.page, "report-logo-signature").textContent()) ?? "").includes("Uzman Refleksolog"));
      await T(c.page, "report-logo-opt-workspace").check();
      ok("S", "çalışma alanı logosu önizlemede", await previewLoaded(c.page));
      await T(c.page, "report-logo-save").click();
      await c.page.waitForSelector('[data-testid="report-logo-notice"][data-tone="ok"]');
      ok("S", "çalışma alanı seçimi kaydedildi (profil kaydından sonra güncel sürümle: 3 → 4)", mock.state().source === "workspace" && mock.state().assetId === null && mock.state().version === 4, mock.state());
      await c.page.reload({ waitUntil: "load" });
      await tabBtn(c.page, "Profilim").click();
      await c.page.waitForSelector('[data-testid="report-logo"]');
      ok("S", "yenileme sonrası seçim kalıcı (workspace)", await T(c.page, "report-logo-opt-workspace").isChecked());
      await T(c.page, "report-logo-opt-none").check();
      await T(c.page, "report-logo-cancel").click();
      ok("S", "Vazgeç kaydedilmiş seçime döndürür", await T(c.page, "report-logo-opt-workspace").isChecked());
      await T(c.page, "report-logo-opt-none").check();
      c.page.once("dialog", (d) => { c.dialogs.push(d.message()); void d.dismiss(); });
      await tabBtn(c.page, "Konum").click();
      await c.page.waitForTimeout(300);
      ok("S", "bekleyen logo seçiminde sekme değişimi onay sorar", c.dialogs.length === 1 && (await T(c.page, "report-logo").count()) === 1, c.dialogs);
      await T(c.page, "report-logo-save").click();
      await c.page.waitForSelector('[data-testid="report-logo-notice"][data-tone="ok"]');
      ok("S", "Logo kullanma kaydedildi", mock.state().source === "none" && ((await T(c.page, "report-logo-notice").textContent()) ?? "").includes("kaldırıldı"));
      const assetUrls = mock.log.filter((l) => /\/api\/settings\/workspace\/assets\/[0-9a-f-]{36}$/.test(l.path)).length;
      ok("S", "görseller yalnız güvenli görsel ucundan (blob) alındı", assetUrls > 0);
      const html = await c.page.content();
      ok("S", "sayfada Storage / supabase URL'si yok", !/storage\/v1|supabase\.co|expert-workspace\//.test(html));
      ok("S", "sayfa hatası yok", c.errors.length === 0, c.errors);
      await c.ctx.close();
    }

    // ── P: Owner için önizleme örnekleri (yatay / dikey / kare / şeffaf + logosuz + çalışma alanı boş) ──
    for (const f of fx) {
      for (const width of [1280, 390]) {
        const mock = createMock(fx);
        mock.setLogo("custom", f.id);
        const c = await open(browser, mock, { width, height: 900 });
        await gotoProfile(c.page);
        const loaded = await previewLoaded(c.page);
        await settle(c.page);
        ok("P", `${f.label} (${width}px): önizleme yüklendi`, loaded);
        const box = await T(c.page, "report-logo-preview-img").boundingBox();
        ok("P", `${f.label} (${width}px): logo imza kartında sınırlı kutuda (≤ 84×46 px)`, !!box && box.width <= 84.5 && box.height <= 46.5, box);
        await T(c.page, "report-logo-preview").screenshot({ path: join(OUT, `onizleme-${f.label.replace("ş", "s")}-${width}.png`) });
        await c.ctx.close();
      }
    }
    {
      const mock = createMock(fx, { wsLogo: null });
      mock.setLogo("workspace", null);
      const c = await open(browser, mock, { width: 1280, height: 900 });
      await gotoProfile(c.page);
      await settle(c.page);
      ok("P", "çalışma alanı seçili + tasarımda logo yok: açıklama + logosuz önizleme", ((await T(c.page, "report-logo").textContent()) ?? "").includes("tasarımınızda şu an logo yok") && (await T(c.page, "report-logo-preview").getAttribute("data-has-logo")) === "0");
      await T(c.page, "report-logo-preview").screenshot({ path: join(OUT, "onizleme-logosuz-1280.png") });
      await c.ctx.close();
    }

    // ── U: yükleme ──
    {
      const mock = createMock(fx.slice(0, 1));
      const c = await open(browser, mock, { width: 390, height: 844 });
      await gotoProfile(c.page);
      await T(c.page, "report-logo-opt-custom").check();
      await c.page.waitForSelector('[data-testid="report-logo-asset"]');
      const png = await sharp(svgLogo(600, 200, `${MARK(100, 100, 70)}<text x="200" y="125" font-family="Georgia" font-size="64" fill="#1f3a5f">Yeni Logo</text>`)).png().toBuffer();
      await T(c.page, "report-logo-file").setInputFiles({ name: "yeni-logo.png", mimeType: "image/png", buffer: png });
      await poll(c.page, "document.querySelectorAll('[data-testid=\"report-logo-asset\"]').length === 2", 15000);
      ok("U", "yüklenen logo listeye eklenir ve seçilir", (await T(c.page, "report-logo-asset").first().getAttribute("aria-checked")) === "true");
      ok("U", "mevcut parçalı yükleme akışı kullanıldı (start → chunk → complete)", ["/api/settings/workspace/assets/uploads"].every((p) => mock.log.some((l) => l.path === p && l.method === "POST")) && mock.log.some((l) => l.path.endsWith("/complete")));
      ok("U", "yüklenen logo önizlemede", await previewLoaded(c.page));
      ok("U", "yükleme seçimi otomatik KAYDETMEZ (açık eylem gerekir)", mock.state().source === "none" && !(await T(c.page, "report-logo-save").isDisabled()));
      await T(c.page, "report-logo-save").click();
      await c.page.waitForSelector('[data-testid="report-logo-notice"][data-tone="ok"]');
      ok("U", "kaydedildi: custom + yeni logo", mock.state().source === "custom" && mock.state().assetId !== HOR.id);
      await T(c.page, "report-logo-file").setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
      ok("U", "SVG istemcide reddedilir (sunucuya gönderilmez)", ((await T(c.page, "report-logo-upload-error").textContent()) ?? "").includes("JPEG, PNG veya WebP") && mock.log.filter((l) => l.path === "/api/settings/workspace/assets/uploads").length === 1);
      mock.nextComplete = { status: 400, json: { ok: false, code: "corrupt", error: "Görsel bozuk veya eksik yüklenmiş." } };
      await T(c.page, "report-logo-file").setInputFiles({ name: "bozuk.png", mimeType: "image/png", buffer: png });
      await poll(c.page, "(document.querySelector('[data-testid=\"report-logo-upload-error\"]')?.textContent || '').includes('bozuk')", 15000);
      ok("U", "sunucu doğrulama hatası anlaşılır gösterilir", ((await T(c.page, "report-logo-upload-error").textContent()) ?? "").includes("bozuk"));
      await shotSection(c.page, "yukleme-hatasi-390.png");
      ok("U", "sayfa hatası yok", c.errors.length === 0, c.errors);
      await c.ctx.close();
    }

    // ── H: hata hâlleri ──
    {
      const mock = createMock(fx);
      mock.setLogo("custom", "99999999-9999-4999-8999-999999999999");
      const c = await open(browser, mock, { width: 390, height: 844 });
      await gotoProfile(c.page);
      ok("H", "silinmiş / bulunamayan logo: 'Logo bulunamadı, yeniden seçin' uyarısı", ((await T(c.page, "report-logo-missing").textContent()) ?? "").includes("Logo bulunamadı, yeniden seçin"));
      await c.page.waitForSelector('[data-testid="report-logo-asset"]');
      await settle(c.page);
      await shotSection(c.page, "logo-bulunamadi-390.png");
      await T(c.page, "report-logo-asset").nth(2).click();
      await T(c.page, "report-logo-save").click();
      await c.page.waitForSelector('[data-testid="report-logo-notice"][data-tone="ok"]');
      ok("H", "yeniden seçince uyarı kalkar", (await T(c.page, "report-logo-missing").count()) === 0 && mock.state().assetId === SQ.id);
      mock.deleteAsset(TR.id);
      await T(c.page, "report-logo-asset").nth(3).click();
      await T(c.page, "report-logo-save").click();
      await c.page.waitForSelector('[data-testid="report-logo-notice"][data-tone="error"]');
      ok("H", "başka sekmede silinmiş logo seçilirse 400 → anlaşılır hata", ((await T(c.page, "report-logo-notice").textContent()) ?? "").includes("Logo bulunamadı"));
      await poll(c.page, "document.querySelectorAll('[data-testid=\"report-logo-asset\"]').length === 3", 10000);
      ok("H", "400 sonrası logo listesi tazelenir (silinen logo listeden düşer)", (await T(c.page, "report-logo-asset").count()) === 3);
      mock.bumpLogo("none", null);
      await T(c.page, "report-logo-asset").nth(0).click();
      await T(c.page, "report-logo-save").click();
      await c.page.waitForSelector('[data-testid="report-logo-notice"][data-tone="warn"]');
      ok("H", "409: uyarı + bekleyen seçim korunur", ((await T(c.page, "report-logo-notice").textContent()) ?? "").includes("başka bir sekmede") && (await T(c.page, "report-logo-asset").nth(0).getAttribute("aria-checked")) === "true");
      await shotSection(c.page, "cakisma-390.png");
      await T(c.page, "report-logo-save").click();
      await c.page.waitForSelector('[data-testid="report-logo-notice"][data-tone="ok"]');
      ok("H", "409 sonrası yeniden kaydet başarılı", mock.state().source === "custom" && mock.state().assetId === HOR.id);
      ok("H", "sayfa hatası yok", c.errors.length === 0, c.errors);
      await c.ctx.close();
    }

    // ── A: erişim kapalı ──
    {
      const mock = createMock(fx, { access: false });
      mock.setLogo("custom", HOR.id);
      const c = await open(browser, mock, { width: 390, height: 844 });
      await gotoProfile(c.page);
      await settle(c.page);
      ok("A", "erişim kapalı: seçenekler ve önizleme gösterilmez", (await T(c.page, "report-logo-opt-custom").count()) === 0 && (await T(c.page, "report-logo-preview").count()) === 0);
      ok("A", "açıklama görünür (raporlar logosuz)", ((await T(c.page, "report-logo-access-off").textContent()) ?? "").includes("logosuz"));
      ok("A", "görsel uçlarına istek gitmez (liste / görsel)", !mock.log.some((l) => /workspace\/assets/.test(l.path)));
      await shotSection(c.page, "erisim-kapali-390.png");
      await T(c.page, "report-logo-clear").click();
      await c.page.waitForSelector('[data-testid="report-logo-notice"][data-tone="ok"]');
      ok("A", "önceki seçim kaldırılabilir (none)", mock.state().source === "none" && (await T(c.page, "report-logo-clear").count()) === 0);
      await c.ctx.close();
    }

    // ── D: demo ──
    {
      const mock = createMock(fx, { demo: true });
      mock.setLogo("custom", HOR.id);
      const c = await open(browser, mock, { width: 390, height: 844 }, { ...USER, is_demo_account: true });
      await gotoProfile(c.page);
      ok("D", "seçenekler kilitli", await T(c.page, "report-logo-opt-none").isDisabled());
      ok("D", "Seçimi kaydet / yükle yok", (await T(c.page, "report-logo-save").count()) === 0 && (await T(c.page, "report-logo-upload").count()) === 0);
      ok("D", "önizleme yine görünür", await previewLoaded(c.page));
      ok("D", "PUT hiç gönderilmedi", !mock.log.some((l) => l.method === "PUT"));
      await settle(c.page);
      await shotSection(c.page, "demo-390.png");
      await c.ctx.close();
    }
  } finally {
    await browser.close();
  }

  // ── B: Firefox + WebKit ──
  for (const bt of [firefox, webkit] as BrowserType[]) {
    const b = await bt.launch();
    try {
      const mock = createMock(fx);
      const c = await open(b, mock, { width: 390, height: 844 });
      await gotoProfile(c.page);
      await T(c.page, "report-logo-opt-custom").check();
      await c.page.waitForSelector('[data-testid="report-logo-asset"]');
      await T(c.page, "report-logo-asset").nth(3).click();
      // Playwright WebKit (Windows) http kökenli sayfada blob: görselleri çizmiyor (yalın sayfada PNG/WebP blob ile de naturalWidth 0;
      // ürün dışı ortam kısıtı) → WebKit'te önizleme öğesinin blob: kaynağı + güvenli uçtan alınan bayt doğrulanır.
      const wk = bt.name() === "webkit";
      const shown = wk
        ? await poll(c.page, "(() => { const i = document.querySelector('[data-testid=\"report-logo-preview-img\"]'); return !!i && i.src.startsWith('blob:'); })()")
          && mock.log.some((l) => l.path === `/api/settings/workspace/assets/${TR.id}` && l.status === 200)
        : await previewLoaded(c.page);
      ok("B", `${bt.name()}: şeffaf logo önizlemede${wk ? " (blob: kaynağı; çizim ortam kısıtı)" : ""}`, shown);
      await settle(c.page);
      const o = await overflow(c.page);
      ok("B", `${bt.name()} 390px: yatay taşma yok`, o.sw <= o.iw, o);
      await T(c.page, "report-logo-save").click();
      await c.page.waitForSelector('[data-testid="report-logo-notice"][data-tone="ok"]');
      ok("B", `${bt.name()}: seçim kaydedilir`, mock.state().source === "custom" && mock.state().assetId === TR.id);
      await shotSection(c.page, `rapor-logosu-${bt.name()}-390.png`);
      ok("B", `${bt.name()}: sayfa hatası yok`, c.errors.length === 0, c.errors);
      await c.ctx.close();
    } finally {
      await b.close();
    }
  }

  const summary = `profile logo UI harness: ${pass} PASS / ${fail} FAIL`;
  console.log(`\n${summary}`);
  writeFileSync(join(OUT, "ui-sonuc.txt"), `${summary}\n${fails.join("\n")}\n`);
  if (fail) { console.log(fails.join("\n")); process.exit(1); }
}
type Json = Record<string, unknown>;

main().catch((e) => { console.error(e); process.exit(1); });
