/**
 * UZMAN PROFİLİ (F1) — Ayarlar → Profilim UI testi (Playwright; yerel production build + `next start`; API mock'lu).
 *
 * Prod'a / dış ağa temas YOK: /api/settings/profile → bellekte durum tutan sahte arka uç (GERÇEK lib/profile/schema
 * doğrulaması + sürüm kuralı); 127.0.0.1 dışı istekler abort. CI listesinde DEĞİL (build + sunucu ister).
 *   UI_BASE=http://127.0.0.1:3980 UI_OUT=<klasör> npx tsx scripts/profile/ui-profile.harness.ts
 * Bölümler:
 *   V  320 / 375 / 390 / 768 / 1024 / 1280 / 1440: ekran görüntüsü + yatay taşma yok + salt-okunur hesap alanı görünür
 *      + sekme çubuğu: beklenen sekme kümesi/sırası, her sekme erişilebilir/tıklanabilir, kırpılma yok
 *   W  aynı genişlikler, Çalışma Alanım sekmesi açıkken sekme çubuğu
 *   K  kaydet → sayfayı yenile → değerler kalıcı (mock); Vazgeç; karakter sayacı
 *   E  hata gösterimi: istemci doğrulaması (aria-invalid + aria-describedby + odak), sunucu 400 alan hatası, 409 çakışma,
 *      yükleme hatası (503) + yeniden dene
 *   T  klavye: sekme çubuğu → alanlar → anahtar (Space) → Enter ile kaydet; kaydedilmemiş değişiklikte sekme değişimi onayı
 *   D  demo hesap: alanlar kilitli, Kaydet yok, uyarı görünür; PUT hiç gönderilmez
 *   B  Firefox + WebKit: 390 px taşma yok + kaydet
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, firefox, webkit, type Browser, type BrowserContext, type BrowserType, type Page } from "playwright";
import { EMPTY_PROFILE, parseExpectedVersion, parseProfilePatch, type ProfileFields } from "../../lib/profile/schema";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3980";
const OUT = process.env.UI_OUT ?? "profil-ui";
mkdirSync(OUT, { recursive: true });
const FREEZE_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}";
const USER = {
  id: "00000000-0000-4000-8000-0000000000f1", email: "ayse.yilmaz@example.invalid", full_name: "Ayşe Yılmaz", name: "Ayşe", role: "expert",
  active: true, approval_status: "approved", package_type: "premium", membership_status: "active", tenant_id: "aaaaaaaa-0000-4000-8000-0000000000f1",
  is_demo_account: false, module_permissions: { clients: true, numerology: true, human_design: true },
};

let pass = 0, fail = 0;
const fails: string[] = [];
function ok(group: string, name: string, cond: boolean, detail: unknown = "") {
  if (cond) pass++; else { fail++; fails.push(`[${group}] ${name}`); }
  console.log(`${cond ? "PASS" : "FAIL"} [${group}] ${name}${!cond && detail !== "" ? `  → ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
}

type Inject = { status: number; json: Record<string, unknown> } | null;
function createMock(opts: { demo?: boolean } = {}) {
  let profile: ProfileFields = { ...EMPTY_PROFILE };
  let version = 0;
  const log: { method: string; status: number; body?: unknown }[] = [];
  const m = {
    nextPut: null as Inject,
    nextGet: null as Inject,
    log,
    /** Başka sekmede değişiklik benzetimi. */
    bump(p: Partial<ProfileFields>) { profile = { ...profile, ...p }; version++; },
    state: () => ({ profile, version }),
    view: () => ({ ok: true, profile: { ...profile, logoSource: "none", logoAssetId: null }, version, updatedAt: version ? "2026-11-10T09:00:00.000Z" : null, account: { fullName: USER.full_name, email: USER.email }, readOnly: !!opts.demo }),
    handle(method: string, raw: string | null): { status: number; json: unknown } {
      if (method === "GET") {
        if (m.nextGet) { const r = m.nextGet; m.nextGet = null; log.push({ method, status: r.status }); return r; }
        log.push({ method, status: 200 });
        return { status: 200, json: m.view() };
      }
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(raw ?? "{}"); } catch { /* */ }
      const done = (status: number, json: unknown) => { log.push({ method, status, body }); return { status, json }; };
      if (opts.demo) return done(403, { ok: false, demo: true, code: "DEMO_READONLY", error: "Demo hesabı salt okunurdur." });
      if (m.nextPut) { const r = m.nextPut; m.nextPut = null; return done(r.status, r.json); }
      const ev = parseExpectedVersion(body.expectedVersion);
      if (!ev.ok) return done(400, { ok: false, error: ev.error, path: ev.path });
      const p = parseProfilePatch(body.profile);
      if (!p.ok) return done(400, { ok: false, error: p.error, path: p.path, fields: p.fields });
      if (ev.value !== version) return done(409, { ...m.view(), ok: false, code: "VERSION_CONFLICT", error: "Profiliniz başka bir sekmede değişti." });
      profile = { ...profile, ...p.value };
      version++;
      return done(200, m.view());
    },
  };
  return m;
}
type Mock = ReturnType<typeof createMock>;

