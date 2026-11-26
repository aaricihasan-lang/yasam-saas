/**
 * ÜYE PASİFLEŞTİRME F4 — yerel UI doğrulaması (Playwright; yalnız localhost, dış istekler engellenir; sentetik veri).
 * Önkoşul: scripts/uye-arsiv-4a/ui-stack.ts + yerel `next dev` (UD2_BASE). Production'a temas YOK.
 * Bu betik yığın veritabanına 20280126000000 migration'ını uygular (yeniden çalıştırılabilir) ve mevcut Üye Detayı
 * sayfasında Pasif Yap / Aktif Yap akışını, rozetleri, onay metnini, yönetici hesabının eski davranışını ve 360 px
 * taşmayı doğrular. Yeni sayfa / modül YOK.
 */
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { claimShotsDir, resolveUiConfig } from "../uye-yonetimi-faz2/uiKosu.mjs";

const BASE = process.env.UD2_BASE ?? "http://localhost:3974";
const SHOTS = claimShotsDir(process.env.UD2_SHOTS ?? path.join(os.tmpdir(), "uye-pasif-f4-shots"));
const UI_CFG = await resolveUiConfig({ envVar: "UD2_CFG", prefixes: ["uye-detay-v2-ui-", "uye-arsiv-4a-ui-"] });
const cfg = UI_CFG.cfg;
mkdirSync(SHOTS, { recursive: true });
const db = new pg.Client({ host: "127.0.0.1", port: cfg.pg.port, user: "postgres", password: "testpw", database: "postgres" });
await db.connect();
const q1 = async (sql, args = []) => (await db.query(sql, args)).rows[0];

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l, d) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${d === undefined ? "" : ` — ${JSON.stringify(d).slice(0, 300)}`}`); }
};

// F7 sonrası yığında (audit CHECK 37 eylem) 20280126 ailesi yeniden uygulanmaz: ön koşulu bilinçli fail-closed (prod'da her migration bir kez çalışır).
if (!(await db.query(`select to_regprocedure('public.admin_set_member_access_message(uuid,uuid,text,text)') is not null x`)).rows[0].x) await db.query(readFileSync(path.join(process.cwd(), "supabase/migrations/20280126000000_member_access_restriction.sql"), "utf8"));

const consoleErrors = [];
const browser = await chromium.launch();
async function ctxFor(who, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addCookies([{ name: "yasam_admin_session", value: who.token, url: BASE }]);
  await ctx.route((url) => !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url.toString()), (r) => r.abort());
  await ctx.addInitScript(([u, t]) => {
    try { localStorage.setItem("yasam_user", u); localStorage.setItem("yasam_session_token", t); } catch { /* yok */ }
  }, [JSON.stringify(who.user), who.token]);
  return ctx;
}
function watch(page) {
  page.on("pageerror", (e) => consoleErrors.push(`pageerror ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_FAILED|favicon/.test(m.text())) consoleErrors.push(`console ${m.text().slice(0, 200)}`); });
}
async function openDetail(ctx, id) {
  const page = await ctx.newPage();
  watch(page);
  await page.goto(`${BASE}/admin/users/${id}`, { waitUntil: "domcontentloaded" });
  await page.locator("#uye-detay-ad").waitFor({ timeout: 120_000 });
  await page.waitForTimeout(700);
  return page;
}
const access = (page) => page.locator('section[data-quick-actions] [role="group"][aria-labelledby="actions-access"]');
const summary = (page) => page.locator("#uye-hesap-durumu");
const shot = async (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
const st = async (id) => q1(`select active, archived_at, access_restricted_at from public.users where id=$1`, [id]);
/** Status isteğinin yanıtını bekleyerek tıkla (soğuk derleme gecikmesine dayanıklı). */
async function clickAndWaitStatus(page, locator) {
  const resp = page.waitForResponse((r) => /\/api\/admin\/users\/[^/]+\/status$/.test(r.url()) && r.request().method() === "POST", { timeout: 60_000 });
  await locator.click();
  const r = await resp;
  await page.waitForTimeout(800);
  return { status: r.status(), body: r.request().postDataJSON() };
}
async function overflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    return document.documentElement.scrollWidth - vw;
  });
}
const O = cfg.owner, I = cfg.ids;

