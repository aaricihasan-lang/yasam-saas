/**
 * AŞAMA 4a — yerel UI doğrulaması (Playwright; yalnız localhost, dış istekler engellenir; sentetik veri).
 * Önkoşul: scripts/uye-arsiv-4a/ui-stack.ts + yerel `next dev` (BASE). Production'a temas YOK.
 * Kapsam: Üye Detayı (arşivde / pasif / arşivden çıkar / arşivle), Üye Listesi V2 (pasif ≠ arşiv ≠ deneme durdu),
 * klasik "Pasif ve Arşiv" görünümü, 320–1280 px taşma + ekran görüntüleri.
 */
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.UD2_BASE ?? "http://localhost:3974";
const SHOTS = process.env.UD2_SHOTS ?? path.join(os.tmpdir(), "uye-arsiv-4a-shots");
const cfg = JSON.parse(readFileSync(path.join(os.tmpdir(), "uye-detay-v2-ui.json"), "utf8"));
mkdirSync(SHOTS, { recursive: true });
const db = new pg.Client({ host: "127.0.0.1", port: cfg.pg.port, user: "postgres", password: "testpw", database: "postgres" });
await db.connect();
const q1 = async (sql, args = []) => (await db.query(sql, args)).rows[0];

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l, d) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${d === undefined ? "" : ` — ${JSON.stringify(d).slice(0, 300)}`}`); }
};
const consoleErrors = [];
const browser = await chromium.launch();
async function ctxFor(who, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  if (who.user.role === "admin") await ctx.addCookies([{ name: "yasam_admin_session", value: who.token, url: BASE }]);
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
async function openDetail(ctx, id, hash = "") {
  const page = await ctx.newPage();
  watch(page);
  await page.goto(`${BASE}/admin/users/${id}${hash}`, { waitUntil: "domcontentloaded" });
  await page.locator("#uye-detay-ad").waitFor({ timeout: 120_000 });
  await page.waitForTimeout(700);
  return page;
}
async function openList(ctx, qs) {
  const page = await ctx.newPage();
  watch(page);
  await page.goto(`${BASE}/admin/users${qs}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-row], [data-list-empty]").first().waitFor({ state: "attached", timeout: 120_000 });
  await page.waitForTimeout(500);
  return page;
}
const shot = async (page, name, full = true) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });
async function overflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const pageOv = document.documentElement.scrollWidth - vw;
    const scrollers = [...document.querySelectorAll("*")].filter((e) => {
      const s = getComputedStyle(e);
      return (s.overflowX === "auto" || s.overflowX === "scroll" || s.overflowX === "hidden") && e.scrollWidth > e.clientWidth + 1;
    });
    const out = [...document.querySelectorAll("main *, [role=dialog] *")].filter((el) => {
      if (el.closest("[hidden]")) return false;
      if (scrollers.some((s) => s !== el && s.contains(el))) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.right > vw + 1 || r.left < -1);
    }).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`);
    return { pageOv, out: out.slice(0, 5), n: out.length };
  });
}
const tab = async (page, id, label) => {
  await page.getByRole("tab", { name: label, exact: false }).first().click();
  await page.locator(`#uye-panel-${id}`).waitFor({ state: "visible" });
  await page.waitForTimeout(200);
};
const danger = (page) => page.locator('[role="group"][aria-labelledby="actions-danger"]');
const O = cfg.owner, A2 = cfg.admin2, I = cfg.ids;
const st = async (id) => q1(`select active, archived_at from public.users where id=$1`, [id]);

