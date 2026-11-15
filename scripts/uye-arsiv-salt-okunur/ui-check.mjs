/**
 * ÜYE DETAYI — ARŞİVDEKİ HESAP SALT-OKUNUR · yerel UI doğrulaması (Playwright; yalnız localhost, dış istekler engellenir).
 * Önkoşul: scripts/uye-arsiv-4a/ui-stack.ts + yerel `next dev` (BASE). Sentetik ZZ_UD2_* verisi; production'a temas YOK.
 * Yığını değiştirir (bir deneme hesabını gerçek RPC ile arşivler, aktif/pasif hesapta modül anahtarını aç-kapa yapar)
 * → uye-detay-v2 / uye-arsiv-4a UI kontrollerinden SONRA koşulur.
 * Kapsam: arşivdeki (Pro + deneme), pasif ve aktif hesap × beş sekme × 1280 / 1366 / 320 / 375 / 390 px.
 */
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.UD2_BASE ?? "http://localhost:3974";
const SHOTS = process.env.ASO_SHOTS ?? path.join(os.tmpdir(), "uye-arsiv-salt-okunur-shots");
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
const O = cfg.owner, I = cfg.ids;
const errs = [];
const writes = [];

// Deneme hesabını gerçek RPC ile arşivle (arşivde + deneme vakası).
if ((await q1(`select archived_at from public.users where id=$1`, [I.trialAct])).archived_at === null) {
  await db.query(`select public.admin_archive_user($1,$2)`, [I.trialAct, O.user.id]);
}
// 4a UI kontrolü archivedOne'ı arşivden çıkarıp aktifleştirir → o an arşivde olan Pro hesabı seçilir.
let archivedPro = null;
for (const id of [I.archivedOne, I.archivedLong]) {
  if ((await q1(`select archived_at from public.users where id=$1`, [id])).archived_at !== null) { archivedPro = id; break; }
}
if (!archivedPro) throw new Error("arşivde Pro hesap bulunamadı (yığın durumu)");
const st0 = await q1(`select (select active from public.users where id=$1) p, (select active from public.users where id=$2) a`, [I.passive, I.proPaid]);
if (st0.p !== false || st0.a !== true) throw new Error(`beklenmeyen yığın durumu (pasif=${st0.p}, aktif=${st0.a})`);
const ACC = [
  ["arsiv-pro", archivedPro, "archived"],
  ["arsiv-deneme", I.trialAct, "archived"],
  ["pasif", I.passive, "passive"],
  ["aktif", I.proPaid, "active"],
];
const fp = async (id) => (await q1(`select md5(u::text) h from public.users u where id=$1`, [id])).h;
const childFp = async (id) => q1(`select
  (select count(*)::int from public.user_payment_history where user_id=$1) ph,
  (select count(*)::int from public.member_pricing_phases where user_id=$1) mp,
  (select md5(coalesce(string_agg(t::text,'|'),'')) from public.trial_profiles t where user_id=$1) tp`, [id]);
const before = {};
for (const [, id, st] of ACC) if (st === "archived") before[id] = { u: await fp(id), c: JSON.stringify(await childFp(id)) };

