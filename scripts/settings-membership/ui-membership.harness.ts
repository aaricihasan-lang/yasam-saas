/**
 * F4 — Ayarlar › Üyeliğim UI harness'ı (Playwright, yerel production build + API mock; dış ağ YOK).
 * CI listesinde DEĞİL (yerel `next build` + `next start` ister).
 *   UI_BASE=http://127.0.0.1:3982 UI_OUT=<klasör> npx tsx scripts/settings-membership/ui-membership.harness.ts
 * Bölümler:
 *   V  her durum × 320/375/390/768/1024/1280/1440: ekran görüntüsü, yatay taşma yok, başlık hiyerarşisi,
 *      dl/dt/dd yapısı, doğrulanmamış ifade yok, varsayılan sekme hâlâ "Hesap Güvenliği"
 *   C  "Pro üyelik talebi" / "Yöneticiyle iletişime geç" → mevcut "Admin ile İrtibat" sekmesi açılır
 *   I  kimlik: istek yalnız oturum sahibinin id'siyle gider; guard 403 (yabancı id) → hiçbir veri gösterilmez
 *   B  Firefox + WebKit kısa doğrulama
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3982";
const OUT = process.env.UI_OUT ?? "f4-ekran";
const NOW = new Date("2026-11-10T12:00:00+03:00");
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const FREEZE_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}";
const VIEWPORTS = [320, 375, 390, 768, 1024, 1280, 1440];

type Row = Record<string, unknown>;
const baseUser: Row = {
  id: "00000000-0000-4000-8000-00000000f4e1", email: "ayse.yilmaz@example.invalid", full_name: "Ayşe Yılmaz", name: "Ayşe",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium", membership_status: "active",
  subscription_status: "active", membership_started_at: "2026-10-01T07:30:00Z", membership_ends_at: null, trial_started_at: null,
  trial_ends_at: null, trial_kind: null, trial_status: null, tenant_id: "aaaaaaaa-0000-4000-8000-00000000f40a",
  is_demo_account: false, module_permissions: { clients: true, numerology: true },
};

type Scenario = {
  key: string;
  kind: string;
  user: Row;
  profile: { status: number; json: unknown };
  trial?: unknown;
  expectText: string[];
  cta: string | null;
};
const tStart = NOW.getTime() - 2 * 24 * H;
const SCENARIOS: Scenario[] = (() => {
  const u = (x: Row) => ({ ...baseUser, ...x });
  const ok = (p: Row) => ({ status: 200, json: { ok: true, profile: p } });
  const trialActive = u({ package_type: null, plan: null, trial_kind: "self_7d", trial_status: "active", trial_started_at: iso(tStart), trial_ends_at: iso(tStart + 168 * H) });
  const trialExpired = u({ package_type: null, plan: null, trial_kind: "self_7d", trial_status: "active", trial_started_at: iso(tStart - 200 * H), trial_ends_at: iso(tStart - 32 * H) });
  const proFuture = u({ membership_ends_at: "2027-10-01T07:30:00Z" });
  const proPast = u({ membership_ends_at: "2026-11-01T00:00:00Z" });
  const proNoEnd = u({});
  const pending = u({ approval_status: "pending" });
  const demo = u({ is_demo_account: true, email: "demo@example.invalid", full_name: "Demo Uzman" });
  const admin = u({ role: "admin", package_type: null, plan: null, full_name: "Yönetici Test" });
  return [
    { key: "deneme-aktif", kind: "trial_active", user: trialActive, profile: ok(trialActive),
      trial: { trial: { phase: "active", startedAt: iso(tStart), endsAt: iso(tStart + 168 * H), serverNow: iso(NOW.getTime()), credits: { dailyLimit: 50, usedTotal: 12, moduleLimits: {}, usedByModule: {}, day: "2026-11-10" }, proRequestAt: null, whatsappUrl: null } },
      expectText: ["Ücretsiz deneme (7 gün)", "Deneme sürüyor", "8 Kasım 2026, 12:00", "15 Kasım 2026, 12:00", "38 / 50"], cta: "Pro üyelik talebi" },
    { key: "deneme-bitti", kind: "trial_expired", user: trialExpired, profile: ok(trialExpired),
      trial: { trial: { phase: "expired", startedAt: iso(tStart - 200 * H), endsAt: iso(tStart - 32 * H), serverNow: iso(NOW.getTime()), credits: null, proRequestAt: "2026-11-09T10:15:00Z", whatsappUrl: null } },
      expectText: ["Deneme sona erdi · salt okunur", "görüntüleyebilir ve dışa aktarabilirsiniz", "Alındı · 9 Kasım 2026, 13:15"], cta: "Pro üyelik talebi" },
    { key: "pro-aktif", kind: "pro_active", user: proFuture, profile: ok(proFuture), expectText: ["Pro üyelik", "Aktif", "1 Ekim 2026, 10:30", "1 Ekim 2027, 10:30"], cta: "Yöneticiyle iletişime geç" },
    { key: "pro-suresi-dolmus", kind: "pro_active", user: proPast, profile: ok(proPast), expectText: ["1 Kasım 2026, 03:00", "Kayıtlı bitiş tarihi geçmiş görünüyor"], cta: "Yöneticiyle iletişime geç" },
    { key: "bitis-tanimsiz", kind: "pro_active", user: proNoEnd, profile: ok(proNoEnd), expectText: ["Bitiş tarihi tanımlı değil", "yöneticinizle iletişime geçin"], cta: "Yöneticiyle iletişime geç" },
    { key: "onay-bekleyen", kind: "pending", user: pending, profile: { status: 403, json: { error: "Hesabınız henüz onaylanmadı." } }, expectText: ["Onay bekliyor", "yönetici onayı bekliyor"], cta: null },
    { key: "demo", kind: "demo", user: demo, profile: ok(demo), expectText: ["Demo hesabı", "ortak bir demo hesabıdır"], cta: "Yöneticiyle iletişime geç" },
    { key: "admin", kind: "admin", user: admin, profile: ok(admin), expectText: ["Yönetici", "üyelik paketine bağlı değildir"], cta: null },
  ];
})();
const FORBIDDEN = [/sınırsız/i, /ömür boyu/i, /otomatik yenilen/i, /aktif ödeme/i, /süresiz/i];

let pass = 0, fail = 0;
const fails: string[] = [];
function ok(group: string, name: string, cond: boolean, detail: unknown = "") {
  if (cond) pass++; else { fail++; fails.push(`[${group}] ${name}`); }
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail !== "" ? `  → ${JSON.stringify(detail).slice(0, 500)}` : ""}`);
}

type Opened = { page: Page; close: () => Promise<void>; profileHeaders: string[]; errors: string[] };
async function open(browser: Browser, s: Scenario, width: number, profileOverride?: { status: number; json: unknown }, workspaceOn = false): Promise<Opened> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "f4-local-fake-token");
      localStorage.setItem("yasam_trial_notice", "seen");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: "2026-11-01T00:00:00.000Z" }));
    } catch { /* */ }
  }, s.user);
  const profileHeaders: string[] = [];
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port !== new URL(BASE).port) return route.fulfill({ status: 200, json: [] });
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") {
      profileHeaders.push(req.headers()["x-user-id"] ?? "");
      const p = profileOverride ?? s.profile;
      return route.fulfill({ status: p.status, json: p.json });
    }
    if (url.pathname.startsWith("/api/settings/workspace")) {
      return workspaceOn ? route.fulfill({ status: 200, json: { ok: true, design: null } }) : route.fulfill({ status: 404, json: { error: "harness: kapalı" } });
    }
    if (url.pathname === "/api/trial/status") return route.fulfill({ status: 200, json: s.trial ?? { trial: null } });
    if (req.method() !== "GET") return route.fulfill({ status: 405, json: { error: "harness: yazma yok" } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], items: [], messages: [], sessions: [], count: 0 } });
  });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return { page, close: () => ctx.close(), profileHeaders, errors };
}