console.log("[1] Arşivdeki hesap — detay (ana yönetici)");
{
  const ctx = await ctxFor(O);
  const page = await openDetail(ctx, I.archivedOne);
  ok((await page.locator("header, [class*=head]").first().innerText()).includes("Arşivde"), "başlık rozeti “Arşivde”");
  ok(await page.locator("[data-archived-at]").first().isVisible(), "Özet › Hesap Durumu: arşivlenme tarihi");
  ok(await page.locator("[data-archived-banner]").isVisible(), "arşiv bandı: kayıtlar görünür, değişiklik için önce arşivden çıkarma");
  await shot(page, "01-arsivde-ozet");
  await tab(page, "gelismis", "Gelişmiş");
  ok((await page.getByRole("button", { name: "Aktif Yap" }).count()) === 0, "“Aktif Yap” YOK (arşivdeki hesap doğrudan açılmaz)");
  ok((await danger(page).getByRole("button", { name: "Pasife Al ve Arşivle" }).count()) === 0, "arşivdeki hesapta “Pasife Al ve Arşivle” yok");
  const unBtn = danger(page).getByRole("button", { name: "Arşivden Çıkar" });
  ok(await unBtn.isVisible() && await unBtn.isEnabled(), "“Arşivden Çıkar” görünür ve etkin (ana yönetici)");
  ok(await page.locator("[data-archived-note]").isVisible(), "açıklama: önce arşivden çıkarılır, hesap pasif kalır");
  await shot(page, "02-arsivde-gelismis");
  await unBtn.click();
  ok(await page.locator("#unarchive-title").isVisible(), "pencere açıldı");
  ok(await page.locator("[data-unarchive-submit]").isDisabled(), "parola boşken düğme kapalı");
  await shot(page, "03-arsivden-cikar-pencere", false);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  ok((await page.locator("#unarchive-title").count()) === 0 && (await st(I.archivedOne)).archived_at !== null, "Escape kapatır; kayıt değişmez");
  await unBtn.click();
  await page.locator("[data-unarchive-dialog] input").first().fill("yanlis-parola");
  await page.locator("[data-unarchive-submit]").click();
  await page.waitForTimeout(1500);
  ok(await page.locator("#unarchive-title").isVisible() && (await st(I.archivedOne)).archived_at !== null, "yanlış parola → pencere açık kalır, arşiv durumu değişmez");
  await page.locator("[data-unarchive-dialog] input").first().fill("zz-owner-pass");
  await page.locator("[data-unarchive-submit]").click();
  await page.locator("#unarchive-title").waitFor({ state: "detached", timeout: 30_000 });
  await page.waitForTimeout(1200);
  const s1 = await st(I.archivedOne);
  ok(s1.archived_at === null && s1.active === false, "doğru parola → arşivden çıktı, hesap PASİF (giriş hâlâ kapalı)", s1);
  ok(await page.getByRole("button", { name: "Aktif Yap" }).isVisible() && (await danger(page).getByRole("button", { name: "Arşivden Çıkar" }).count()) === 0,
    "ekran yerinde güncellendi: “Aktif Yap” geri geldi, “Arşivden Çıkar” kalktı");
  const aud = await q1(`select count(*)::int n from public.admin_audit_log where target_user_id=$1 and action='user_unarchived'`, [I.archivedOne]);
  ok(aud.n === 1, "yönetim geçmişine user_unarchived yazıldı");
  await shot(page, "04-arsivden-cikti-pasif");
  await page.getByRole("button", { name: "Aktif Yap" }).click();
  await page.waitForTimeout(1500);
  ok((await st(I.archivedOne)).active === true, "sonra “Aktif Yap” → hesap aktif (mevcut kural)");
  await page.close();
  await ctx.close();
}

console.log("\n[2] Yardımcı yönetici — arşivdeki hesap");
{
  const ctx = await ctxFor(A2);
  const page = await openDetail(ctx, I.archivedLong, "#gelismis");
  const b = danger(page).getByRole("button", { name: "Arşivden Çıkar" });
  ok(await b.isVisible() && await b.isDisabled(), "“Arşivden Çıkar” görünür ama kapalı (yalnız ana yönetici)");
  const r = await page.evaluate(async ([id, a, t]) => {
    const res = await fetch(`/api/admin/users/${id}/unarchive`, { method: "POST", headers: { "x-admin-id": a, "x-session-token": t, "Content-Type": "application/json" }, body: JSON.stringify({ adminPassword: "zz-owner-pass" }) });
    return res.status;
  }, [I.archivedLong, A2.user.id, A2.token]);
  ok(r === 403 && (await st(I.archivedLong)).archived_at !== null, "düğme atlanıp doğrudan istek → 403, kayıt değişmez (güvenlik sunucuda)");
  const r2 = await page.evaluate(async ([id, a, t]) => {
    const res = await fetch(`/api/admin/users/${id}/status`, { method: "POST", headers: { "x-admin-id": a, "x-session-token": t, "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle_active", currentActive: false }) });
    return res.status;
  }, [I.archivedLong, A2.user.id, A2.token]);
  ok(r2 === 409 && (await st(I.archivedLong)).active === false, "arşivdeki hesaba doğrudan “Aktif Yap” isteği → 409");
  await page.close();
  await ctx.close();
}

