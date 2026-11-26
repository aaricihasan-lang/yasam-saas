/**
 * ÜYE PASİFLEŞTİRME F5 — pasif uzmanın ana sayfası (Playwright; yalnız localhost, dış istekler engellenir; sentetik veri).
 * Önkoşul: scripts/uye-arsiv-4a/ui-stack.ts + yerel `next dev` (UD2_BASE). Production'a temas YOK.
 * Betik yığın veritabanına 20280126000000 + 20280126000100 migration'larını uygular (yeniden çalıştırılabilir).
 *
 *   [1] aktif uzman: bant yok, modül kutuları açık, sol menü bağlantılı (mevcut davranış)
 *   [2] uzman sistemdeyken yönetici pasif yapar → modül tıklaması: rota ekranı standart metin; API 403
 *   [3] pasif ana sayfa: kırmızı bant (standart metin) · bütün kutular kilitli · tıklama modül AÇMAZ + uyarı ·
 *       sol menü kilitli · doğrudan URL kapalı · güvenlik istisnaları açık · Ayarlar › Üyeliğim "Pasif"
 *   [4] birden fazla sekme + yeniden aktifleştirme: sekme görünür olunca kilitler yeniden giriş GEREKMEDEN kalkar
 *   [5] kilitli kutuya tıklamada güncel profil: yönetici aktif yaptıysa kilitler kalkar
 *   [6] 360 px mobil: bant + kilitli kutular, yatay taşma yok
 *   [7] kayıtlar korunur (danışan / audit satırı silinmez)
 */
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { claimShotsDir, resolveUiConfig } from "../uye-yonetimi-faz2/uiKosu.mjs";

