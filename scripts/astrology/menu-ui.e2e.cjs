// 2026-10-15 menü taşıma — Gökyüzü Atlası ana panelde ayrı kart DEĞİL, Yaşam Analiz Merkezi içinde. Gerçek tarayıcı
// (Playwright Chromium), YEREL: next dev 3931 + dev-fake-backend (54329). Gerçek DB / Roxy YOK.
// Çalıştırma: node scripts/astrology/menu-ui.e2e.cjs [genişlik] [yükseklik] [android]
//
//   Roller: sistem sahibi (owner) · owner olmayan admin · Atlas KAPALI + Numeroloji açık uzman · hiçbir analiz yetkisi olmayan uzman · yalnız Atlas yetkili uzman.
//   N1 ana panelde ayrı "Gökyüzü Atlası" kartı yok; Analiz Merkezi kartı (Numeroloji VEYA Atlas yetkisiyle) görünür + açık
//   N2 Analiz Merkezi: Numeroloji + Human Design kartları aynen; Atlas kartı YALNIZ erişimi olana
//   N3 /astroloji adresi yetkiliye açılır (Atlas ana ekranı), yetkisize açılmaz
//   N4 Atlas ana ekranından "Yaşam Analiz Merkezi" dönüşü; telefonda yatay taşma yok
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const { chromium } = require("playwright");
const [W = "1366", H = "860", UA = ""] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const mobile = width < 640;
const android = UA === "android";
const tag = `${width}px${android ? " Android-UA" : ""}`;
const APP = "http://localhost:3931";
const PG = "http://127.0.0.1:54329/rest/v1";
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} [${tag}] ${n}${x ? ` — ${x}` : ""}`);
};
const ROLES = {
  owner: { id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", token: "local-owner-token-aaaaaaaaaaaa", tenant: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin", email: "admin@yasamsistemi.com", perms: {} },
  admin2: { id: "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b", token: "local-admin2-token-bbbbbbbbbbb", tenant: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin", email: "admin2@local.test", perms: {} },
  expertNo: { id: "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e", token: "local-expert-token-eeeeeeeeeee", tenant: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", role: "expert", email: "uzman@local.test", perms: { clients: true, numerology: true, astrology: false, astrology_provider_interp: false } },
  expertNone: { id: "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e", token: "local-expert-token-eeeeeeeeeee", tenant: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", role: "expert", email: "uzman@local.test", perms: { clients: true, astrology: false } },
  expertAtlas: { id: "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e", token: "local-expert-token-eeeeeeeeeee", tenant: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", role: "expert", email: "uzman@local.test", perms: { clients: true, astrology: true, astrology_provider_interp: false } },
};
async function setPerms(id, perms) {
  const r = await fetch(`${PG}/users?id=eq.${id}`, { method: "PATCH", headers: { "content-type": "application/json", apikey: "local-service", authorization: "Bearer local-service", prefer: "return=representation" }, body: JSON.stringify({ module_permissions: perms }) });
  return r.status;
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errors = [];
  for (const [name, u] of Object.entries(ROLES)) {
    if (u.role === "expert") ok(`${name}: yetkiler ayarlandı`, (await setPerms(u.id, u.perms)) < 300);
    const ctx = await browser.newContext({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
      ...(android ? { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36" } : {}),
    });
    await ctx.addCookies([
      { name: "__Host-yasam_sid", value: u.token, domain: "localhost", path: "/", secure: true },
      { name: u.role === "admin" ? "yasam_admin_session" : "yasam_session", value: u.token, domain: "localhost", path: "/" },
    ]);
    await ctx.addInitScript((x) => {
      localStorage.setItem("yasam_user", JSON.stringify({ id: x.id, tenant_id: x.tenant, full_name: "Test", email: x.email, role: x.role, active: true, approval_status: "approved", package_type: "premium", membership_status: "active", module_permissions: x.perms }));
      localStorage.setItem("yasam_session_token", x.token);
    }, u);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${name}: ${String(e).slice(0, 160)}`));
    const hasAtlasAccess = name === "owner" || name === "expertAtlas";
    // Merkez kartı: admin her zaman; uzman Numeroloji VEYA Atlas yetkisiyle (hiçbiri yoksa eskisi gibi görünmez).
    const centerVisible = u.role === "admin" || u.perms.numerology === true || u.perms.astrology === true;

    // N1 — ana panel
    await page.goto(`${APP}/`, { waitUntil: "load", timeout: 180000 });
    await page.waitForSelector("a[href='/life-analysis'], [data-testid=dashboard-modules], h3", { timeout: 90000 }).catch(() => undefined);
    await page.waitForTimeout(2500);
    const atlasCardOnHome = await page.locator("main a[href='/astroloji']").count();
    ok(`N1 ${name}: ana panelde ayrı Gökyüzü Atlası kartı yok`, atlasCardOnHome === 0, String(atlasCardOnHome));
    const center = page.locator("a[href='/life-analysis']");
    if (centerVisible) ok(`N1 ${name}: Yaşam Analiz Merkezi kartı görünür ve AÇIK (kilitsiz bağlantı)`, (await center.count()) > 0 && (await center.first().isVisible()));
    else ok(`N1 ${name}: Numeroloji / Atlas yetkisi yok → Analiz Merkezi kartı görünmez (eski davranış)`, (await center.count()) === 0);
    ok(`N1 ${name}: ana panelde yatay taşma yok`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));

    // N2 — Analiz Merkezi
    await page.goto(`${APP}/life-analysis`, { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(3500); // erişim yoklaması
    ok(`N2 ${name}: Numeroloji + Human Design kartları aynen`, (await page.locator("a[href='/numeroloji']").count()) === 1 && (await page.locator("a[href='/human-design']").count()) === 1);
    const card = page.locator("[data-testid=life-analysis-atlas-card]");
    ok(`N2 ${name}: Gökyüzü Atlası kartı ${hasAtlasAccess ? "GÖRÜNÜR" : "YOK"}`, (await card.count()) === (hasAtlasAccess ? 1 : 0));
    ok(`N2 ${name}: Analiz Merkezi'nde yatay taşma yok`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    if (hasAtlasAccess) {
      const box = await card.boundingBox();
      ok(`N2 ${name}: Atlas kartı ekran içinde (${Math.round(box?.width ?? 0)} px)`, !!box && box.x >= 0 && box.x + box.width <= width + 1);
      ok(`N2 ${name}: Atlas kartı /astroloji adresine`, (await card.getAttribute("href")) === "/astroloji");
      await card.click();
      await page.waitForURL(/\/astroloji/, { timeout: 60000 });
    } else {
      await page.goto(`${APP}/astroloji`, { waitUntil: "load", timeout: 120000 });
    }
    // N3 — /astroloji
    await page.waitForTimeout(4000);
    const hero = await page.locator("[data-testid=atlas-hero]").count();
    ok(`N3 ${name}: /astroloji ${hasAtlasAccess ? "açılır (Atlas ana ekranı)" : "AÇILMAZ (yetkisiz)"}`, hasAtlasAccess ? hero === 1 : hero === 0);
    if (hasAtlasAccess) {
      // N4 — dönüş
      const back = page.locator("[data-testid=atlas-back-to-center]");
      ok(`N4 ${name}: "Yaşam Analiz Merkezi" dönüş bağlantısı görünür`, await back.isVisible());
      const bb = await back.boundingBox();
      ok(`N4 ${name}: dönüş bağlantısı ekran içinde + dokunma alanı ≥ 40 px`, !!bb && bb.x >= 0 && bb.x + bb.width <= width && bb.height >= 39);
      ok(`N4 ${name}: Atlas ana ekranında yatay taşma yok`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
      await back.click();
      await page.waitForURL(/\/life-analysis/, { timeout: 60000 });
      ok(`N4 ${name}: dönüş Analiz Merkezi'ne`, page.url().endsWith("/life-analysis"));
    }
    await ctx.close();
  }
  // Uzmanı ilk hâline döndür (yerel sahte DB).
  await setPerms(ROLES.expertNo.id, { clients: true, astrology: false, astrology_provider_interp: false });
  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(`\nastrology menu UI [${tag}]: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