console.log("\n[2b] Arşivdeki hesapta değişiklik reddi (arayüzden)");
{
  const ctx = await ctxFor(O);
  const page = await openDetail(ctx, I.archivedLong, "#moduller");
  const before = await q1(`select md5(module_permissions::text) h from public.users where id=$1`, [I.archivedLong]);
  const sw = page.locator('#uye-panel-moduller [role="switch"], #uye-panel-moduller input[type="checkbox"]').first();
  const hasSwitch = (await sw.count()) > 0;
  if (hasSwitch) {
    await sw.click({ force: true });
    await page.waitForTimeout(1500);
  }
  const after = await q1(`select md5(module_permissions::text) h from public.users where id=$1`, [I.archivedLong]);
  ok(hasSwitch && after.h === before.h, "arşivde modül anahtarı → sunucu reddeder, izinler değişmez");
  const r = await page.evaluate(async ([id, a, t]) => {
    const res = await fetch(`/api/admin/users/${id}/payment`, { method: "POST", headers: { "x-admin-id": a, "x-session-token": t, "Content-Type": "application/json" }, body: JSON.stringify({ draft: { status: "paid" } }) });
    return { s: res.status, j: await res.json().catch(() => ({})) };
  }, [I.archivedLong, O.user.id, O.token]);
  ok(r.s === 409 && /arşivde/i.test(String(r.j.error)), "arşivde ödeme kaydı → 409 açıklamalı");
  await shot(page, "02b-arsivde-moduller-red");
  await page.close();
  await ctx.close();
}

console.log("\n[2c] Arşivleme seçeneği yalnız onaylı uzmanda");
{
  const ctx = await ctxFor(O);
  for (const [k, label] of [["pending", "onay bekleyen"], ["rejected", "reddedilen"]]) {
    const page = await openDetail(ctx, I[k], "#gelismis");
    ok((await page.getByRole("button", { name: "Pasife Al ve Arşivle" }).count()) === 0, `${label} başvuruda “Pasife Al ve Arşivle” sunulmaz`);
    await page.close();
  }
  const page = await openDetail(ctx, A2.user.id, "#gelismis");
  ok((await page.getByRole("button", { name: "Pasife Al ve Arşivle" }).count()) === 0 && (await page.getByRole("button", { name: "Pasif Yap" }).count()) === 1,
    "yönetici hesabında arşivleme yok; ayrı “Pasif Yap” korunur");
  await page.close();
  await ctx.close();
}

console.log("\n[3] Pasif hesap — detay");
{
  const ctx = await ctxFor(O);
  const page = await openDetail(ctx, I.passive, "#gelismis");
  ok(await page.getByRole("button", { name: "Aktif Yap" }).isVisible(), "pasif hesapta “Aktif Yap” var");
  ok((await danger(page).getByRole("button", { name: "Arşivden Çıkar" }).count()) === 0 && await danger(page).getByRole("button", { name: "Pasife Al ve Arşivle" }).isVisible(),
    "pasif hesap arşivde sayılmaz: “Arşivden Çıkar” yok, “Pasife Al ve Arşivle” var");
  ok((await page.locator("header, [class*=head]").first().innerText()).includes("Pasif"), "başlık rozeti “Pasif”");
  await shot(page, "05-pasif-gelismis");
  await page.close();
  await ctx.close();
}

