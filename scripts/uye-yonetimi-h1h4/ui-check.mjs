/**
 * ÜYE YÖNETİMİ H1–H4 — yerel UI doğrulaması (Playwright; yalnız localhost / 127.0.0.1, dış istekler engellenir).
 * Önkoşul: scripts/uye-yonetimi-h1h4/ui-stack.ts + yerel `next dev` (BASE). Sentetik veri; production'a temas YOK.
 * Ekran görüntüleri: SHOTS dizini.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { claimShotsDir, resolveUiConfig } from "../uye-yonetimi-faz2/uiKosu.mjs";

const BASE = process.env.H1H4_BASE ?? "http://localhost:3941";
// Koşuya özgü: dizin canlı başka bir koşuya aitse `kosu-*` alt dizini (uiKosu.mjs).
const SHOTS = claimShotsDir(process.env.H1H4_SHOTS ?? path.join(os.tmpdir(), "uye-yonetimi-h1h4-shots"));
// Yapılandırma: H1H4_CFG ya da tek canlı yığın (birden çoksa durur; yanlış yığına bağlanmaz).
const UI_CFG = await resolveUiConfig({ envVar: "H1H4_CFG", prefixes: ["uye-yonetimi-h1h4-ui-"] });
const cfg = UI_CFG.cfg;
console.log(`yapılandırma: ${UI_CFG.path} (${UI_CFG.source}) · görüntüler: ${SHOTS}`);
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
// Ağ hataları konsol yerine yanıt durumundan izlenir (Üye Detayı V2 ui-check ile aynı süzgeç): 5xx veren her
// uç aşağıda AYRI bir kontrolle yakalanır. Tek istisna: HD Eğitim erişim ucu — tabloları (HD Eğitim migration
// zinciri) bu admin yığınında yok; HD Eğitim kendi testleriyle doğrulanır.
page.on("pageerror", (e) => consoleErrors.push(`pageerror ${e.message.slice(0, 200)}`));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 200)); });
const STACK_OUT_OF_SCOPE_5XX = /\/api\/admin\/hd\/education\/training-access(\?|$)/;
const serverErrors = [];
const outOfScope5xx = [];
page.on("response", (r) => {
  if (r.status() < 500) return;
  const u = new URL(r.url());
  (STACK_OUT_OF_SCOPE_5XX.test(u.pathname + u.search) ? outOfScope5xx : serverErrors).push(`${r.status()} ${u.pathname}`);
});

// Üye Detayı V2/V3 (#779/#785): beş sekme; paneller gizlenir (DOM'da kalır). "Paket ve Deneme" kutusu ve Pro
// geçiş düğmesi "Üyelik ve Ödeme" (#uyelik), erişim rozeti ve paket metni "Özet" (#ozet) sekmesindedir.
async function openDetail(id, tab = "uyelik") {
  await page.goto(`${BASE}/admin/users/${id}#${tab}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("text=İşlemler", { timeout: 240000 });
  await page.locator(`#uye-panel-${tab}`).waitFor({ state: "visible", timeout: 60000 });
}
async function showTab(tab) {
  await page.locator(`[role="tab"][data-tab="${tab}"]`).first().click();
  await page.locator(`#uye-panel-${tab}`).waitFor({ state: "visible", timeout: 30000 });
}

try {
  // ── Liste (H1/H4) ───────────────────────────────────────────────────────────
  console.log("[Liste]");
  await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("text=ZZ_H1H4UI Eski Kayıt", { timeout: 240000 });
  // Üye Listesi V2 (#759, f846d601): kart (article) yerine tablo satırı tr[data-row=<id>]; aşama etiketi +
  // "Süre / tarih" sütunu (lib/admin/memberListV2 memberStageBadge / memberPeriodText). Rozet açıklaması
  // (title) V2'de yok; eski kaydın doğru yolu ("Eski kaydı Pro üyeliğe geçir") aşağıda detayda doğrulanır.
  const rowText = async (id) => (await page.locator(`tr[data-row="${id}"]`).first().innerText()).replace(/\s+/g, " ");
  const proCard = await rowText(cfg.ids.pro);
  const legacyCard = await rowText(cfg.ids.legacy);
  const trialCard = await rowText(cfg.ids.trial);
  ok(/ZZ_H1H4UI Pro \(eski pencere\)/.test(proCard) && /example\.test Pro /.test(proCard) && !/deneme/i.test(proCard), "H1 Pro satırı 'Pro'; deneme / 'Deneme süresi doldu' metni YOK");
  ok(/ZZ_H1H4UI Eski Kayıt/.test(legacyCard) && /Eski kayıt · paket eksik/.test(legacyCard) && /eski deneme \d{2}\.\d{2}\.\d{4} bitti/.test(legacyCard)
    && !/Deneme bitti|\d+ gün|günlük/.test(legacyCard), "H4 eski kayıt: 'Eski kayıt · paket eksik', 'eski deneme … bitti'; süre sayısı / 7 günlük deneme etiketi yok");
  ok(/ZZ_H1H4UI Deneme Bitti/.test(trialCard) && /Deneme bitti/.test(trialCard) && /bitti \d{2}\.\d{2}\.\d{4}/.test(trialCard) && !/paket eksik/.test(trialCard), "H4 7 günlük deneme: 'Deneme bitti' (eski kayıttan ayrı)");
  ok(await page.locator(`tr[data-row="${cfg.ids.legacy}"] a[href="/admin/users/${cfg.ids.legacy}"]`).count() > 0, "H4 eski kayıt satırı detaya (Pro geçiş yolu) bağlanır");
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
  await showTab("ozet");
  ok(await page.locator("text=Aktif · paket eksik · erişim yok").first().isVisible(), "H2 Özet erişim rozeti 'paket eksik · erişim yok'");
  ok(!(await page.locator("text=Tek paket; süresiz").count()), "H2 çelişkili 'Tek paket; süresiz' metni yok");
  await showTab("uyelik");
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
  await showTab("ozet");
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
  ok(await tbox.locator("a[href='/admin/deneme-uyeleri']").first().isVisible(), "H3 Deneme Üyeleri ekranına bağlantı var");
  await showTab("ozet");
  ok(await page.locator("text=Deneme bitti · salt okunur").first().isVisible(), "H3 Özet erişim rozeti 'Deneme bitti · salt okunur'");
  await showTab("uyelik");
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
  ok(serverErrors.length === 0, `sunucu 5xx yanıtı yok (${serverErrors.length}${serverErrors.length ? `: ${[...new Set(serverErrors)].slice(0, 5).join(", ")}` : ""})`);
  console.log(`  · kapsam dışı (HD Eğitim tabloları yığında yok) 5xx: ${outOfScope5xx.length}`);
} catch (e) {
  fail++;
  console.error("UI HATASI:", e);
} finally {
  await browser.close();
}
console.log(`\nUI SONUÇ: ${pass} PASS / ${fail} FAIL · görüntüler: ${SHOTS}`);
if (fail) { console.error(failures.join("\n")); process.exit(1); }
