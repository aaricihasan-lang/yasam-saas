// KİŞİSEL DİJİTAL OFİS (P3) — uzman ana sayfası önce/sonra görsel regresyon + davranış kontrolü (Playwright, ağ-mock).
// Prod'a / dış ağa temas YOK: /api/* sentetik ZZ verisiyle karşılanır; 127.0.0.1 dışı abort (ui-main-panel.mjs ile aynı ilke).
// CI listesinde DEĞİL (çalışan sunucu ister). Çalıştırma (scripts/pre-sale-a2b/ui/README.md: fake-supabase-sink + sahte env):
//   UI_BASE=http://127.0.0.1:3941 [UI_SINK_PORT=54399] node scripts/workspace/ui-home-visual.mjs shots <çıktı-klasörü>
//   node scripts/workspace/ui-home-visual.mjs compare <önce-klasörü> <sonra-klasörü>   → piksel farkı 0 değilse çıkış 1
//   UI_BASE=... node scripts/workspace/ui-home-visual.mjs behavior                      → menü / kart / geri / kaydırma
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3941";
const SINK_PORT = process.env.UI_SINK_PORT ?? "54399";
const FIXED_TIME = new Date("2026-11-02T09:30:00+03:00");
const ALL = ["clients", "appointments", "numerology", "stones", "stok", "sifa_rehberi", "energy_body", "reflexology",
  "aromatherapy", "personal_archive", "belge_ceviri", "human_design", "digital_content", "cosmic_calendar", "cupping",
  "beslenme", "yasam_hafizasi", "astrology"];
const perms = (keys) => Object.fromEntries(ALL.map((k) => [k, keys.includes(k)]));
const makeUser = (role, keys) => ({
  id: role === "admin" ? "00000000-0000-4000-8000-0000000000ad" : "00000000-0000-4000-8000-0000000000e1",
  email: `zz-${role}@example.invalid`, full_name: `ZZ ${role}`, name: `ZZ ${role}`, role, active: true,
  approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a", is_demo_account: false, module_permissions: perms(keys),
});
const USERS = {
  owner: makeUser("admin", ALL),
  // Kilitli kart rozetleri de karşılaştırılsın diye kısıtlı uzman.
  expert: makeUser("expert", ["clients", "appointments", "numerology", "stones"]),
};
const VIEWPORTS = [1920, 1440, 1366, 1280, 1024, 900, 768, 390, 375, 320].map((w) => ({ width: w, height: w >= 1024 ? 900 : w >= 768 ? 1024 : 844 }));
const ANDROID_WV_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36";
// Chromium cam/bulanıklık (backdrop-filter) katmanı aynı sayfada bile çalıştırmadan çalıştırmaya birkaç birimlik kanal farkı
// üretebilir (baz kendi kendisiyle karşılaştırıldığında da görülür). Varsayılan ölçüt: kanal farkı > STRONG_DELTA olan piksel 0.
// UI_STRICT=1 → birebir piksel eşitliği.
const STRONG_DELTA = 16;
const STRICT = process.env.UI_STRICT === "1";
const FREEZE_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}";

let browser;
async function newPage(user, viewport, { ua } = {}) {
  browser ??= await chromium.launch();
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 768, isMobile: Boolean(ua), userAgent: ua, deviceScaleFactor: 1, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: "2026-11-01T00:00:00.000Z" }));
    } catch {}
  }, user);
  const isOwner = user.role === "admin";
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port === SINK_PORT || !url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: user } });
    // Kişisel Ofis uçları: bayrak kapalı / erişim yok davranışı (sunucunun gerçek yanıtı) → ana sayfa varsayılan kalmalı.
    if (url.pathname.startsWith("/api/settings/workspace")) return route.fulfill({ status: 404, json: { ok: false, error: "Bulunamadı." } });
    if (url.pathname.endsWith("/astroloji/access")) return route.fulfill(isOwner ? { status: 200, json: { ok: true } } : { status: 404, json: { error: "not_found" } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], items: [], count: 0 } });
  });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(FIXED_TIME);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return { ctx, page, errors };
}