const BASE = process.env.UD2_BASE ?? "http://localhost:3974";
const SHOTS = claimShotsDir(process.env.UD2_SHOTS ?? path.join(os.tmpdir(), "uye-pasif-f5-shots"));
const UI_CFG = await resolveUiConfig({ envVar: "UD2_CFG", prefixes: ["uye-detay-v2-ui-", "uye-arsiv-4a-ui-"] });
const cfg = UI_CFG.cfg;
mkdirSync(SHOTS, { recursive: true });
const db = new pg.Client({ host: "127.0.0.1", port: cfg.pg.port, user: "postgres", password: "testpw", database: "postgres" });
await db.connect();
const q1 = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const NOTICE = "Üyeliğiniz şu anda pasif durumdadır. Sistemi kullanmaya devam edebilmek için lütfen sistem yöneticimizle iletişime geçiniz.";

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l, d) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${d === undefined ? "" : ` — ${JSON.stringify(d).slice(0, 300)}`}`); }
};

// F7 sonrası yığında (audit CHECK 37 eylem) 20280126 ailesi yeniden uygulanmaz: ön koşulu bilinçli fail-closed (prod'da her migration bir kez çalışır).
const f7Applied = (await db.query(`select to_regprocedure('public.admin_set_member_access_message(uuid,uuid,text,text)') is not null x`)).rows[0].x;
for (const m of f7Applied ? [] : ["20280126000000_member_access_restriction.sql", "20280126000100_member_list_access_restricted.sql", "20280126000200_usage360_member_access_states.sql"]) {
  await db.query(readFileSync(path.join(process.cwd(), "supabase/migrations", m), "utf8"));
}
const E = cfg.expert, O = cfg.owner;
const EID = E.user.id;
const restrict = (on) => db.query(`select public.admin_set_member_access_restriction($1,$2,$3,$4)`, [EID, O.user.id, on, !on]);
const counts0 = await q1(`select (select count(*)::int from public.users) u, (select count(*)::int from public.clients) c, (select count(*)::int from public.admin_audit_log) a`);

const consoleErrors = [];
const browser = await chromium.launch();
async function ctxFor(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.route((url) => !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url.toString()), (r) => r.abort());
  await ctx.addInitScript(([u, t]) => {
    try { if (!localStorage.getItem("yasam_user")) { localStorage.setItem("yasam_user", u); localStorage.setItem("yasam_session_token", t); } } catch { /* yok */ }
  }, [JSON.stringify(E.user), E.token]);
  return ctx;
}
function watch(page) {
  page.on("pageerror", (e) => consoleErrors.push(`pageerror ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|net::ERR_FAILED|favicon|status of 403|Kullanıcı kaydı yenilenemedi|yüklenemedi: (403|500)$/.test(m.text()) /* liste sayfası yan kartları: kısıtta 403; sentetik yığında client_charges / client_homeworks tablosu yok → 500 (aktifte de) */) consoleErrors.push(`console ${m.text().slice(0, 200)}`);
  });
}
const grid = (p) => p.locator('[data-testid="home-hub-grid"]');
const banner = (p) => p.locator('[data-testid="home-access-restricted"]');
async function openHome(ctx) {
  const page = await ctx.newPage();
  watch(page);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await grid(page).waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500); // profil senkronu
  return page;
}
const openCards = (p) => grid(p).locator("a").count();
const lockedCards = (p) => grid(p).locator('[role="button"]').count();
async function openModulesMenu(p) {
  const list = p.locator('[data-testid="home-all-modules-list"]');
  const id = (await list.count()) ? await list.first().getAttribute("id") : null;
  const btn = id ? p.locator(`button[aria-controls="${id}"]`).first() : p.locator("button[aria-controls]").filter({ hasText: /Tüm Modüller/ }).first();
  if ((await btn.count()) && (await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  await p.waitForTimeout(400);
  return list;
}
const apiStatus = (p, url, opts = {}) => p.evaluate(async ([u, tok, uid, o]) => {
  const r = await fetch(u, { ...o, headers: { "x-user-id": uid, "x-session-token": tok, ...(o.headers ?? {}) } });
  let code = ""; try { code = (await r.json()).code ?? ""; } catch { /* */ }
  return `${r.status}${code ? `:${code}` : ""}`;
}, [url, E.token, EID, opts]);
const toastText = async (p) => { await p.waitForTimeout(600); return (await p.locator("body").innerText()).includes(NOTICE); };

console.log("[1] Aktif uzman (mevcut davranış)");
const ctx = await ctxFor();
const home = await openHome(ctx);
const activeOpenHrefs = (await grid(home).locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")))).sort();
ok((await banner(home).count()) === 0 && activeOpenHrefs.length > 0 && (await lockedCards(home)) === 0, "aktif: bant yok, kutular açık bağlantı (yalnız meşru haklar)", activeOpenHrefs);
const menuA = await openModulesMenu(home);
ok((await menuA.locator("a").count()) > 0 && (await menuA.locator('[data-locked="1"]').count()) === 0, "aktif: sol menü merkezleri bağlantılı, kilitli değil");
await home.screenshot({ path: path.join(SHOTS, "01-aktif.png"), fullPage: true });

console.log("\n[2] Uzman sistemdeyken yönetici pasif yapar");
await restrict(true);
// Ekranda hâlâ açık görünen (bayat) korumalı modül kutusu: Danışan Yolculuğu.
const firstHref = "/danisan-yolculugu";
await grid(home).locator(`a[href="${firstHref}"]`).click();
await home.locator('[data-testid="module-access-restricted"]').waitFor({ timeout: 90_000 });
ok((await home.locator('[data-testid="module-access-restricted"]').innerText()).includes(NOTICE) && /Üyeliğiniz Pasif/.test(await home.locator("h1").first().innerText()),
  "ekranda açık kalan (bayat) kutuya tıklama: ilk 403 sinyaliyle modül kapanır, rota ekranı standart metin", { firstHref });
ok((await apiStatus(home, "/api/clients")) === "403:ACCOUNT_RESTRICTED", "AÇIK oturumla API: danışan listesi 403 ACCOUNT_RESTRICTED");
await home.screenshot({ path: path.join(SHOTS, "02-rota-ekrani.png"), fullPage: true });

console.log("\n[2b] Ana sayfa açıkken kısıt: ilk 403 sinyali");
await restrict(false);
await home.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await grid(home).waitFor({ timeout: 120_000 });
await home.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await home.waitForTimeout(2500);
ok((await banner(home).count()) === 0 && (await openCards(home)) > 0, "yeniden aktif: ana sayfa açık");
await restrict(true);
ok((await apiStatus(home, "/api/clients/stats")) === "403:ACCOUNT_RESTRICTED", "ana sayfadan herhangi bir API isteği 403");
await banner(home).waitFor({ timeout: 15_000 }).catch(() => undefined);
ok((await banner(home).count()) === 1 && (await openCards(home)) === 0 && (await lockedCards(home)) > 0, "aynı sekmede (yenilemeden) bant geldi, kutular görünür ve kilitli");

console.log("\n[3] Pasif uzmanın ana sayfası");
await home.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await grid(home).waitFor({ timeout: 120_000 });
await banner(home).waitFor({ timeout: 30_000 });
ok((await banner(home).innerText()).trim() === NOTICE && (await banner(home).getAttribute("role")) === "alert", "üst bölümde kırmızı bant: standart metin (role=alert)");
const color = await banner(home).evaluate((el) => getComputedStyle(el).backgroundColor + "|" + getComputedStyle(el).color);
ok(/rgb\(255, 241, 242\)|rgb\(254/.test(color), "bant kırmızı tonlu (rose-50 zemin)", color);
const ALL_CENTERS = 7; // homeCenters.dashboardModules (ürün merkezleri; yönetici kartı yok)
ok((await openCards(home)) === 0 && (await lockedCards(home)) === ALL_CENTERS, "TÜM ürün merkezleri (hakkı olmayanlar dahil) görünür ve KİLİTLİ", { locked: await lockedCards(home), open: activeOpenHrefs.length });
ok((await home.locator('a[href^="/admin"]').count()) === 0, "yönetici menüsü / yönetim bağlantısı gösterilmez");
const urlBefore = home.url();
await grid(home).locator('[role="button"]').first().click();
ok(home.url() === urlBefore && (await toastText(home)), "kilitli kutuya tıklama: sayfa değişmez, kibar uyarı (standart metin)");
const menuR = await openModulesMenu(home);
const lockedGroups = await menuR.locator('[data-locked="1"]').count();
ok(lockedGroups === ALL_CENTERS && (await menuR.locator("a").count()) === 0, "sol menü: tüm merkezler görünür ve kilitli (modül bağlantısı yok)", { lockedGroups });
// aria-disabled="true" düğmeyi Playwright "etkin değil" sayar; görünürlük ayrıca doğrulanır, tıklama gerçek kullanıcı gibi.
const lockedBtn = menuR.locator('[data-locked="1"] button').first();
const lockedVisible = await lockedBtn.isVisible();
await lockedBtn.click({ force: true });
ok(lockedVisible && home.url() === urlBefore && (await toastText(home)), "sol menüde kilitli merkeze tıklama: modül açılmaz, uyarı (standart metin)");
await home.screenshot({ path: path.join(SHOTS, "03-pasif-ana-sayfa.png"), fullPage: true });
for (const u of ["/danisan-yolculugu", "/numeroloji"]) {
  const p = await ctx.newPage(); watch(p);
  await p.goto(`${BASE}${u}`, { waitUntil: "domcontentloaded" });
  await p.locator('[data-testid="module-access-restricted"]').waitFor({ timeout: 90_000 }).catch(() => undefined);
  ok((await p.locator('[data-testid="module-access-restricted"]').count()) === 1, `doğrudan URL ${u}: kısıt ekranı (modül açılmaz)`);
  await p.close();
}
// F5-R1: modül kuralı olmayan ürün gezinme sayfaları (yalnız pasif hesapta kapalı).
for (const u of ["/life-analysis", "/beslenme", "/dashboard"]) {
  const p = await ctx.newPage(); watch(p);
  await p.goto(`${BASE}${u}`, { waitUntil: "domcontentloaded" });
  await p.locator('[data-testid="module-access-restricted"]').waitFor({ timeout: 90_000 }).catch(() => undefined);
  const links = await p.locator('main a[href="/numeroloji"], main a[href^="/human-design"], main a[href^="/beslenme/"], main a[href^="/dashboard/"]').count();
  ok((await p.locator('[data-testid="module-access-restricted"]').count()) === 1 && links === 0, `doğrudan URL ${u}: kısıt ekranı, modül bağlantısı yok`, { links });
  await p.close();
}
{
  // Modül hakkı OLMAYAN pasif uzman da tüm merkezleri kilitli görür (yalnız görünüm; izinler değişmez).
  const orig = (await q1(`select module_permissions m from public.users where id=$1`, [EID])).m;
  await db.query(`update public.users set module_permissions='{}'::jsonb where id=$1`, [EID]);
  const p = await ctx.newPage(); watch(p);
  await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await banner(p).waitFor({ timeout: 60_000 });
  await p.waitForTimeout(1500);
  ok((await openCards(p)) === 0 && (await lockedCards(p)) === ALL_CENTERS, "modül hakkı OLMAYAN pasif uzman: tüm merkezler kilitli görünür", { locked: await lockedCards(p) });
  const perm = (await q1(`select module_permissions m from public.users where id=$1`, [EID])).m;
  ok(JSON.stringify(perm) === "{}", "görünürlük izinleri DEĞİŞTİRMEDİ (module_permissions boş kaldı)");
  await p.close();
  await db.query(`update public.users set module_permissions=$2::jsonb where id=$1`, [EID, JSON.stringify(orig)]);
}
ok((await apiStatus(home, "/api/settings/export", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })) === "403:ACCOUNT_RESTRICTED" && (await apiStatus(home, "/api/dashboard/summary")) === "403:ACCOUNT_RESTRICTED",
  "API: dışa aktarma ve ana sayfa sayaçları 403");
// Not: bu sentetik yığında /api/me/sessions oturum modeli v2 kolonları olmadığı için 500 döner (kısıtla ilgisiz);
// ölçüt kısıt kapısına TAKILMAMASIDIR. Gerçek şemada 200 (F3 harness [E2]).
const meS = await apiStatus(home, "/api/me/sessions");
ok((await apiStatus(home, "/api/auth/profile")) === "200" && (await apiStatus(home, "/api/settings/support")) === "200" && !meS.includes("ACCOUNT_RESTRICTED"),
  "güvenlik istisnaları açık: profil · destek · kendi oturumları (kısıt kapısına takılmaz)", { meS });
const st = await ctx.newPage(); watch(st);
await st.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
await st.getByRole("button", { name: /Üyeliğim/ }).first().click({ timeout: 90_000 });
await st.locator('[data-membership-kind]').waitFor({ timeout: 30_000 });
ok((await st.locator('[data-membership-kind]').getAttribute("data-membership-kind")) === "access_restricted" && (await st.locator('[data-membership-kind]').innerText()).includes(NOTICE),
  "Ayarlar › Üyeliğim: 'Pasif' + standart metin");
await st.close();

console.log("\n[4] Birden fazla sekme + yeniden aktifleştirme (yeniden giriş YOK)");
const tab2 = await openHome(ctx);
ok((await banner(tab2).count()) === 1, "ikinci sekme de pasif görünümde");
await restrict(false);
for (const p of [home, tab2]) {
  await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}
await home.waitForTimeout(2500);
ok((await banner(home).count()) === 0 && (await openCards(home)) > 0 && (await banner(tab2).count()) === 0 && (await openCards(tab2)) > 0,
  "yönetici aktif yaptı → sekme görünür olunca İKİ sekmede de bant kalktı, kutular açıldı (yeniden giriş yok)");
ok((await apiStatus(home, "/api/dashboard/summary")) === "200", "aynı oturumla API yeniden açık (ana sayfa sayaçları 200)");
const reHrefs = (await grid(home).locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")))).sort();
ok(JSON.stringify(reHrefs) === JSON.stringify(activeOpenHrefs), "yeniden aktif: YALNIZ önceki meşru merkezler açık (ek hak yok)", { reHrefs, activeOpenHrefs });

console.log("\n[5] Kilitli kutu tıklamasında güncel profil");
await restrict(true);
await apiStatus(home, "/api/dashboard/summary"); // ilk 403 → sinyal → pasif görünüm
await banner(home).waitFor({ timeout: 30_000 });
await restrict(false);
await grid(home).locator('[role="button"]').first().click();
await home.waitForTimeout(2500);
ok((await banner(home).count()) === 0 && (await openCards(home)) > 0, "aktif yapılmış uzman kilitli kutuya tıklayınca kilitler kalktı (modül tek tıkla açılmadı)");
await tab2.close();
await home.close();

console.log("\n[5b] Modül sayfası AÇIKKEN pasifleştirme (danışan listesi)");
{
  const p = await ctx.newPage(); watch(p);
  await p.goto(`${BASE}/danisan-yolculugu/liste`, { waitUntil: "domcontentloaded" });
  await p.locator("main h1").first().waitFor({ timeout: 120_000 });
  await p.evaluate(() => document.querySelector("main")?.setAttribute("data-zz-module-content", "1"));
  ok((await p.locator('[data-zz-module-content="1"]').count()) === 1, "aktif: modül sayfası açık (içerik işaretlendi)");
  await restrict(true);
  // Kısıt sonrası İLK ürün API isteği (sayfanın yaptığı herhangi bir yenileme / işlem ile aynı yol).
  const st = await p.evaluate(async ([tok, uid]) => (await fetch("/api/clients?page=1", { headers: { "x-user-id": uid, "x-session-token": tok } })).status, [E.token, EID]);
  await p.locator('[data-testid="module-access-restricted"]').waitFor({ timeout: 15_000 }).catch(() => undefined);
  ok(st === 403 && (await p.locator('[data-testid="module-access-restricted"]').count()) === 1 && (await p.locator('[data-zz-module-content="1"]').count()) === 0,
    "kısıt sonrası ilk API isteği 403 → açık modül içeriği ekrandan KALDIRILDI, kısıt ekranı", { st });
  await p.screenshot({ path: path.join(SHOTS, "02b-acik-modul-kisit.png") });
  await p.close();
  await restrict(false);
}
await ctx.close();

console.log("\n[6] Mobil 360 px");
await restrict(true);
const m = await ctxFor({ width: 360, height: 780 });
const mp = await openHome(m);
await banner(mp).waitFor({ timeout: 30_000 });
const ov = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(ov <= 1 && (await banner(mp).isVisible()) && (await openCards(mp)) === 0 && (await lockedCards(mp)) > 0, "360 px: bant görünür, kutular kilitli, yatay taşma yok", { ov });
await mp.screenshot({ path: path.join(SHOTS, "04-mobil-360.png"), fullPage: true });
await mp.getByRole("button", { name: "Menüyü aç" }).click();
await mp.waitForTimeout(500);
const mMenu = await openModulesMenu(mp);
const mLocked = mMenu.locator('[data-locked="1"] button').first();
const mUrl = mp.url();
const mVisible = await mLocked.isVisible();
await mLocked.click({ force: true });
ok(mVisible && (await mMenu.locator("a").count()) === 0 && mp.url() === mUrl && (await toastText(mp)),
  "360 px çekmece menü: merkezler kilitli, tıklama modül açmaz, uyarı");
await mp.screenshot({ path: path.join(SHOTS, "05-mobil-360-menu.png") });
await m.close();
await restrict(false);

console.log("\n[7] Kayıtlar korunur");
const counts1 = await q1(`select (select count(*)::int from public.users) u, (select count(*)::int from public.clients) c, (select count(*)::int from public.admin_audit_log) a`);
ok(counts1.u === counts0.u && counts1.c === counts0.c && counts1.a > counts0.a, "kullanıcı ve danışan satırı silinmedi; her durum değişikliği audit'e yazıldı", { counts0, counts1 });
ok(consoleErrors.length === 0, "tarayıcı konsolunda beklenmeyen hata yok", consoleErrors.slice(0, 6));

await browser.close();
await db.end();
console.log(`\nÜYE PASİFLEŞTİRME F5 UI: ${pass} PASS / ${fail} FAIL · görüntüler: ${SHOTS}`);
if (fail) { console.log("Başarısız:", failures); process.exit(1); }