const browser = await chromium.launch();
async function open(vp, id) {
  const ctx = await browser.newContext({ viewport: vp, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addCookies([{ name: "yasam_admin_session", value: O.token, url: BASE }]);
  await ctx.route((u) => !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u.toString()), (r) => r.abort());
  await ctx.addInitScript(([u, t]) => { try { localStorage.setItem("yasam_user", u); localStorage.setItem("yasam_session_token", t); } catch { /* yok */ } }, [JSON.stringify(O.user), O.token]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(`pageerror ${e.message.slice(0, 160)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR|favicon/.test(m.text())) errs.push(`console ${m.text().slice(0, 160)}`); });
  page.on("request", (r) => { if (["POST", "PATCH", "PUT", "DELETE"].includes(r.method()) && /\/api\/admin\//.test(r.url())) writes.push({ m: r.method(), p: new URL(r.url()).pathname }); });
  await page.goto(`${BASE}/admin/users/${id}`, { waitUntil: "domcontentloaded" });
  await page.locator("#uye-detay-ad").waitFor({ timeout: 180_000 });
  await page.waitForTimeout(700);
  return { ctx, page };
}
const tab = async (page, key) => {
  await page.locator(`[role="tab"][data-tab="${key}"]`).click();
  await page.locator(`#uye-panel-${key}`).waitFor({ state: "visible" });
  await page.waitForTimeout(400);
};
const overflow = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const scrollers = [...document.querySelectorAll("*")].filter((e) => { const s = getComputedStyle(e); return ["auto", "scroll", "hidden", "clip"].includes(s.overflowX) && e.scrollWidth > e.clientWidth + 1; });
  const out = [...document.querySelectorAll("main *")].filter((el) => {
    if (el.closest("[hidden]")) return false;
    if (scrollers.some((s) => s !== el && s.contains(el))) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.right > vw + 1 || r.left < -1);
  }).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`);
  return { pageOv: document.documentElement.scrollWidth - vw, n: out.length, out: out.slice(0, 4) };
});
/** Bir kapsayıcıdaki form denetimlerinin etkin / kapalı sayısı. */
const controls = (page, sel) => page.evaluate((s) => {
  const root = document.querySelector(s);
  if (!root) return null;
  const els = [...root.querySelectorAll("input, select, textarea, button[role='switch']")];
  return { n: els.length, disabled: els.filter((e) => e.matches(":disabled")).length };
}, sel);
const licenseSel = "#uye-panel-hesap fieldset";
async function openPayment(page) {
  const t = page.locator("#uye-panel-uyelik button[aria-expanded]").filter({ hasText: "Ödeme Takibi" }).first();
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
  await page.waitForTimeout(400);
}

const VPS = [["1280", { width: 1280, height: 900 }], ["1366", { width: 1366, height: 900 }], ["320", { width: 320, height: 780 }], ["375", { width: 375, height: 812 }], ["390", { width: 390, height: 844 }]];
const TABS = ["hesap", "ozet", "moduller", "uyelik", "gecmis"];

for (const [vl, vp] of VPS) {
  console.log(`\n[${vl}px]`);
  for (const [slug, id, st] of ACC) {
    const full = vl === "1280" || vl === "320" || st === "archived";
    if (!full && slug !== "aktif") continue;
    const { ctx, page } = await open(vp, id);
    const tag = `${vl}px ${slug}`;
    for (const key of TABS) {
      await tab(page, key);
      if (key === "uyelik") await openPayment(page);
      const ov = await overflow(page);
      ok(ov.pageOv <= 0 && ov.n === 0, `${tag} · ${key}: yatay taşma yok`, ov);
      await page.screenshot({ path: path.join(SHOTS, `${vl}-${slug}-${key}.png`), fullPage: true });
    }
    // ── Modüller ve Kredi
    await tab(page, "moduller");
    const sw = await controls(page, "#uye-erisim");
    if (st === "archived") {
      ok(sw && sw.n > 0 && sw.disabled === sw.n, `${tag}: modül / alt izin anahtarları kapalı (${sw?.disabled}/${sw?.n})`, sw);
      ok(await page.locator("#uye-erisim [data-archived-readonly]").isVisible(), `${tag}: modül izinleri salt-okunur notu`);
      ok((await page.locator("#uye-erisim").innerText()).includes("Numeroloji"), `${tag}: modül izinleri okunur`);
      if (slug === "arsiv-deneme") {
        const tc = await controls(page, "[data-trial-credit]");
        ok(tc && tc.n === 4 && tc.disabled === 4 && (await page.getByRole("button", { name: "Limitleri kaydet" }).count()) === 0, `${tag}: deneme kredisi salt-okunur (4 giriş kapalı, kaydet yok)`, tc);
      }
    } else {
      ok(sw && sw.n > 0 && sw.disabled < sw.n, `${tag}: modül anahtarları etkin (${sw?.n - sw?.disabled}/${sw?.n})`, sw);
      ok((await page.locator("#uye-erisim [data-archived-readonly]").count()) === 0, `${tag}: salt-okunur notu yok`);
    }
    // ── Üyelik ve Ödeme
    await tab(page, "uyelik");
    await openPayment(page);
    const add = page.getByRole("button", { name: "Fiyat dönemi ekle" });
    const pay = await controls(page, "[data-payment-form]");
    const saveDisabled = await page.getByRole("button", { name: "Ödemeyi Kaydet" }).isDisabled();
    if (st === "archived") {
      ok(await add.isDisabled(), `${tag}: "Fiyat dönemi ekle" kapalı`);
      ok(pay && pay.n > 0 && pay.disabled === pay.n && saveDisabled, `${tag}: ödeme formu + "Ödemeyi Kaydet" kapalı`, { pay, saveDisabled });
      ok(await page.locator("#uye-panel-uyelik [data-archived-readonly]").isVisible(), `${tag}: ödeme salt-okunur notu`);
      const hist = page.getByRole("button", { name: "Geçmiş Ödemeler" });
      ok(await hist.isEnabled(), `${tag}: "Geçmiş Ödemeler" okunabilir (etkin)`);
      const pc = page.locator("[data-pro-conversion]");
      if (await pc.count()) ok(await pc.isDisabled(), `${tag}: Pro üyeliğe geçiş kapalı`);
    } else {
      ok(await add.isEnabled(), `${tag}: "Fiyat dönemi ekle" etkin`);
      ok(pay && pay.disabled === 0 && !saveDisabled, `${tag}: ödeme formu ve "Ödemeyi Kaydet" etkin`, { pay, saveDisabled });
    }
    // ── Hesap ve Güvenlik
    await tab(page, "hesap");
    const lic = await controls(page, licenseSel);
    const licSave = await page.getByRole("button", { name: "Lisans Ayarlarını Kaydet" }).count();
    if (st === "archived") {
      ok(lic && lic.n > 0 && lic.disabled === lic.n, `${tag}: lisans / oturum / güvenlik istisnası kapalı (${lic?.disabled}/${lic?.n})`, lic);
      ok(licSave === 0, `${tag}: "Lisans Ayarlarını Kaydet" yok`);
      ok(await page.getByRole("button", { name: "Kullanım Kılavuzu" }).isEnabled(), `${tag}: lisans kılavuzu okunabilir`);
      const un = page.locator("[data-unarchive-open]");
      ok((await un.count()) === 1 && await un.isEnabled(), `${tag}: "Arşivden Çıkar" (ana yönetici) korunur`);
      if (slug === "arsiv-deneme") {
        for (const n of ["İncelemeye al", "Deneme erişimini durdur", "Erişimi sürdür", "İncelemeyi kaldır"]) ok((await page.getByRole("button", { name: n, exact: true }).count()) === 0, `${tag}: "${n}" yok`);
        ok(await page.locator("[data-trial-state-locked]").isVisible(), `${tag}: deneme durumu salt-okunur notu`);
      }
      await page.getByRole("button", { name: "Profili Düzenle" }).click();
      await page.waitForTimeout(300);
      const roleSel = page.locator("#uye-panel-hesap select").filter({ has: page.locator("option[value='admin']") }).first();
      ok(await roleSel.isDisabled() && await page.locator("#edit-role-hint").isVisible(), `${tag}: rol seçimi kapalı (açıklamalı)`);
      ok(await page.locator("#uye-panel-hesap input").first().isEnabled(), `${tag}: ad düzeltme alanı açık (sunucu izin verir)`);
      await page.locator("#uye-panel-hesap").getByRole("button", { name: "İptal", exact: true }).click();
    } else {
      // "Sınırsız" işaretli cihaz limitlerinin sayı kutusu tasarım gereği kapalıdır (mevcut davranış) → fieldset ölçülür.
      const fsOff = await page.evaluate((sel) => document.querySelector(sel)?.matches(":disabled") ?? null, licenseSel);
      const unlimitedBoxes = await page.locator(`${licenseSel} input[type="checkbox"]`).evaluateAll((els) => els.filter((e) => !e.matches(":disabled")).length);
      ok(fsOff === false && unlimitedBoxes > 0 && licSave === 1, `${tag}: lisans formu etkin (fieldset açık, ${unlimitedBoxes} onay kutusu etkin, kaydet var)`, { fsOff, unlimitedBoxes, licSave });
    }
    if (vl === "1280" || vl === "320") {
      await tab(page, "hesap");
      await page.screenshot({ path: path.join(SHOTS, `${vl}-${slug}-hesap-son.png`), fullPage: true });
    }
    await ctx.close();
  }
}

// Aktif ve pasif hesap normal yönetilir: modül anahtarı gerçekten kaydedilir (sentetik), sonra geri alınır.
console.log("\n[Aktif / pasif: gerçek yönetim]");
for (const [slug, id] of [["aktif", I.proPaid], ["pasif", I.passive]]) {
  const { ctx, page } = await open({ width: 1280, height: 900 }, id);
  await tab(page, "moduller");
  const s0 = (await q1(`select module_permissions->>'stones' v from public.users where id=$1`, [id])).v;
  const swStones = page.getByRole("switch", { name: "Doğaltaş" }).first();
  await swStones.click();
  await page.waitForTimeout(1500);
  const s1 = (await q1(`select module_permissions->>'stones' v from public.users where id=$1`, [id])).v;
  await swStones.click();
  await page.waitForTimeout(1500);
  const s2 = (await q1(`select module_permissions->>'stones' v from public.users where id=$1`, [id])).v;
  ok(s0 !== s1 && s2 === s0, `${slug}: modül anahtarı kaydedilir ve geri alınır (${s0}→${s1}→${s2})`);
  await ctx.close();
}

for (const [, id, st] of ACC) if (st === "archived") {
  const now = { u: await fp(id), c: JSON.stringify(await childFp(id)) };
  ok(now.u === before[id].u && now.c === before[id].c, `arşivdeki hesap (${id.slice(0, 8)}): üyelik / ödeme / fiyat / deneme satırları DEĞİŞMEDİ`);
}
const archivedWrites = writes.filter((w) => ACC.some(([, id, st]) => st === "archived" && w.p.includes(id)));
ok(archivedWrites.length === 0, "arşivdeki hesaplara hiçbir yazma isteği gönderilmedi", archivedWrites);
ok(errs.length === 0, "konsol / sayfa hatası yok", errs.slice(0, 5));
await browser.close();
await db.end();
console.log(`\nARŞİV SALT-OKUNUR UI: ${pass} PASS / ${fail} FAIL · görüntüler: ${SHOTS}`);
if (fail) { console.log("Başarısız:", failures); process.exit(1); }