type Ctx = { ctx: BrowserContext; page: Page; errors: string[]; dialogs: string[] };
async function open(browser: Browser, mock: Mock, vp: { width: number; height: number }, user = USER, workspaceOn = false): Promise<Ctx> {
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
    if (url.pathname === "/api/settings/profile") {
      const r = mock.handle(req.method(), req.postData());
      return route.fulfill({ status: r.status, json: r.json });
    }
    // F2: Profilim'deki "Rapor logosu" bölümü (bu harness'te Kişisel Dijital Ofis erişimi kapalı → logo seçenekleri gizli).
    if (url.pathname === "/api/settings/profile/logo" && req.method() === "GET") {
      const st = mock.state();
      return route.fulfill({ status: 200, json: { ok: true, logo: { source: "none", assetId: null, status: "none" }, workspace: { access: false, logoAssetId: null }, checkFailed: false, brandingEnabled: st.profile.reportBrandingEnabled, version: st.version, updatedAt: null, readOnly: false } });
    }
    if (url.pathname.startsWith("/api/settings/workspace")) {
      return workspaceOn ? route.fulfill({ status: 200, json: { ok: true, design: null } }) : route.fulfill({ status: 404, json: { ok: false, error: "Bulunamadı." } });
    }
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: user } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], items: [], count: 0, messages: [] } });
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
  await page.waitForSelector('[data-testid="settings-profile"], [data-testid="settings-profile-error"]', { timeout: 60000 });
}
async function settle(page: Page) {
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.evaluate("document.fonts.ready");
  await page.waitForTimeout(400);
}
/**
 * Sekme çubuğu denetimi (SettingsTabBar). Her sekme için: çubuk içinde görünür alana getirilebilir (çubuk kendi içinde
 * kaydırılıyorsa yalnız overflow-x auto/scroll ile), getirildiğinde tamamen çubuğun ve ekranın içinde, merkezi tıklanabilir
 * (elementFromPoint = sekme), metni kırpılmıyor. Açılır menüde (kapalı panel) duran sekme için menü düğmesi aynı ölçütlerle
 * denetlenir. Çubuk ekran dışına taşmaz. Denetim sonunda çubuğun kaydırma konumu geri yüklenir.
 */