console.log("\n[4] Arayüzden arşivleme (onay metni + parola korunur)");
{
  const ctx = await ctxFor(O);
  const page = await openDetail(ctx, I.toArchive, "#gelismis");
  await danger(page).getByRole("button", { name: "Pasife Al ve Arşivle" }).click();
  ok((await page.locator("#delete-confirm-title").locator("..").innerText()).includes("normal üye listesinden"), "onay penceresi yeni davranışı anlatır");
  await shot(page, "06-arsivle-onay", false);
  await page.getByRole("button", { name: "Evet, devam et" }).click();
  await page.locator('[role="dialog"] input[type="password"], [role="dialog"] input[autocomplete="current-password"]').first().fill("zz-owner-pass");
  await page.locator('[role="dialog"] input[placeholder="PASİFE AL VE ARŞİVLE"]').fill("PASİFE AL VE ARŞİVLE");
  await page.locator('[role="dialog"]').getByRole("button", { name: "Pasife Al ve Arşivle" }).last().click();
  await page.waitForURL(/\/admin\/users(\?|$)/, { timeout: 60_000 });
  const s = await st(I.toArchive);
  ok(s.active === false && s.archived_at !== null, "arşivlendi: giriş kapalı + archived_at", s);
  ok((await q1(`select count(*)::int n from public.user_sessions where user_id=$1 and is_active`, [I.toArchive])).n === 0, "oturumları sonlandırıldı");
  await page.close();
  await ctx.close();
}

console.log("\n[5] Üye Listesi V2");
{
  const ctx = await ctxFor(O);
  let page = await openList(ctx, "");
  ok(await page.locator(`[data-row="${I.passive}"]`).count() === 1 && (await page.locator(`[data-row="${I.passive}"] [data-stage]`).first().getAttribute("data-stage")) === "pasif",
    "Tüm üyeler: pasif hesap görünür, aşama “pasif”");
  ok(await page.locator(`[data-row="${I.legacyPassive}"]`).count() === 1, "eski pasif kayıt (arşivlenmemiş) listeden kaybolmadı");
  ok(await page.locator(`[data-row="${I.archivedLong}"]`).count() === 0 && await page.locator(`[data-row="${I.toArchive}"]`).count() === 0, "arşivdeki hesaplar Tüm üyeler'de yok");
  await page.locator("[data-more]").click();
  const more = await page.locator("[data-more-panel]").innerText();
  ok(more.includes("Denemesi durdurulanlar") && more.includes("Pasif hesaplar") && more.includes("Arşiv") && !more.includes("Askıya alınanlar"),
    "Diğer filtreler: Denemesi durdurulanlar · Pasif hesaplar · Arşiv (karışan etiket yok)");
  await shot(page, "07-liste-tum-uyeler");
  await page.close();
  page = await openList(ctx, "?f=pasif");
  const stages = await page.locator("[data-row] [data-stage]").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-stage")))]);
  ok(stages.length === 1 && stages[0] === "pasif" && await page.locator('[data-notice="pasif"]').isVisible(), "f=pasif: yalnız pasif + açıklama", stages);
  await shot(page, "08-liste-pasif");
  await page.close();
  page = await openList(ctx, "?f=arsiv");
  const ars = await page.locator("[data-row]").evaluateAll((els) => els.map((e) => e.getAttribute("data-row")));
  ok(ars.includes(I.archivedLong) && ars.includes(I.toArchive) && !ars.includes(I.passive) && !ars.includes(I.legacyPassive),
    "f=arsiv: yalnız gerçekten arşivlenmiş hesaplar");
  ok((await page.locator('[data-notice="arsiv"]').innerText()).includes("ana yöneticinin arşivlediği"), "arşiv açıklaması güncel");
  await shot(page, "09-liste-arsiv");
  await page.close();
  page = await openList(ctx, "?f=askida");
  ok((await page.locator('[data-notice="askida"]').innerText()).includes("denemesi durdurulmuş"), "f=askida: deneme durumu olduğu açıkça yazılı");
  await page.close();
  await ctx.close();
}