console.log("[1] Aktif uzman → Pasif Yap (ana yönetici)");
{
  const ctx = await ctxFor(O);
  const page = await openDetail(ctx, I.proPaid);
  ok((await summary(page).getAttribute("data-account-state")) === "active" && await access(page).getByRole("button", { name: "Pasif Yap" }).isVisible()
    && (await access(page).getByRole("button", { name: "Aktif Yap" }).count()) === 0, "aktif uzman: durum 'active', yalnız 'Pasif Yap' görünür");
  await access(page).getByRole("button", { name: "Pasif Yap" }).click();
  const dlg = page.locator('[role="dialog"][aria-labelledby="deactivate-title"]');
  await dlg.waitFor({ timeout: 15_000 });
  ok(await dlg.locator('[data-deactivate-mode="restrict"]').isVisible() && /Oturumlar kapatılmaz/.test(await dlg.innerText())
    && (await dlg.getByRole("button", { name: "Pasif yap" }).count()) === 1, "onay penceresi: yeni davranış metni + 'Pasif yap' düğmesi (çıkış yaptırma YOK)");
  await shot(page, "01-pasif-yap-onay");
  const sessBefore = (await q1(`select count(*) filter (where is_active)::int n from public.user_sessions where user_id=$1`, [I.proPaid])).n;
  const r = await clickAndWaitStatus(page, dlg.getByRole("button", { name: "Pasif yap" }));
  const s = await st(I.proPaid);
  ok(r.status === 200 && r.body.action === "set_access" && r.body.restricted === true && r.body.expectedRestricted === false
    && s.active === true && s.access_restricted_at !== null, "Pasif Yap: set_access isteği 200; giriş açık, kısıt yazıldı", { r, s });
  const sessAfter = (await q1(`select count(*) filter (where is_active)::int n from public.user_sessions where user_id=$1`, [I.proPaid])).n;
  ok(sessAfter === sessBefore, "oturumlar kapatılmadı", { sessBefore, sessAfter });
  await dlg.waitFor({ state: "detached", timeout: 15_000 });
  ok((await summary(page).getAttribute("data-account-state")) === "restricted" && /Pasif: giriş açık, tüm modüller kilitli/.test(await summary(page).innerText())
    && (await summary(page).locator("[data-restricted-at]").count()) === 1, "ekran yerinde güncellendi: durum 'restricted', özet metni + pasif yapılma tarihi");
  ok(await access(page).getByRole("button", { name: "Aktif Yap" }).isVisible() && (await access(page).getByRole("button", { name: "Pasif Yap" }).count()) === 0,
    "kısıtlı uzman: 'Aktif Yap' görünür, 'Pasif Yap' gizli");
  ok((await page.locator("text=Pasif").first().isVisible()), "rozet 'Pasif' görünür");
  ok((await page.getByText("Pasif uzman sisteme girer ve modülleri görür", { exact: false }).count()) === 1
    && (await page.getByText("ikisi de girişi ve bütün oturumları kapatır", { exact: false }).count()) === 0,
    "arşiv açıklaması yeni tanımla tutarlı (eski 'ikisi de girişi kapatır' metni uzmanda yok)");
  await shot(page, "02-pasif-durum");

  console.log("\n[2] Aktif Yap (kısıtı kaldır)");
  const r2 = await clickAndWaitStatus(page, access(page).getByRole("button", { name: "Aktif Yap" }));
  const s2 = await st(I.proPaid);
  ok(r2.status === 200 && r2.body.action === "set_access" && r2.body.restricted === false && s2.access_restricted_at === null && s2.active === true,
    "Aktif Yap: set_access(false) 200; kısıt kalktı, hesap aktif", { r2, s2 });
  ok((await summary(page).getAttribute("data-account-state")) === "active" && await access(page).getByRole("button", { name: "Pasif Yap" }).isVisible(),
    "ekran: durum 'active', 'Pasif Yap' geri geldi");
  await page.close();
  await ctx.close();
}

console.log("\n[3] Eski giriş kapalı hesap · arşiv · yönetici hesabı");
{
  const ctx = await ctxFor(O);
  const p1 = await openDetail(ctx, I.passive);
  ok((await summary(p1).getAttribute("data-account-state")) === "passive" && /Giriş kapalı/.test(await summary(p1).innerText())
    && await access(p1).getByRole("button", { name: "Aktif Yap" }).isVisible() && (await access(p1).getByRole("button", { name: "Pasif Yap" }).count()) === 0,
    "eski giriş kapalı hesap: 'Giriş kapalı' rozeti; yalnız 'Aktif Yap' (mevcut akış)");
  await p1.close();
  const p2 = await openDetail(ctx, I.toArchive);
  ok((await access(p2).count()) === 0 && (await summary(p2).getAttribute("data-account-state")) === "archived", "arşivdeki hesap: Erişim düğmeleri yok (giriş tamamen kapalı)");
  await p2.close();
  const p3 = await openDetail(ctx, cfg.admin2.user.id);
  // F7 (Owner 26.11): yönetici hesabında düğme adı "Girişi Kapat" (davranış aynı: tüm cihazlardan çıkış).
  ok((await access(p3).getByRole("button", { name: "Pasif Yap", exact: true }).count()) === 0, "yönetici hesabında \"Pasif Yap\" yok (adı Girişi Kapat)");
  await access(p3).getByRole("button", { name: "Girişi Kapat", exact: true }).click();
  const dlg = p3.locator('[role="dialog"][aria-labelledby="deactivate-title"]');
  await dlg.waitFor({ timeout: 15_000 });
  ok((await dlg.locator('[data-deactivate-mode="restrict"]').count()) === 0 && /tüm cihazlardaki oturumlarını kapatır/.test(await dlg.innerText()),
    "yönetici hesabı: 'Girişi Kapat' penceresi (tüm cihazlardan çıkış) — davranış değişmedi");
  await dlg.getByRole("button", { name: "Vazgeç" }).click();
  ok((await st(cfg.admin2.user.id)).active === true, "Vazgeç: yönetici hesabı değişmedi");
  await p3.close();
  await ctx.close();
}

console.log("\n[4] Mobil 360 px");
{
  await db.query(`select public.admin_set_member_access_restriction($1,$2,true,false)`, [I.longName, O.user.id]);
  const ctx = await ctxFor(O, { width: 360, height: 780 });
  const page = await openDetail(ctx, I.longName);
  const ov = await overflow(page);
  ok(ov <= 1 && (await summary(page).getAttribute("data-account-state")) === "restricted", "360 px: kısıtlı uzun adlı hesap — yatay taşma yok", { ov });
  await shot(page, "03-mobil-360-pasif");
  await db.query(`select public.admin_set_member_access_restriction($1,$2,false,true)`, [I.longName, O.user.id]);
  await page.close();
  await ctx.close();
}

ok(consoleErrors.length === 0, "tarayıcı konsolunda hata yok", consoleErrors.slice(0, 5));
await browser.close();
await db.end();
console.log(`\nÜYE PASİFLEŞTİRME F4 UI: ${pass} PASS / ${fail} FAIL · görüntüler: ${SHOTS}`);
if (fail) { console.log("Başarısız:", failures); process.exit(1); }
