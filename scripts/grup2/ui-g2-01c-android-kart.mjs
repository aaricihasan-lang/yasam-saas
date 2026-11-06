// G2-01B / A1 — Doğaltaş Yönetimi ana ekranı "Doğaltaş Kütüphanesi" kartı: web = ilk çizim sunucu kararı (istek YOK);
// YALNIZ resmî Android uygulamasında kimlikli kapıya (?yoklama=1, başlık oturumu) tek istek, yalnız 200+ok → 5. kart.
// Yetkisiz / 401 / 403 / 500 / ağ hatası / oturumsuz → kart yok, boş alan yok. Oturum değişimi + geç yanıt → sızıntı yok.
// Sunucu ucu ağ-mock'tur (gerçek kapı sunucuda). Prod'a SIFIR temas. Sunucu: SESSION_COOKIE_MODE=primary STONE_LIBRARY_ENABLED=true
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/grup2/ui-g2-01c-android-kart.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3978";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const mkUser = (id, extra = {}) => ({
  id, email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman", role: "expert", active: true, approval_status: "approved",
  package_type: "premium", membership_status: "active", tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true }, ...extra,
});
const UA_ID = "00000000-0000-4000-8000-0000000000a1", UB_ID = "00000000-0000-4000-8000-0000000000b2";
const APP_UA = "Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 YasamSistemiAndroid/1.0";
const CHROME_UA = "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.102 Mobile Safari/537.36";
const FOUR = ["Doğaltaşlar", "Mineraller", "Kombinasyonlar", "Taş Makaleleri"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();

/** probe(uid) → "200" | "404" | "401" | "403" | "500" | "abort" | { delay, then } */
// Gerçek sunucu gibi: token → kullanıcı bağlaması (userGuard). Profil token sahibini döner; kimlik ≠ token sahibi → 401.
const TOKEN_OWNER = { "zz-local-fake-token": UA_ID, "zz-other-token": UB_ID };
async function open({ ua, mobile, user, token = "zz-local-fake-token", probe }) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: mobile, isMobile: mobile, ...(ua ? { userAgent: ua } : {}) });
  await ctx.addInitScript(({ u, tk }) => {
    try {
      if (sessionStorage.getItem("zz_seeded")) return;
      sessionStorage.setItem("zz_seeded", "1");
      if (u) localStorage.setItem("yasam_user", JSON.stringify(u));
      if (tk) localStorage.setItem("yasam_session_token", tk);
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
  }, { u: user, tk: token });
  const probes = [];
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const p = url.pathname;
    const h = req.headers();
    if (p === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (p === "/api/auth/profile") {
      const owner = TOKEN_OWNER[h["x-session-token"] ?? ""];
      return route.fulfill({ status: 200, json: { profile: owner && owner !== user.id ? mkUser(owner) : user } });
    }
    if (p === "/api/dogaltas/kutuphane" && url.searchParams.get("yoklama") === "1") {
      const uid = h["x-user-id"] ?? null;
      probes.push({ uid, sess: h["x-session-token"] ?? null, t: Date.now() });
      const owner = TOKEN_OWNER[h["x-session-token"] ?? ""];
      if (owner && uid !== owner) return route.fulfill({ status: 401, json: { ok: false } }); // kimlik–token bağlama hatası
      let mode = probe(uid);
      if (typeof mode === "object") { await sleep(mode.delay); mode = mode.then; }
      if (mode === "abort") return route.abort();
      if (mode === "200") return route.fulfill({ status: 200, json: { ok: true } });
      return route.fulfill({ status: Number(mode), json: { ok: false, error: "x" } });
    }
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0, items: [], articles: [] } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return { ctx, page, probes, errors };
}
const cards = (page) => page.evaluate(() => {
  const nav = [...document.querySelectorAll("nav ul")].find((u) => u.querySelector('a[href="/dogaltas/dogaltas-listesi"]'));
  return nav ? [...nav.querySelectorAll(":scope > li")].map((li) => ({ title: li.querySelector("strong")?.textContent?.trim(), href: li.querySelector("a")?.getAttribute("href"), h: Math.round(li.getBoundingClientRect().height) })) : [];
});
async function hub(page) {
  await page.goto(`${BASE}/dogaltas`, { waitUntil: "load" });
  await page.locator('nav ul li a[href="/dogaltas/dogaltas-listesi"]').first().waitFor({ timeout: 90000 });
}
const LIB = "Doğaltaş Kütüphanesi";