const TABBAR_JS = `(async () => {
  var bar = document.querySelector('main [data-settings-tabbar]');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('main button[data-settings-tab]'));
  if (!bar || !tabs.length) return null;
  var vw = window.innerWidth;
  var cs = getComputedStyle(bar);
  var scrollable = bar.scrollWidth > bar.clientWidth + 1;
  var controlled = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
  var save = bar.scrollLeft;
  var frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  var check = async (el) => {
    if (scrollable && controlled) { el.scrollIntoView({ block: 'nearest', inline: 'center' }); await frame(); }
    var br = bar.getBoundingClientRect(); var r = el.getBoundingClientRect();
    var inside = r.width > 0 && r.left >= br.left - 0.5 && r.right <= br.right + 0.5 && r.left >= -0.5 && r.right <= vw + 0.5;
    var hitEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    var hit = !!hitEl && (hitEl === el || el.contains(hitEl));
    return { inside: inside, hit: hit, textClip: el.scrollWidth > el.clientWidth + 1 };
  };
  var items = [];
  for (var i = 0; i < tabs.length; i++) {
    var b = tabs[i];
    var inPanel = !!b.closest('[hidden]');
    var target = inPanel ? document.querySelector('main [aria-controls="' + b.closest('[hidden]').id + '"]') : b;
    var c = target ? await check(target) : { inside: false, hit: false, textClip: true };
    items.push({ id: b.getAttribute('data-settings-tab'), label: (b.textContent || '').trim(), viaMenu: inPanel, inside: c.inside, hit: c.hit, textClip: c.textClip, ok: c.inside && c.hit && !c.textClip });
  }
  bar.scrollLeft = save; await frame();
  var br2 = bar.getBoundingClientRect();
  return {
    ids: items.map((x) => x.id), n: items.length, scrollable: scrollable, controlled: controlled,
    barInViewport: br2.left >= -0.5 && br2.right <= vw + 0.5,
    bad: items.filter((x) => !x.ok), hscroll: document.documentElement.scrollWidth > vw + 1
  };
})()`;
type TabBar = { ids: string[]; n: number; scrollable: boolean; controlled: boolean; barInViewport: boolean; bad: unknown[]; hscroll: boolean } | null;
/** Beklenen sekme kümesi ve SIRASI. "membership" (F4 Üyeliğim) varsa Geri Yükleme'den hemen sonra kabul edilir. */
function expectedTabs(ids: string[], workspaceOn: boolean): string[] {
  const e = ["security", "profile", "location", "contact", "export", "backup", "restore"];
  if (ids.includes("membership")) e.push("membership");
  if (workspaceOn) e.push("workspace");
  return e;
}
function tabBarOk(t: TabBar, workspaceOn: boolean): boolean {
  if (!t) return false;
  const exp = expectedTabs(t.ids, workspaceOn);
  return t.ids.join(",") === exp.join(",") && t.bad.length === 0 && t.barInViewport && !t.hscroll && (!t.scrollable || t.controlled);
}
const overflow = (page: Page) => page.evaluate("({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth })") as Promise<{ sw: number; iw: number; bw: number }>;
const field = (page: Page, name: string) => page.locator(`[data-testid="settings-profile"] [name="${name}"]`);
const sw = (page: Page, label: string) => page.locator('[data-testid="settings-profile"]').getByRole("switch", { name: label, exact: true });

async function fillAll(page: Page) {
  await field(page, "title").fill("Uzman Psikolojik Danışman");
  await field(page, "organization").fill("Yaşam Danışmanlık Merkezi");
  await field(page, "phone").fill("+90 (532) 123-45-67");
  await field(page, "contactEmail").fill("iletisim@example.invalid");
  await field(page, "website").fill("https://www.example.invalid");
  await field(page, "bio").fill("15 yıllık deneyimle bireysel ve aile danışmanlığı.\nBütüncül yaklaşım.");
  await field(page, "reportNote").fill("Bu rapor bilgilendirme amaçlıdır.");
}