/** Sekmeyi gerçek tıklamayla açar; sekme açılır menüdeyse (dar ekranda "Diğer") önce menünün kendi düğmesine tıklar. */
async function openTab(page: Page, label: string) {
  const btn = page.locator(`main button[data-settings-tab]:text-is("${label}")`);
  await btn.waitFor({ state: "attached", timeout: 180000 });
  if (!(await btn.isVisible())) {
    const panelId = await btn.evaluate((el) => el.closest("[hidden]")?.id ?? "");
    await page.locator(`main [aria-controls="${panelId}"]`).click();
  }
  await btn.click();
}

async function gotoMembership(page: Page) {
  await page.goto(BASE + "/settings", { waitUntil: "load" });
  await page.waitForSelector("main h1", { timeout: 180000 });
  await openTab(page, "Üyeliğim");
  await page.waitForSelector("section[data-membership-kind]", { timeout: 60000 });
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(300);
}

const INSPECT_JS = `(() => {
  var sec = document.querySelector('section[data-membership-kind]');
  var dls = sec ? Array.prototype.slice.call(sec.querySelectorAll('dl')) : [];
  var dlOk = dls.every(function (dl) {
    return Array.prototype.every.call(dl.children, function (div) {
      var c = div.children; return div.tagName === 'DIV' && c.length >= 2 && c[0].tagName === 'DT' && Array.prototype.slice.call(c, 1).every(function (x) { return x.tagName === 'DD'; });
    });
  });
  var over = [];
  if (sec) Array.prototype.forEach.call(sec.querySelectorAll('*'), function (e) {
    if (e.closest('[aria-hidden="true"]')) return; var b = e.getBoundingClientRect(); if (b.width > 0 && (b.right > window.innerWidth + 1 || b.left < -1)) over.push((e.tagName + ' ' + (e.textContent || '').slice(0, 30)));
  });
  return {
    kind: sec ? sec.getAttribute('data-membership-kind') : null,
    text: sec ? sec.innerText : '',
    hscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    h1: document.querySelectorAll('h1').length,
    h2: Array.prototype.map.call(document.querySelectorAll('main h2'), function (h) { return (h.textContent || '').trim(); }),
    h3: sec ? (sec.querySelector('h3#membership-heading') || {}).textContent || null : null,
    labelled: sec ? sec.getAttribute('aria-labelledby') === 'membership-heading' : false,
    dlCount: dls.length, dlOk: dlOk, dtCount: sec ? sec.querySelectorAll('dt').length : 0,
    pressed: Array.prototype.map.call(document.querySelectorAll('button[aria-pressed="true"]'), function (b) { return (b.textContent || '').trim(); }),
    over: over.slice(0, 5)
  };
})()`;

