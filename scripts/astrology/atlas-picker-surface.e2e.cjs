/* eslint-disable @typescript-eslint/no-require-imports */
// Gökyüzü Atlası V3 seçici — UZMAN YÜZEYİ (/astroloji) denetimi (2026-11-05). YEREL; sahte DB (gerçek Roxy / DB YOK).
// Önkoşul: atlas-picker-ui.e2e.cjs ile aynı (FAKE_PICKER_SEED=1 sahte arka uç + next dev).
// Ölçer: owner hesabıyla uzman yüzeyinde (aynı çalışma merkezi bileşeni) bilgilendirme kapatılır; seçici başlıkta; liste yalnız
// etkin profilin analizleri; seçim doğru kaydı açar; seçici ve listeleme YALNIZ /api/astroloji/* (yüzey çevirisi) kullanır,
// /api/admin/* çağrılmaz; hesap / kayıt isteği yok.
// Çalıştırma: node scripts/astrology/atlas-picker-surface.e2e.cjs <origin> <genişlik> <yükseklik>
const { chromium } = require("playwright");

const [ORIGIN = "http://localhost:3991", W = "1366", H = "768"] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const HDR = { "x-admin-id": OWNER, "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}` };
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} [uzman-yüzeyi ${width}] ${n}${x ? ` — ${x}` : ""}`);
};

(async () => {
  const api = async (p) => (await fetch(`${ORIGIN}/api/admin/astroloji${p}`, { headers: HDR })).json();
  const prof = await api(`/profiles?view=archive&sort=name_asc&limit=100&offset=0`);
  const all = prof.profiles ?? prof.items ?? [];
  let ali1 = null;
  for (const p of all.filter((x) => x.label === "Ali Örnek — natal")) {
    const l = await api(`/analyses?profileId=${p.id}&offset=0&limit=100`);
    if (l.analyses.some((a) => a.title === "Ali natal (gerçek kayıt)")) ali1 = { id: p.id, list: l };
  }
  ok("tohum: Ali #1 bulundu", !!ali1);
  const natalId = ali1.list.analyses.find((a) => a.title === "Ali natal (gerçek kayıt)").id;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "tr-TR", timezoneId: "Europe/Istanbul", deviceScaleFactor: width < 640 ? 2 : 1, isMobile: width < 640, hasTouch: width < 640 });
  await ctx.addCookies([
    { name: "__Host-yasam_sid", value: TOKEN, domain: "localhost", path: "/", secure: true },
    { name: "yasam_admin_session", value: TOKEN, domain: "localhost", path: "/" },
  ]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  let reqs = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/")) reqs.push(`${r.method()} ${u.pathname}`);
  });
  await page.goto(`${ORIGIN}/astroloji#danisan/${ali1.id}`, { waitUntil: "load", timeout: 180000 });
  const okBtn = page.locator('[data-testid="atlas-development-notice-ok"]');
  await okBtn.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  if (await okBtn.count()) await okBtn.click();
  await page.waitForSelector("[data-testid=astro-saved-analyses] [data-saved-item]", { timeout: 120000 });
  const item = page.locator(`[data-saved-item="${natalId}"]`).first();
  for (let i = 0; i < 10 && (await item.count()) === 0; i++) {
    const more = page.locator("[data-testid=astro-analyses-more]").first();
    if (!(await more.count())) break;
    await more.click();
    await page.waitForTimeout(900);
  }
  await item.click();
  await page.waitForSelector("[data-testid=atlas-picker-trigger]", { timeout: 90000 });
  await page.waitForTimeout(800);
  ok("uzman yüzeyinde başlık = seçici, şerit yok", (await page.locator("[data-testid=astro-saved-tabs]").count()) === 0 && /^Natal · /.test((await page.locator("[data-testid=atlas-picker-headline]:visible").first().innerText()).trim()));
  reqs = [];
  await page.locator("[data-testid=atlas-picker-trigger]:visible").first().click();
  await page.waitForFunction(() => !document.querySelector("[data-testid=atlas-picker-panel][data-loading]"), null, { timeout: 30000 });
  const n = await page.locator("[data-testid=atlas-picker-panel] [role=option]").count();
  const t = await page.locator("[data-testid=atlas-picker-panel]").innerText();
  ok("liste = Ali #1 kayıtlı analiz sayısı; diğer Ali / Ayşe yok", n === ali1.list.total && !/İKİNCİ ALİ|AYŞE/.test(t), `${n}/${ali1.list.total}`);
  const kp = page.locator("[data-testid=atlas-picker-panel] [role=option][data-picker-technique='kp.chart']").first();
  if (await kp.count()) {
    await kp.scrollIntoViewIfNeeded();
    await kp.click();
    await page.waitForTimeout(1500);
  }
  const admin = reqs.filter((r) => r.includes("/api/admin/"));
  const bad = reqs.filter((r) => /\/engine\/run|POST \/api\/astroloji\/(analyses|notes)|PATCH|PUT|DELETE/.test(r));
  ok("yüzey çevirisi: seçici / geçiş yalnız /api/astroloji/* (admin ucu yok)", admin.length === 0, admin.join(", "));
  ok("hesap / kayıt isteği yok", bad.length === 0, bad.join(", "));
  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(`\natlas-picker-surface [${width}]: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("atlas-picker-surface çöktü:", e);
  process.exit(1);
});