async function openHome(page) {
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForSelector('[data-testid="home-hub-grid"] h3', { timeout: 60000 });
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  // Yükleniyor sayaçlarının mock yanıtla oturması.
  await page.waitForFunction(() => !document.body.innerText.includes("Yükleniyor"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function shots(outDir) {
  mkdirSync(outDir, { recursive: true });
  const jobs = [];
  for (const [who, user] of Object.entries(USERS)) for (const vp of VIEWPORTS) jobs.push({ name: `${who}-${vp.width}`, user, vp });
  jobs.push({ name: "owner-android-wv-390", user: USERS.owner, vp: { width: 390, height: 844 }, ua: ANDROID_WV_UA });
  jobs.push({ name: "expert-android-wv-390", user: USERS.expert, vp: { width: 390, height: 844 }, ua: ANDROID_WV_UA });
  let bad = 0;
  for (const j of jobs) {
    const { ctx, page, errors } = await newPage(j.user, j.vp, { ua: j.ua });
    await openHome(page);
    await page.screenshot({ path: join(outDir, `${j.name}.png`), fullPage: true });
    const ids = await page.evaluate(() => ["home-premium-shell", "home-hero-glow", "home-hub-grid", "home-brand-logo", "side-menu"].filter((t) => !document.querySelector(`[data-testid="${t}"]`)));
    const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const line = `${j.name}: eksik test kimliği=${ids.join(",") || "yok"} yatay-kaydırma=${hScroll} hata=${errors.length}`;
    if (hScroll || errors.length) bad++;
    console.log(line);
    await ctx.close();
  }
  console.log(`shots: ${jobs.length} ekran → ${outDir}${bad ? ` (${bad} sorunlu)` : ""}`);
}

async function compare(a, b) {
  const files = readdirSync(a).filter((f) => f.endsWith(".png")).sort();
  let diffs = 0;
  for (const f of files) {
    const [x, y] = await Promise.all([sharp(join(a, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(join(b, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })]);
    if (x.info.width !== y.info.width || x.info.height !== y.info.height) {
      diffs++; console.log(`❌ ${f}: boyut ${x.info.width}x${x.info.height} ≠ ${y.info.width}x${y.info.height}`); continue;
    }
    // px: birebir farklı piksel; maxDelta: en büyük kanal farkı (0–255); strong: kanal farkı > STRONG_DELTA olan piksel.
    let px = 0, strong = 0, maxDelta = 0;
    for (let i = 0; i < x.data.length; i += 4) {
      const d = Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2]), Math.abs(x.data[i + 3] - y.data[i + 3]));
      if (d) { px++; if (d > maxDelta) maxDelta = d; if (d > STRONG_DELTA) strong++; }
    }
    const total = x.info.width * x.info.height;
    const failed = STRICT ? px > 0 : strong > 0;
    if (failed) diffs++;
    console.log(`${failed ? "❌" : "✅"} ${f}: ${x.info.width}x${x.info.height} farklı piksel ${px} (%${((px / total) * 100).toFixed(4)}) en büyük kanal farkı ${maxDelta} güçlü ${strong}`);
  }
  console.log(`compare: ${files.length} ekran, farklı ${diffs}`);
  if (diffs || !files.length) process.exitCode = 1;
}

async function behavior() {
  let pass = 0, fail = 0;
  const ok = (name, cond, detail = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "✅" : "❌"} ${name}${!cond && detail ? `  → ${String(detail).slice(0, 300)}` : ""}`); };
  for (const [tag, vp, ua] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }], ["android-wv", { width: 390, height: 844 }, ANDROID_WV_UA]]) {
    // Owner: açık kart → modül sayfası → geri → ana sayfa + kaydırma
    const { ctx, page, errors } = await newPage(USERS.owner, vp, { ua });
    await openHome(page);
    const cards = await page.$$eval('[data-testid="home-hub-grid"] > a', (as) => as.map((a) => a.getAttribute("href")));
    ok(`[${tag}] owner: 7 açık kart bağlantısı`, cards.length === 7, cards);
    const href = cards[0];
    await page.click(`[data-testid="home-hub-grid"] > a[href="${href}"]`);
    await page.waitForURL((u) => u.pathname === href, { timeout: 60000 }).catch(() => {});
    ok(`[${tag}] kart tıklaması ${href} sayfasına gider`, new URL(page.url()).pathname === href, page.url());
    await page.goBack({ waitUntil: "load" });
    await page.waitForSelector('[data-testid="home-hub-grid"] h3', { timeout: 60000 }).catch(() => {});
    ok(`[${tag}] geri → ana sayfa ızgarası`, new URL(page.url()).pathname === "/" && (await page.$('[data-testid="home-hub-grid"]')) !== null, page.url());
    const maxY = await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); return window.scrollY; });
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    ok(`[${tag}] sayfa sona kayar (scrollY ${maxY}, yükseklik ${docH})`, docH <= vp.height + 1 || maxY > 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    ok(`[${tag}] başa döner`, (await page.evaluate(() => window.scrollY)) === 0);
    ok(`[${tag}] kalıcı Yaşam Sistemi logosu`, (await page.$('[data-testid="home-brand-logo"]')) !== null);
    // Menü: yan menü var, içinde ana sayfa merkez bağlantıları
    const menuLinks = await page.$$eval('[data-testid="side-menu"] a', (as) => as.length).catch(() => 0);
    ok(`[${tag}] yan menü bağlantıları (${menuLinks})`, menuLinks > 0);
    ok(`[${tag}] sayfa hatası yok`, errors.length === 0, errors);
    await ctx.close();
    // Kısıtlı uzman: yalnız yetkili merkezler bağlantı; varsa kilitli kart tıklaması ana sayfada kalır
    const e = await newPage(USERS.expert, vp, { ua });
    await openHome(e.page);
    const titles = await e.page.$$eval('[data-testid="home-hub-grid"] h3', (hs) => hs.map((h) => h.textContent.trim()));
    const links = await e.page.$$eval('[data-testid="home-hub-grid"] > a', (as) => as.map((a) => a.getAttribute("href")));
    ok(`[${tag}] uzman: yetkisiz merkezler görünmez (${titles.join(" | ")})`, titles.length === 3 && !titles.some((t) => /Stok|Hafıza|Beden|Dijital/.test(t)), titles);
    ok(`[${tag}] uzman: görünen kartlar bağlantı (${links.length})`, links.length >= 1, links);
    const locked = await e.page.$$('[data-testid="home-hub-grid"] > div[role="button"]');
    if (locked[0]) { await locked[0].click(); await e.page.waitForTimeout(500); }
    ok(`[${tag}] uzman: kilitli kart (${locked.length}) tıklaması ana sayfada kalır`, new URL(e.page.url()).pathname === "/", e.page.url());
    ok(`[${tag}] uzman: sayfa hatası yok`, e.errors.length === 0, e.errors);
    await e.ctx.close();
  }
  console.log(`behavior: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exitCode = 1;
}

const [mode, a, b] = process.argv.slice(2);
try {
  if (mode === "shots") await shots(a);
  else if (mode === "compare") await compare(a, b);
  else if (mode === "behavior") await behavior();
  else { console.error("kullanım: shots <klasör> | compare <önce> <sonra> | behavior"); process.exitCode = 2; }
} finally {
  await browser?.close();
}