console.log("\n[6] Klasik “Pasif ve Arşiv” görünümü");
{
  const ctx = await ctxFor(O);
  const page = await ctx.newPage();
  watch(page);
  await page.goto(`${BASE}/admin/users/klasik?view=archive`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-row-state]").first().waitFor({ timeout: 120_000 });
  const rowOf = (name) => page.locator("article").filter({ hasText: name });
  ok(await rowOf("ZZ_UD2 Pasif Hesap").locator('[data-row-state="pasif"]').count() === 1
     && await rowOf("ZZ_UD2 Pasif Hesap").getByRole("button", { name: "Yeniden Aktifleştir" }).count() === 1, "pasif satır: “Pasif · arşivlenmemiş” + Yeniden Aktifleştir");
  ok(await rowOf("Nurcihan").locator('[data-row-state="arsiv"]').count() === 1
     && await rowOf("Nurcihan").getByRole("button", { name: "Yeniden Aktifleştir" }).count() === 0, "arşiv satırı: “Arşivde” + Yeniden Aktifleştir YOK");
  ok((await page.locator("h2").filter({ hasText: "Pasif ve arşivdeki" }).count()) === 1, "başlık “Pasif ve arşivdeki onaylı uzmanlar”");
  ok((await page.getByRole("tab", { name: /Pasif \+ Arşiv/ }).count()) === 1 && (await page.getByText("Pasif + Arşiv", { exact: false }).count()) >= 2,
    "birleşik sayaç/sekme adı açıkça “Pasif + Arşiv”");
  await shot(page, "10-klasik-pasif-arsiv");
  await page.close();
  await ctx.close();
}

console.log("\n[7] Duyarlı düzen 320 · 360 · 390 · 768 · 1024 · 1280");
{
  for (const w of [320, 360, 390, 768, 1024, 1280]) {
    const ctx = await ctxFor(O, { width: w, height: 860 });
    let page = await openDetail(ctx, I.archivedLong, "#gelismis");
    let ov = await overflow(page);
    ok(ov.pageOv <= 0 && ov.n === 0, `${w}px detay (arşivde, uzun ad) — taşma yok`, ov);
    const b = danger(page).getByRole("button", { name: "Arşivden Çıkar" });
    await b.scrollIntoViewIfNeeded();
    const bb = await b.boundingBox();
    ok(bb && bb.x >= 0 && bb.x + bb.width <= w + 1, `${w}px “Arşivden Çıkar” ekranda tam`);
    await shot(page, `11-${w}-detay-arsivde`);
    await b.click();
    await page.locator("#unarchive-title").waitFor();
    ov = await overflow(page);
    const sb = await page.locator("[data-unarchive-submit]").boundingBox();
    ok(ov.pageOv <= 0 && ov.n === 0 && sb && sb.x >= 0 && sb.x + sb.width <= w + 1 && sb.y + sb.height <= 860 + 1,
      `${w}px pencere: taşma yok, onay düğmesi görünür alanda`, { ov, sb });
    await shot(page, `12-${w}-arsivden-cikar-pencere`, false);
    await page.keyboard.press("Escape");
    await page.close();
    page = await openList(ctx, "?f=pasif");
    ov = await overflow(page);
    ok(ov.pageOv <= 0 && ov.n === 0, `${w}px liste (Pasif hesaplar) — taşma yok`, ov);
    await shot(page, `13-${w}-liste-pasif`);
    await page.close();
    page = await ctx.newPage();
    watch(page);
    await page.goto(`${BASE}/admin/users/klasik?view=archive`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-row-state]").first().waitFor({ timeout: 120_000 });
    ov = await overflow(page);
    ok(ov.pageOv <= 0 && ov.n === 0, `${w}px klasik pasif/arşiv — taşma yok`, ov);
    await shot(page, `14-${w}-klasik-pasif-arsiv`);
    await page.close();
    await ctx.close();
  }
}

ok(consoleErrors.length === 0, "tarayıcı konsolunda hata yok", consoleErrors.slice(0, 5));
await browser.close();
await db.end();
console.log(`\nAŞAMA 4a UI: ${pass} PASS / ${fail} FAIL`);
if (fail) { console.log("Başarısız:", failures); process.exit(1); }
