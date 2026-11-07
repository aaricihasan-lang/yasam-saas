/**
 * ÜYE YÖNETİMİ H1–H4 — yerel UI doğrulaması (Playwright; yalnız localhost / 127.0.0.1, dış istekler engellenir).
 * Önkoşul: scripts/uye-yonetimi-h1h4/ui-stack.ts + yerel `next dev` (BASE). Sentetik veri; production'a temas YOK.
 * Ekran görüntüleri: SHOTS dizini.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.H1H4_BASE ?? "http://localhost:3941";
const SHOTS = process.env.H1H4_SHOTS ?? path.join(os.tmpdir(), "uye-yonetimi-h1h4-shots");
const cfg = JSON.parse(readFileSync(path.join(os.tmpdir(), "uye-yonetimi-h1h4-ui.json"), "utf8"));
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}`); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
await ctx.addCookies([{ name: "yasam_admin_session", value: cfg.token, url: BASE }]);
await ctx.route((url) => !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url.toString()), (r) => r.abort());
await ctx.addInitScript(([u, t]) => {
  try { localStorage.setItem("yasam_user", u); localStorage.setItem("yasam_session_token", t); } catch { /* yok */ }
}, [JSON.stringify(cfg.user), cfg.token]);
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });

async function openDetail(id) {
  await page.goto(`${BASE}/admin/users/${id}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("text=İşlemler", { timeout: 240000 });
}

try {
  // ── Liste (H1/H4) ───────────────────────────────────────────────────────────
  console.log("[Liste]");
  await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("text=ZZ_H1H4UI Eski Kayıt", { timeout: 240000 });
  const cardText = async (name) => (await page.locator("article", { hasText: name }).first().innerText()).replace(/\s+/g, " ");
  const proCard = await cardText("ZZ_H1H4UI Pro (eski pencere)");
  const legacyCard = await cardText("ZZ_H1H4UI Eski Kayıt");
  const trialCard = await cardText("ZZ_H1H4UI Deneme Bitti");
  ok(/Paket: Premium/.test(proCard) && !/Deneme süresi doldu|deneme sona erdi/i.test(proCard), "H1 Pro kartında 'Deneme süresi doldu' YOK (Premium)");
  ok(/Eski deneme sona erdi/.test(legacyCard) && /Paket eksik/.test(legacyCard) && !/7 günlük/.test(legacyCard), "H4 eski kayıt: 'Eski deneme sona erdi', süre sayısı yok");
  ok(/Deneme süresi doldu/.test(trialCard) && /Ücretsiz deneme \(7 gün\)/.test(trialCard), "H4 7 günlük deneme: 'Deneme süresi doldu'");
  const legacyTitle = await page.locator("article", { hasText: "ZZ_H1H4UI Eski Kayıt" }).locator("span[title]", { hasText: "Eski deneme" }).getAttribute("title");
  ok(!!legacyTitle && !/7 günlük|3 günlük/.test(legacyTitle) && /Eski Kaydı Pro Üyeliğe Geçir/.test(legacyTitle), "H4 eski kayıt rozet açıklaması süre sayısı içermiyor, doğru yolu gösteriyor");
  await page.screenshot({ path: path.join(SHOTS, "01-liste-masaustu.png"), fullPage: true });

  // ── Mobil detay (dönüşümlerden ÖNCE; 360 px) ─────────────────────────────────
  console.log("[Mobil detay]");
  await page.setViewportSize({ width: 360, height: 820 });
  for (const [id, kind, shot] of [[cfg.ids.legacy, "legacy", "09-eski-kayit-mobil-360.png"], [cfg.ids.trial, "trial", "10-deneme-mobil-360.png"]]) {
    await openDetail(id);
    const b = page.locator(`[data-membership-status='${kind}']`);
    await b.scrollIntoViewIfNeeded();
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok((await b.isVisible()) && ov <= 0, `360px detay: '${kind}' kutusu görünür, yatay taşma yok (${ov})`);
    await page.screenshot({ path: path.join(SHOTS, shot), fullPage: false });
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  // ── H2 eski kayıt detayı ────────────────────────────────────────────────────
  console.log("[H2 detay]");
  await openDetail(cfg.ids.legacy);
  const box = page.locator("[data-membership-status='legacy']");
  ok(await box.isVisible(), "H2 'Paket ve Deneme' kutusu görünür (eski kayıt)");
  const boxText = (await box.innerText()).replace(/\s+/g, " ");
  ok(/Aktif — giriş yapabilir/.test(boxText) && /Yok — paket tanımlı değil/.test(boxText) && /“Aktif Yap” ve modül anahtarları bu hesabı açmaz/.test(boxText),
    "H2 aktiflik / deneme / Pro ayrı ayrı ve açıkça yazıyor");
  ok(await page.locator("text=Aktif · paket eksik · erişim yok").first().isVisible(), "H2 Özet erişim rozeti 'paket eksik · erişim yok'");
  ok(!(await page.locator("text=Tek paket; süresiz").count()), "H2 çelişkili 'Tek paket; süresiz' metni yok");
  await box.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, "02-eski-kayit-detay.png"), fullPage: false });
  await page.locator("[data-pro-conversion='legacy']").click();
  const modal = page.locator("[role='dialog'][aria-labelledby='approve-title']");
  await modal.waitFor();
  ok(/Eski kaydı Pro üyeliğe geçir/.test(await modal.innerText()), "H2 pencere başlığı 'Eski kaydı Pro üyeliğe geçir'");
  const submit = modal.getByRole("button", { name: "Pro Üyeliğe Geçir" });
  ok(await submit.isDisabled(), "H2 modül seçilmeden / teyitsiz buton kapalı");
  await modal.getByRole("checkbox").last().check();
  ok(await submit.isDisabled(), "H2 teyit tek başına yetmez (en az bir modül zorunlu)");
  await modal.locator("label", { hasText: "Danışan Yönetimi" }).first().click();
  await modal.locator("label", { hasText: "Numeroloji" }).first().click();
  ok(await submit.isEnabled(), "H2 modül + teyit → buton açık");
  await page.screenshot({ path: path.join(SHOTS, "03-eski-kayit-pencere.png"), fullPage: false });
  await submit.click();
  await page.waitForSelector("text=Pro üyeliğe geçirildi", { timeout: 60000 });
  await page.waitForTimeout(800);
  ok(!(await page.locator("[data-membership-status='legacy']").count()), "H2 sonrası kutu kalktı (hesap artık Pro)");
  ok(await page.locator("text=Ücretli Pro üyelik; süresiz").first().isVisible(), "H2 sonrası Paket: ücretli Pro");
  ok(await page.locator("text=legacy_package_repair").count() === 0, "H2 audit ham anahtarı ekranda görünmüyor");
  await page.screenshot({ path: path.join(SHOTS, "04-eski-kayit-sonrasi.png"), fullPage: false });

  // ── H3 deneme bitti detayı ──────────────────────────────────────────────────
  console.log("[H3 detay]");
  await openDetail(cfg.ids.trial);
  const tbox = page.locator("[data-membership-status='trial']");
  ok(await tbox.isVisible(), "H3 'Paket ve Deneme' kutusu görünür (deneme bitti)");
  const tText = (await tbox.innerText()).replace(/\s+/g, " ");
  ok(/7 günlük deneme sona erdi/.test(tText) && /salt okunur/.test(tText) && /“Aktif Yap” deneme kısıtını kaldırmaz/.test(tText) && /Yok — ücretsiz deneme üyesi/.test(tText),
    "H3 aktiflik / deneme bitti (salt okunur) / Pro yok ayrımı açık");
  ok(await page.locator("text=Deneme bitti · salt okunur").first().isVisible(), "H3 Özet erişim rozeti 'Deneme bitti · salt okunur'");
  ok(await page.locator("a[href='/admin/deneme-uyeleri']").first().isVisible(), "H3 Deneme Üyeleri ekranına bağlantı var");
  await tbox.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, "05-deneme-bitti-detay.png"), fullPage: false });
  await page.locator("[data-pro-conversion='trial']").click();
  const tm = page.locator("[role='dialog'][aria-labelledby='approve-title']");
  await tm.waitFor();
  ok(/Deneme üyesini Pro üyeliğe geçir/.test(await tm.innerText()) && /süre uzatılmaz/.test(await tm.innerText()), "H3 pencere: doğru başlık + süre uzatılmaz notu");
  ok(!(await page.locator("text=Astroloji için en az bir Gökyüzü Atlası tekniği").count()), "H3 deneme dönüşümünde Astroloji teknik uyarısı çıkmıyor");
  await tm.getByRole("checkbox").last().check();
  await page.screenshot({ path: path.join(SHOTS, "06-deneme-pencere.png"), fullPage: false });
  await tm.getByRole("button", { name: "Pro Üyeliğe Geçir" }).click();
  await page.waitForSelector("text=Pro üyeliğe geçirildi", { timeout: 60000 });
  await page.waitForTimeout(800);
  ok(!(await page.locator("[data-membership-status='trial']").count()), "H3 sonrası kutu kalktı (Pro)");
  await page.screenshot({ path: path.join(SHOTS, "07-deneme-sonrasi.png"), fullPage: false });

  // ── Mobil (390 / 360) ───────────────────────────────────────────────────────
  console.log("[Mobil]");
  await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
  for (const w of [360, 390]) {
    await page.setViewportSize({ width: w, height: 820 });
    await page.waitForTimeout(500);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(ov <= 0, `liste ${w}px yatay taşma yok (${ov})`);
  }
  await page.screenshot({ path: path.join(SHOTS, "08-liste-mobil-390.png"), fullPage: true });
  ok(consoleErrors.length === 0, `konsol hatası yok (${consoleErrors.length})`);
  if (consoleErrors.length) console.error(consoleErrors.slice(0, 5));
} catch (e) {
  fail++;
  console.error("UI HATASI:", e);
} finally {
  await browser.close();
}
console.log(`\nUI SONUÇ: ${pass} PASS / ${fail} FAIL · görüntüler: ${SHOTS}`);
if (fail) { console.error(failures.join("\n")); process.exit(1); }