async function main() {
  const browser = await chromium.launch();
  try {
    // ── V: görünüm + taşma ──
    for (const width of [320, 375, 390, 768, 1024, 1280, 1440]) {
      const mock = createMock();
      mock.bump({ title: "Uzman Psikolojik Danışman", organization: "Yaşam Danışmanlık Merkezi", phone: "+90 532 123 45 67", contactEmail: "iletisim@example.invalid", website: "https://www.example.invalid/uzman/ayse-yilmaz", bio: "15 yıllık deneyimle bireysel ve aile danışmanlığı. Nefes çalışmaları, farkındalık ve bütüncül yaklaşım.", reportNote: "Bu rapor bilgilendirme amaçlıdır; tıbbi tanı ve tedavinin yerini tutmaz.", reportBrandingEnabled: true });
      const c = await open(browser, mock, { width, height: width < 768 ? 800 : 900 });
      await gotoProfile(c.page);
      await settle(c.page);
      const o = await overflow(c.page);
      ok("V", `${width}px: yatay taşma yok`, o.sw <= o.iw && o.bw <= o.iw, o);
      ok("V", `${width}px: salt-okunur ad soyad + e-posta görünür`, (await c.page.getByTestId("profile-full-name").textContent()) === USER.full_name && (await c.page.getByTestId("profile-email").textContent()) === USER.email);
      ok("V", `${width}px: ad/e-posta düzenlenebilir alan DEĞİL`, (await c.page.locator('[data-testid="settings-profile"] input[name="fullName"], [data-testid="settings-profile"] input[name="email"]').count()) === 0);
      ok("V", `${width}px: dürüst durum metni`, ((await c.page.getByTestId("profile-branding-status").textContent()) ?? "").includes("Anahtar kapalıyken hiçbir rapor değişmez"));
      await c.page.screenshot({ path: join(OUT, `profilim-${width}.png`), fullPage: true });
      const tb = (await c.page.evaluate(TABBAR_JS)) as TabBar;
      ok("V", `${width}px: sekme kümesi/sırası doğru; her sekme erişilebilir, tıklanabilir, metni kırpılmıyor; çubuk taşmıyor`, tabBarOk(tb, false), tb);
      ok("V", `${width}px: sayfa hatası yok`, c.errors.length === 0, c.errors);
      await c.ctx.close();
    }

    // ── W: Çalışma Alanım sekmesi de açıkken sekme çubuğu ──
    for (const width of [320, 375, 390, 768, 1024, 1280, 1440]) {
      const c = await open(browser, createMock(), { width, height: width < 768 ? 800 : 900 }, USER, true);
      await gotoProfile(c.page);
      await c.page.waitForSelector("main button[aria-pressed]:text-is('Çalışma Alanım')", { state: "attached", timeout: 20000 });
      await settle(c.page);
      await c.page.screenshot({ path: join(OUT, `profilim-calisma-alani-${width}.png`) });
      const tb = (await c.page.evaluate(TABBAR_JS)) as TabBar;
      ok("W", `Çalışma Alanım açık @${width}: sekme kümesi/sırası (${tb ? tb.n : 0} sekme; membership varsa F4) + her sekme erişilebilir/tıklanabilir, kırpılan yok, taşma yok`, tabBarOk(tb, true), tb);
      ok("W", `Çalışma Alanım açık @${width}: Profilim seçili kalır`, (await tabBtn(c.page, "Profilim").getAttribute("aria-pressed")) === "true");
      await c.ctx.close();
    }

    // ── K: kaydet → yenile → kalıcı ──
    {
      const mock = createMock();
      const c = await open(browser, mock, { width: 1280, height: 900 });
      await gotoProfile(c.page);
      ok("K", "ilk açılış: Kaydet pasif (değişiklik yok)", await c.page.getByTestId("profile-save").isDisabled());
      await fillAll(c.page);
      ok("K", "karakter sayacı güncellenir (unvan 25/80)", (await c.page.locator('[id$="-title-count"]').textContent())?.includes("25/80") === true);
      ok("K", "kaydedilmemiş değişiklik göstergesi", ((await c.page.getByTestId("profile-dirty-state").textContent()) ?? "").includes("Kaydedilmemiş"));
      await sw(c.page, "Raporlarımda kurumsal bilgilerimi göster").click();
      await sw(c.page, "İletişim bilgileri").click();
      await c.page.getByTestId("profile-save").click();
      await c.page.waitForSelector('[data-testid="profile-notice"][data-tone="ok"]');
      const put = mock.log.find((l) => l.method === "PUT");
      ok("K", "PUT gövdesi yalnız izinli alanları taşır (ad/e-posta/kimlik yok)", !!put && Object.keys(put.body as object).sort().join(",") === "expectedVersion,profile" && !JSON.stringify(put.body).includes("fullName") && !JSON.stringify(put.body).includes("tenant"), put?.body);
      await c.page.screenshot({ path: join(OUT, "profilim-kaydedildi-1280.png"), fullPage: true });
      await c.page.reload({ waitUntil: "load" });
      await tabBtn(c.page, "Profilim").click();
      await c.page.waitForSelector('[data-testid="settings-profile"]');
      ok("K", "yenileme sonrası unvan kalıcı", (await field(c.page, "title").inputValue()) === "Uzman Psikolojik Danışman");
      ok("K", "yenileme sonrası biyografi (çok satır) kalıcı", (await field(c.page, "bio").inputValue()) === "15 yıllık deneyimle bireysel ve aile danışmanlığı.\nBütüncül yaklaşım.");
      ok("K", "yenileme sonrası ana anahtar açık, iletişim anahtarı kapalı", (await sw(c.page, "Raporlarımda kurumsal bilgilerimi göster").getAttribute("aria-checked")) === "true" && (await sw(c.page, "İletişim bilgileri").getAttribute("aria-checked")) === "false");
      ok("K", "mock durumu: version 1, markalama açık", mock.state().version === 1 && mock.state().profile.reportBrandingEnabled === true && mock.state().profile.reportShowContact === false);
      await field(c.page, "title").fill("Geçici değişiklik");
      await c.page.getByTestId("profile-cancel").click();
      ok("K", "Vazgeç kaydedilmiş değere döndürür", (await field(c.page, "title").inputValue()) === "Uzman Psikolojik Danışman" && (await c.page.getByTestId("profile-save").isDisabled()));
      await field(c.page, "website").fill("");
      await c.page.getByTestId("profile-save").click();
      await c.page.waitForSelector('[data-testid="profile-notice"][data-tone="ok"]');
      ok("K", "alan boşaltılıp kaydedilir (null)", mock.state().profile.website === null);
      ok("K", "sayfa hatası yok", c.errors.length === 0, c.errors);
      await c.ctx.close();
    }

    // ── E: hata gösterimi ──
    {
      const mock = createMock();
      const c = await open(browser, mock, { width: 390, height: 844 });
      await gotoProfile(c.page);
      await field(c.page, "website").fill("javascript:alert(1)");
      await field(c.page, "title").fill("a".repeat(81));
      await c.page.getByTestId("profile-save").click();
      const t = field(c.page, "title");
      ok("E", "istemci doğrulaması: PUT gönderilmedi", !mock.log.some((l) => l.method === "PUT"));
      ok("E", "geçersiz alan aria-invalid", (await t.getAttribute("aria-invalid")) === "true" && (await field(c.page, "website").getAttribute("aria-invalid")) === "true");
      const desc = (await field(c.page, "website").getAttribute("aria-describedby")) ?? "";
      const errId = desc.split(" ").find((x) => x.endsWith("-err"));
      ok("E", "hata metni aria-describedby ile bağlı", !!errId && ((await c.page.locator(`#${errId}`).textContent()) ?? "").includes("https://"));
      ok("E", "ilk hatalı alana odak (unvan)", (await c.page.evaluate("document.activeElement && document.activeElement.getAttribute('name')")) === "title");
      ok("E", "sayaç sınır aşımını gösterir (81/80)", ((await c.page.locator('[id$="-title-count"]').textContent()) ?? "").includes("81/80"));
      ok("E", "genel hata bildirimi (role=alert)", (await c.page.locator('[data-testid="profile-notice"][role="alert"]').count()) === 1);
      await c.page.screenshot({ path: join(OUT, "profilim-hata-390.png"), fullPage: true });
      await t.fill("Unvan");
      ok("E", "alan düzeltilince hatası kalkar", (await t.getAttribute("aria-invalid")) === null);
      await field(c.page, "website").fill("https://www.example.invalid");
      mock.nextPut = { status: 400, json: { ok: false, error: "Bazı alanlar geçersiz.", path: "profile.organization", fields: { organization: "Sunucu bu değeri kabul etmedi." } } };
      await field(c.page, "organization").fill("Kurum");
      await c.page.getByTestId("profile-save").click();
      await c.page.waitForSelector('[data-testid="profile-notice"][role="alert"]');
      ok("E", "sunucu 400 alan hatası ilgili alanda gösterilir", ((await c.page.locator('[id$="-organization-err"]').textContent()) ?? "").includes("Sunucu bu değeri kabul etmedi") && (await field(c.page, "organization").getAttribute("aria-invalid")) === "true");
      // 409: başka sekmede değişiklik
      await c.page.getByTestId("profile-save").click();
      await c.page.waitForSelector('[data-testid="profile-notice"][data-tone="ok"]');
      mock.bump({ bio: "Başka sekmede yazıldı" });
      await field(c.page, "title").fill("Benim değişikliğim");
      await c.page.getByTestId("profile-save").click();
      await c.page.waitForSelector('[data-testid="profile-notice"][data-tone="warn"]');
      ok("E", "409: uyarı görünür, kullanıcının değişikliği formda korunur", (await field(c.page, "title").inputValue()) === "Benim değişikliğim");
      await c.page.screenshot({ path: join(OUT, "profilim-cakisma-390.png"), fullPage: true });
      await c.page.getByTestId("profile-save").click();
      await c.page.waitForSelector('[data-testid="profile-notice"][data-tone="ok"]');
      ok("E", "409 sonrası yeniden kaydet başarılı (güncel sürümle)", mock.state().profile.title === "Benim değişikliğim");
      ok("E", "sayfa hatası yok", c.errors.length === 0, c.errors);
      await c.ctx.close();

      const m2 = createMock();
      m2.nextGet = { status: 503, json: { ok: false, code: "PROFILE_UNAVAILABLE", error: "Profil şu anda kullanılamıyor." } };
      const c2 = await open(browser, m2, { width: 375, height: 800 });
      await gotoProfile(c2.page);
      ok("E", "yükleme hatası (503) anlaşılır mesaj", ((await c2.page.getByTestId("settings-profile-error").textContent()) ?? "").includes("henüz kullanıma açılmadı"));
      await c2.page.screenshot({ path: join(OUT, "profilim-yukleme-hatasi-375.png"), fullPage: true });
      await c2.page.getByRole("button", { name: "Yeniden dene" }).click();
      await c2.page.waitForSelector('[data-testid="settings-profile"]');
      ok("E", "Yeniden dene ile form yüklenir", true);
      await c2.ctx.close();
    }

    // ── T: klavye + kaydedilmemiş değişiklik ──
    {
      const mock = createMock();
      const c = await open(browser, mock, { width: 1280, height: 900 });
      await gotoProfile(c.page);
      await tabBtn(c.page, "Profilim").focus();
      const order: string[] = [];
      for (let i = 0; i < 40; i++) {
        await c.page.keyboard.press("Tab");
        const n = (await c.page.evaluate("(() => { const a = document.activeElement; return a ? (a.getAttribute('name') || a.getAttribute('role') || a.tagName) : '' })()")) as string;
        order.push(n);
        if (n === "reportNote") break;
      }
      const idx = (k: string) => order.indexOf(k);
      ok("T", "Tab sırası: unvan → kurum → telefon → e-posta → site → biyografi → dipnot", ["title", "organization", "phone", "contactEmail", "website", "bio", "reportNote"].every((k, i, a) => idx(k) >= 0 && (i === 0 || idx(k) > idx(a[i - 1]))), order);
      await c.page.keyboard.press("Tab");
      ok("T", "dipnottan sonra ana anahtara odak", (await c.page.evaluate("document.activeElement && document.activeElement.getAttribute('role')")) === "switch");
      const focusRing = await c.page.evaluate("getComputedStyle(document.activeElement).outlineStyle");
      ok("T", "odak halkası görünür", focusRing !== "none", focusRing);
      await c.page.keyboard.press("Space");
      ok("T", "Space ile anahtar açılır", (await sw(c.page, "Raporlarımda kurumsal bilgilerimi göster").getAttribute("aria-checked")) === "true");
      ok("T", "ana anahtar kapalıyken alt anahtarlar kilitliydi, açılınca etkin", await sw(c.page, "Unvan").isEnabled());
      await field(c.page, "title").focus();
      await c.page.keyboard.type("Klavye ile unvan");
      await c.page.keyboard.press("Enter");
      await c.page.waitForSelector('[data-testid="profile-notice"][data-tone="ok"]');
      ok("T", "Enter ile kaydedilir", mock.state().profile.title === "Klavye ile unvan" && mock.state().profile.reportBrandingEnabled === true);
      // kaydedilmemiş değişiklik → sekme değişimi onayı
      await field(c.page, "organization").fill("Kaydedilmemiş kurum");
      c.page.once("dialog", (d) => { c.dialogs.push(d.message()); void d.dismiss(); });
      await tabBtn(c.page, "Konum").click();
      await c.page.waitForTimeout(300);
      ok("T", "kaydedilmemiş değişiklikte sekme değişimi onay sorar; Vazgeç → Profilim'de kalır", c.dialogs.length === 1 && c.dialogs[0].includes("kaydedilmemiş") && (await c.page.locator('[data-testid="settings-profile"]').count()) === 1, c.dialogs);
      c.page.once("dialog", (d) => { c.dialogs.push(d.message()); void d.accept(); });
      await tabBtn(c.page, "Konum").click();
      await c.page.waitForTimeout(300);
      ok("T", "onaylanınca sekme değişir, değişiklik kaydedilmez", (await c.page.locator('[data-testid="settings-profile"]').count()) === 0 && mock.state().profile.organization === null);
      await tabBtn(c.page, "Profilim").click();
      await c.page.waitForSelector('[data-testid="settings-profile"]');
      await tabBtn(c.page, "Konum").click();
      ok("T", "değişiklik yokken sekme değişimi onay sormaz", c.dialogs.length === 2 && (await c.page.locator('[data-testid="settings-profile"]').count()) === 0);
      await tabBtn(c.page, "Profilim").click();
      await c.page.waitForSelector('[data-testid="settings-profile"]');
      await field(c.page, "bio").fill("Ayrılmadan önce");
      const before = await c.page.evaluate("(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })()");
      ok("T", "kaydedilmemiş değişiklikte beforeunload engellenir", before === true);
      await c.page.getByTestId("profile-cancel").click();
      const after = await c.page.evaluate("(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })()");
      ok("T", "değişiklik yokken beforeunload serbest", after === false);
      ok("T", "varsayılan sekme hâlâ Hesap Güvenliği (ilk açılış)", true);
      await c.ctx.close();
      const c3 = await open(browser, createMock(), { width: 1280, height: 900 });
      await c3.page.goto(BASE + "/settings", { waitUntil: "load" });
      await tabBtn(c3.page, "Profilim").waitFor({ timeout: 60000 });
      ok("T", "/settings ilk açılışta Hesap Güvenliği sekmesi seçili", (await tabBtn(c3.page, "Hesap Güvenliği").getAttribute("aria-pressed")) === "true" && (await tabBtn(c3.page, "Profilim").getAttribute("aria-pressed")) === "false");
      await c3.ctx.close();
    }

    // ── D: demo ──
    {
      const mock = createMock({ demo: true });
      const c = await open(browser, mock, { width: 390, height: 844 }, { ...USER, is_demo_account: true });
      await gotoProfile(c.page);
      ok("D", "demo uyarısı görünür", (await c.page.getByTestId("profile-demo-note").count()) === 1);
      ok("D", "alanlar kilitli", (await field(c.page, "title").isDisabled()) && (await field(c.page, "bio").isDisabled()) && (await field(c.page, "reportNote").isDisabled()));
      ok("D", "anahtarlar kilitli", await sw(c.page, "Raporlarımda kurumsal bilgilerimi göster").isDisabled());
      ok("D", "Kaydet / Vazgeç yok", (await c.page.getByTestId("profile-save").count()) === 0 && (await c.page.getByTestId("profile-cancel").count()) === 0);
      ok("D", "PUT hiç gönderilmedi", !mock.log.some((l) => l.method === "PUT"));
      await c.page.screenshot({ path: join(OUT, "profilim-demo-390.png"), fullPage: true });
      await c.ctx.close();
    }
  } finally {
    await browser.close();
  }

  // ── B: Firefox + WebKit ──
  for (const bt of [firefox, webkit] as BrowserType[]) {
    const b = await bt.launch();
    try {
      const mock = createMock();
      const c = await open(b, mock, { width: 390, height: 844 });
      await gotoProfile(c.page);
      await settle(c.page);
      const o = await overflow(c.page);
      ok("B", `${bt.name()} 390px: yatay taşma yok`, o.sw <= o.iw, o);
      await fillAll(c.page);
      await c.page.getByTestId("profile-save").click();
      await c.page.waitForSelector('[data-testid="profile-notice"][data-tone="ok"]');
      ok("B", `${bt.name()}: kaydet çalışır`, mock.state().version === 1 && mock.state().profile.organization === "Yaşam Danışmanlık Merkezi");
      await c.page.screenshot({ path: join(OUT, `profilim-${bt.name()}-390.png`), fullPage: true });
      ok("B", `${bt.name()}: sayfa hatası yok`, c.errors.length === 0, c.errors);
      await c.ctx.close();
    } finally {
      await b.close();
    }
  }

  const summary = `profile UI harness: ${pass} PASS / ${fail} FAIL`;
  console.log(`\n${summary}`);
  writeFileSync(join(OUT, "ui-sonuc.txt"), `${summary}\n${fails.join("\n")}\n`);
  if (fail) { console.log(fails.join("\n")); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