// 1) WEB (masaüstü, çerez taşıması) — sunucu kararı (yerelde false): kart yok, istek YOK
{
  const g = "web";
  const { ctx, page, probes, errors } = await open({ ua: null, mobile: false, user: mkUser(UA_ID), probe: () => "200" });
  try {
    await hub(page); await sleep(2500);
    const c = await cards(page);
    ok(g, "taşıma çerez (data-session-transport=cookie)", (await page.evaluate(() => document.documentElement.getAttribute("data-session-transport"))) === "cookie");
    ok(g, "kart yoklaması YOK (0 istek)", probes.length === 0, JSON.stringify(probes));
    ok(g, "mevcut dört kart aynen, 5. kart yok", JSON.stringify(c.map((x) => x.title)) === JSON.stringify(FOUR), JSON.stringify(c));
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo", false, e); } finally { await ctx.close(); }
}
// 2) Android Chrome (uygulama değil) — web yolu: istek yok
{
  const g = "android-chrome";
  const { ctx, page, probes } = await open({ ua: CHROME_UA, mobile: true, user: mkUser(UA_ID), probe: () => "200" });
  try {
    await hub(page); await sleep(2500);
    ok(g, "uygulama dışı Android tarayıcıda kart yoklaması YOK", probes.length === 0, JSON.stringify(probes));
    ok(g, "dört kart, 5. kart yok", (await cards(page)).length === 4);
  } catch (e) { ok(g, "senaryo", false, e); } finally { await ctx.close(); }
}
// 3) Android uygulaması — yetkili
{
  const g = "android-yetkili";
  const { ctx, page, probes, errors } = await open({ ua: APP_UA, mobile: true, user: mkUser(UA_ID), probe: () => "200" });
  try {
    await hub(page);
    await page.locator('nav ul li a[href="/dogaltas/kutuphane"]').waitFor({ timeout: 15000 }).catch(() => {});
    const c = await cards(page);
    ok(g, "5. kart: Doğaltaş Kütüphanesi, mevcut dördün ardından, aynı bağlantı", JSON.stringify(c.map((x) => x.title)) === JSON.stringify([...FOUR, LIB]) && c[4]?.href === "/dogaltas/kutuphane", JSON.stringify(c));
    ok(g, "5. kart diğerleriyle aynı ölçüde", c[4] && c[4].h === c[3].h, JSON.stringify(c.map((x) => x.h)));
    ok(g, "tek yoklama (Suspense yedeği + içerik çift istek üretmez)", probes.length === 1, JSON.stringify(probes));
    ok(g, "yoklama başlık oturumuyla (x-user-id + x-session-token)", probes[0]?.uid === UA_ID && probes[0]?.sess === "zz-local-fake-token");
    // geri/ileri: başka sayfaya git, geri dön → aynı oturumda ek istek yok, kart yine var
    await page.locator('nav ul li a[href="/dogaltas/mineral-listesi"]').first().tap();
    await page.waitForURL(/mineral-listesi/, { timeout: 30000 });
    await page.goBack(); await page.locator('nav ul li a[href="/dogaltas/dogaltas-listesi"]').first().waitFor({ timeout: 30000 }); await sleep(1500);
    ok(g, "geri dönüşte kart var, ek yoklama yok (30 sn bellek)", (await cards(page)).some((x) => x.title === LIB) && probes.length === 1, `probes=${probes.length}`);
    await page.locator('nav ul li a[href="/dogaltas/kutuphane"]').first().tap();
    await page.waitForURL(/\/dogaltas\/kutuphane$/, { timeout: 30000 }).catch(() => {});
    ok(g, "karta dokununca kütüphane sayfası", new URL(page.url()).pathname === "/dogaltas/kutuphane", page.url());
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo", false, e); } finally { await ctx.close(); }
}
// 4–6) Android — yetkisiz (404), 401, 403, 500, ağ hatası → kart yok, boş alan yok
for (const mode of ["404", "401", "403", "500", "abort"]) {
  const g = `android-${mode}`;
  const { ctx, page, probes } = await open({ ua: APP_UA, mobile: true, user: mkUser(UA_ID), probe: () => mode });
  try {
    await hub(page); await sleep(3000);
    const c = await cards(page);
    ok(g, "kart yok; dört kart aynen; boş yer tutucu yok", JSON.stringify(c.map((x) => x.title)) === JSON.stringify(FOUR), JSON.stringify(c));
    ok(g, "yoklama yapıldı (yetki sunucuda kararlaştırılır)", probes.length === 1, String(probes.length));
  } catch (e) { ok(g, "senaryo", false, e); } finally { await ctx.close(); }
}
// 5) Android — oturumsuz (token yok) → istek yok, kart yok
{
  const g = "android-oturumsuz";
  const { ctx, page, probes } = await open({ ua: APP_UA, mobile: true, user: mkUser(UA_ID), token: null, probe: () => "200" });
  try {
    await page.goto(`${BASE}/dogaltas`, { waitUntil: "load" }); await sleep(4000);
    const c = await cards(page);
    ok(g, "token yokken kart yoklaması YOK ve kart yok", probes.length === 0 && !c.some((x) => x.title === LIB), JSON.stringify({ probes, c }));
  } catch (e) { ok(g, "senaryo", false, e); } finally { await ctx.close(); }
}
// 5b) Android — demo hesap (sunucu kapısı demo'yu 404 ile reddeder) → kart yok
{
  const g = "android-demo";
  const { ctx, page } = await open({ ua: APP_UA, mobile: true, user: mkUser(UA_ID, { is_demo_account: true }), probe: () => "404" });
  try {
    await hub(page); await sleep(3000);
    ok(g, "demo hesapta kart yok", !(await cards(page)).some((x) => x.title === LIB));
  } catch (e) { ok(g, "senaryo", false, e); } finally { await ctx.close(); }
}
// 7) Oturum değişimi + geç yanıt: A'nın (yetkili) yanıtı gecikir; bu sırada oturum B'ye (yetkisiz) geçer ve hub yeniden açılır
{
  const g = "oturum-degisimi";
  const { ctx, page, probes } = await open({ ua: APP_UA, mobile: true, user: mkUser(UA_ID), probe: (uid) => (uid === UA_ID ? { delay: 5000, then: "200" } : "404") });
  try {
    await hub(page); await sleep(500);
    await page.evaluate(({ b }) => { localStorage.setItem("yasam_user", JSON.stringify(b)); localStorage.setItem("yasam_session_token", "zz-other-token"); }, { b: mkUser(UB_ID) });
    await page.locator('nav ul li a[href="/dogaltas/mineral-listesi"]').first().tap();
    await page.waitForURL(/mineral-listesi/, { timeout: 30000 });
    await page.goBack(); await page.locator('nav ul li a[href="/dogaltas/dogaltas-listesi"]').first().waitFor({ timeout: 30000 });
    await sleep(7000); // A'nın geç yanıtı bu sürede gelir
    const c = await cards(page);
    console.log("   yoklamalar:", JSON.stringify(probes.map((x) => ({ uid: x.uid.slice(-2), sess: x.sess }))));
    ok(g, "B oturumunda yeni yoklama B kimliğiyle yapıldı", probes.some((x) => x.uid === UB_ID && x.sess === "zz-other-token"), JSON.stringify(probes));
    ok(g, "A'nın geç gelen yetkili yanıtı B'ye kart GÖSTERMEZ", !c.some((x) => x.title === LIB), JSON.stringify(c));
  } catch (e) { ok(g, "senaryo", false, e); } finally { await ctx.close(); }
}
// 8–13) Olumlu sonuç süresiz değil: aynı sayfada yeniden doğrulama (Playwright saati ile 30 sn ileri sarma)
const seqProbe = (modes) => { let i = 0; return () => modes[Math.min(i++, modes.length - 1)]; };
const hasLib = async (page) => (await cards(page)).some((x) => x.title === LIB);
async function timed(g, modes, body) {
  const { ctx, page, probes, errors } = await open({ ua: APP_UA, mobile: true, user: mkUser(UA_ID), probe: seqProbe(modes) });
  try {
    await page.clock.install({ time: new Date("2026-11-01T12:00:00Z") });
    await hub(page);
    await page.locator('nav ul li a[href="/dogaltas/kutuphane"]').waitFor({ timeout: 15000 });
    await body(page, probes);
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo", false, e); } finally { await ctx.close(); }
}
await timed("ayni-sayfada-iptal", ["200", "404"], async (page, probes) => {
  ok("ayni-sayfada-iptal", "başta kart var (1 yoklama)", (await hasLib(page)) && probes.length === 1);
  await page.clock.fastForward(31_000); await sleep(1500);
  ok("ayni-sayfada-iptal", "30 sn sonra yeniden doğrulama → 404 → kart GİZLİ", probes.length === 2 && !(await hasLib(page)), `probes=${probes.length}`);
  await page.clock.fastForward(120_000); await sleep(1500);
  ok("ayni-sayfada-iptal", "404 sonrası bu sayfada ek istek yok", probes.length === 2, `probes=${probes.length}`);
});
await timed("yeniden-dogrulama", ["200", "200", "200"], async (page, probes) => {
  for (let i = 0; i < 5; i++) { await page.clock.fastForward(5_000); await sleep(200); }
  ok("yeniden-dogrulama", "30 sn dolmadan ek istek yok (istek yağmuru yok)", probes.length === 1, `probes=${probes.length}`);
  await page.clock.fastForward(6_000); await sleep(1500);
  ok("yeniden-dogrulama", "30 sn'de taze doğrulama; yetkili → kart kalır", probes.length === 2 && (await hasLib(page)), `probes=${probes.length}`);
  await page.clock.fastForward(31_000); await sleep(1500);
  ok("yeniden-dogrulama", "her 30 sn'de bir doğrulama (3. istek)", probes.length === 3 && (await hasLib(page)), `probes=${probes.length}`);
});
await timed("oturum-suresi-doldu", ["200", "401"], async (page, probes) => {
  await page.clock.fastForward(31_000); await sleep(1500);
  ok("oturum-suresi-doldu", "401 (oturum bitti) → kart GİZLİ", probes.length === 2 && !(await hasLib(page)), `probes=${probes.length}`);
});
await timed("ag-hatasi-yeniden", ["200", "abort", "200"], async (page, probes) => {
  await page.clock.fastForward(31_000); await sleep(1500);
  ok("ag-hatasi-yeniden", "yeniden doğrulamada ağ hatası → eski olumlu sonuç KULLANILMAZ, kart gizli", !(await hasLib(page)), `probes=${probes.length}`);
  await page.clock.fastForward(31_000); await sleep(1500);
  ok("ag-hatasi-yeniden", "ağ hatası kalıcı red değil: sonraki doğrulamada yetkili → kart döner", probes.length === 3 && (await hasLib(page)), `probes=${probes.length}`);
});
await timed("grace-fail-closed", ["200", { delay: 20_000, then: "200" }], async (page, probes) => {
  await page.clock.fastForward(31_000); await sleep(800);
  ok("grace-fail-closed", "yanıt beklenirken kart bir süre görünür (en çok 10 sn)", await hasLib(page));
  await page.clock.fastForward(11_000); await sleep(800);
  ok("grace-fail-closed", "10 sn içinde olumlu yanıt yok → kart GİZLİ (fail-closed)", !(await hasLib(page)), `probes=${probes.length}`);
});
await timed("arka-plan", ["200", "200"], async (page, probes) => {
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.clock.fastForward(31_000); await sleep(1500);
  ok("arka-plan", "arka planda süre dolunca istek yok, kart gizli", probes.length === 1 && !(await hasLib(page)), `probes=${probes.length}`);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await sleep(1500);
  ok("arka-plan", "öne gelince hemen yeniden doğrulama → yetkili → kart döner", probes.length === 2 && (await hasLib(page)), `probes=${probes.length}`);
});
await browser.close();
console.log(`\nG2-01B Android kart UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