type Inspect = { kind: string | null; text: string; hscroll: boolean; h1: number; h2: string[]; h3: string | null; labelled: boolean; dlCount: number; dlOk: boolean; dtCount: number; pressed: string[]; over: string[] };

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
/** Beklenen sekme kümesi ve SIRASI. "profile" (F1 Profilim) varsa Hesap Güvenliği'nden hemen sonra kabul edilir. */
function expectedTabs(ids: string[], workspaceOn: boolean): string[] {
  const e = ["security", "location", "contact", "export", "backup", "restore", "membership"];
  if (ids.includes("profile")) e.splice(1, 0, "profile");
  if (workspaceOn) e.push("workspace");
  return e;
}
function tabBarOk(t: TabBar, workspaceOn: boolean): boolean {
  if (!t) return false;
  const exp = expectedTabs(t.ids, workspaceOn);
  return t.ids.join(",") === exp.join(",") && t.bad.length === 0 && t.barInViewport && !t.hscroll && (!t.scrollable || t.controlled);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    // Varsayılan sekme değişmedi.
    {
      const o = await open(browser, SCENARIOS[2], 1280);
      await o.page.goto(BASE + "/settings", { waitUntil: "load" });
      await o.page.waitForSelector("main h1", { timeout: 180000 });
      const r = (await o.page.evaluate(INSPECT_JS)) as Inspect;
      ok("V", "varsayılan açılan sekme hâlâ 'Hesap Güvenliği'", r.pressed.length === 1 && r.pressed[0] === "Hesap Güvenliği" && r.kind === null, r.pressed);
      ok("V", "sayfanın profil eşitlemesi de yalnız oturum sahibinin id'siyle", o.profileHeaders.every((h) => h === String(SCENARIOS[2].user.id)), o.profileHeaders);
      await o.close();
    }

    console.log("\n── V: durum × ekran genişliği ──");
    for (const s of SCENARIOS) {
      for (const w of VIEWPORTS) {
        const o = await open(browser, s, w);
        await gotoMembership(o.page);
        const r = (await o.page.evaluate(INSPECT_JS)) as Inspect;
        const tag = `${s.key} @${w}`;
        ok("V", `${tag}: durum ${s.kind}`, r.kind === s.kind, r.kind);
        ok("V", `${tag}: yatay taşma yok`, !r.hscroll && r.over.length === 0, r.over);
        ok("V", `${tag}: beklenen metinler`, s.expectText.every((t) => r.text.includes(t)), { miss: s.expectText.filter((t) => !r.text.includes(t)) });
        ok("V", `${tag}: başlıklar (tek h1, h2 'Üyeliğim', h3 paket, section aria-labelledby)`, r.h1 === 1 && r.h2.includes("Üyeliğim") && !!r.h3 && r.labelled, r);
        ok("V", `${tag}: dl/dt/dd yapısı`, r.dlOk, r);
        ok("V", `${tag}: doğrulanmamış ifade yok`, FORBIDDEN.every((re) => !re.test(r.text)), r.text.slice(0, 300));
        ok("V", `${tag}: istek yalnız oturum sahibinin id'siyle`, o.profileHeaders.length >= 1 && o.profileHeaders.every((h) => h === String(s.user.id)), o.profileHeaders);
        ok("V", `${tag}: sayfa hatası yok`, o.errors.length === 0, o.errors);
        await o.page.screenshot({ path: join(OUT, `${s.key}-${w}.png`), fullPage: true });
        const tb = (await o.page.evaluate(TABBAR_JS)) as TabBar;
        ok("V", `${tag}: sekme kümesi/sırası doğru; her sekme erişilebilir, tıklanabilir, kırpılmıyor; taşma yok`, tabBarOk(tb, false), tb);
        await o.close();
      }
    }

    console.log("\n── W: Çalışma Alanım sekmesi de açıkken sekme satırı ──");
    for (const w of VIEWPORTS) {
      const o = await open(browser, SCENARIOS[2], w, undefined, true);
      await gotoMembership(o.page);
      await o.page.waitForSelector("button[aria-pressed]:text-is('Çalışma Alanım')", { state: "attached", timeout: 20000 });
      const r = (await o.page.evaluate(INSPECT_JS)) as Inspect;
      if (w === 320 || w === 1024 || w === 1280) await o.page.screenshot({ path: join(OUT, `sekmeler-calisma-alani-${w}.png`) });
      const tb = (await o.page.evaluate(TABBAR_JS)) as TabBar;
      ok("W", `Çalışma Alanım açık @${w}: sekme kümesi/sırası (${tb ? tb.n : 0} sekme; profile varsa F1) + her sekme erişilebilir/tıklanabilir, kırpılan yok, yatay taşma yok`, tabBarOk(tb, true) && !r.hscroll, tb);
      await o.close();
    }

    console.log("\n── C: yönlendirme ──");
    for (const s of SCENARIOS) {
      const o = await open(browser, s, 390);
      await gotoMembership(o.page);
      const btn = o.page.getByTestId("membership-contact-cta");
      if (s.cta === null) {
        ok("C", `${s.key}: CTA yok`, (await btn.count()) === 0);
      } else {
        ok("C", `${s.key}: CTA metni '${s.cta}'`, (await btn.textContent())?.trim() === s.cta);
        await btn.click();
        await o.page.waitForSelector("main h2:text-is('Admin ile İrtibat')", { timeout: 20000 });
        const r = (await o.page.evaluate(INSPECT_JS)) as Inspect;
        ok("C", `${s.key}: tıklayınca mevcut 'Admin ile İrtibat' sekmesi açılır`, r.pressed[0] === "Admin ile İrtibat" && r.kind === null, r.pressed);
        if (s.key === "deneme-bitti") await o.page.screenshot({ path: join(OUT, `yonlendirme-irtibat-390.png`), fullPage: true });
      }
      await o.close();
    }

    console.log("\n── I: kimlik / guard reddi ──");
    {
      const s = SCENARIOS[2];
      const o = await open(browser, s, 375, { status: 403, json: { error: "Oturum kimliği uyuşmuyor." } });
      await gotoMembership(o.page);
      const r = (await o.page.evaluate(INSPECT_JS)) as Inspect;
      ok("I", "guard 403 (yabancı id) → 'Bilgi alınamadı', satır yok", r.kind === "unavailable" && r.dtCount === 0 && r.text.includes("Bilgi alınamadı"), r);
      ok("I", "guard 403 → localStorage'daki paket bilgisi de gösterilmez", !r.text.includes("Pro üyelik") && !r.text.includes("Ekim 2026"), r.text);
      await o.page.screenshot({ path: join(OUT, `guard-reddi-375.png`), fullPage: true });
      await o.close();
    }
  } finally {
    await browser.close();
  }

  console.log("\n── B: Firefox + WebKit ──");
  for (const [name, bt] of [["firefox", firefox], ["webkit", webkit]] as [string, BrowserType][]) {
    const b = await bt.launch();
    try {
      for (const s of [SCENARIOS[1], SCENARIOS[4]]) {
        const o = await open(b, s, 375);
        await gotoMembership(o.page);
        const r = (await o.page.evaluate(INSPECT_JS)) as Inspect;
        ok("B", `${name} ${s.key} @375: durum + taşma yok + metin`, r.kind === s.kind && !r.hscroll && s.expectText.every((t) => r.text.includes(t)), r);
        await o.page.screenshot({ path: join(OUT, `${name}-${s.key}-375.png`), fullPage: true });
        await o.close();
      }
    } finally {
      await b.close();
    }
  }

  console.log(`\nToplam: ${pass} geçti, ${fail} kaldı`);
  if (fails.length) console.log(fails.join("\n"));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
