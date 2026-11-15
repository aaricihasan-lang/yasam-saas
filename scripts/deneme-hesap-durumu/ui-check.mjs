/**
 * DENEME ÜYELERİ · HESAP DURUMU — yerel UI doğrulaması (Playwright; yalnız localhost / 127.0.0.1, dış istekler engellenir; sentetik veri).
 * Önkoşul: scripts/deneme-hesap-durumu/ui-stack.ts + yerel `next dev` (BASE). Production'a temas YOK.
 * Ekran görüntüleri: DHD_SHOTS (yoksa geçici dizin). Masaüstü 1280 + mobil 320 / 375 / 390.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.DHD_BASE ?? "http://localhost:3972";
const SHOTS = process.env.DHD_SHOTS ?? path.join(os.tmpdir(), "deneme-hesap-durumu-shots");
const cfg = JSON.parse(readFileSync(path.join(os.tmpdir(), "deneme-hesap-durumu-ui.json"), "utf8"));
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l, d) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${d === undefined ? "" : ` — ${JSON.stringify(d).slice(0, 300)}`}`); }
};
const consoleErrors = [];
const writes = [];
const browser = await chromium.launch();
async function open(viewport) {
  const ctx = await browser.newContext({ viewport, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addCookies([{ name: "yasam_admin_session", value: cfg.owner.token, url: BASE }]);
  await ctx.route((url) => !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url.toString()), (r) => r.abort());
  await ctx.addInitScript(([u, t]) => {
    try { localStorage.setItem("yasam_user", u); localStorage.setItem("yasam_session_token", t); } catch { /* yok */ }
  }, [JSON.stringify(cfg.owner.user), cfg.owner.token]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`pageerror ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_FAILED|favicon/.test(m.text())) consoleErrors.push(`console ${m.text().slice(0, 200)}`); });
  page.on("request", (r) => { if (["PATCH", "POST", "PUT", "DELETE"].includes(r.method()) && /\/api\/admin\//.test(r.url())) writes.push(`${r.method()} ${r.url()}`); });
  await page.goto(`${BASE}/admin/deneme-uyeleri`, { waitUntil: "domcontentloaded" });
  await page.getByText("ZZ_DHD Bora Pasif Denemede").first().waitFor({ timeout: 180_000 });
  await page.waitForTimeout(500);
  return { ctx, page };
}
const card = (page, name) => page.locator("main div.rounded-2xl.border").filter({ hasText: name }).first();
async function badges(page, name) {
  const c = card(page, name);
  return {
    account: await c.locator("[data-account-state]").first().innerText().catch(() => null),
    accountState: await c.locator("[data-account-state]").first().getAttribute("data-account-state").catch(() => null),
    trial: await c.locator("[data-trial-phase]").first().innerText().catch(() => null),
    pills: await c.locator("button span.rounded-full").allInnerTexts(),
  };
}
async function overflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [...document.querySelectorAll("main *")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.right > vw + 1 || r.left < -1);
    }).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`);
    return { pageOv: document.documentElement.scrollWidth - vw, n: out.length, out: out.slice(0, 5) };
  });
}

const CASES = [
  ["ZZ_DHD Ada Aktif Denemede", "Hesap: Aktif", "Deneme: Devam ediyor"],
  ["ZZ_DHD Bora Pasif Denemede", "Hesap: Pasif", "Deneme: Devam ediyor"],
  ["ZZ_DHD Cem Arşivde Denemede", "Hesap: Arşivde", "Deneme: Devam ediyor"],
  ["ZZ_DHD Derya Başlamamış", "Hesap: Aktif", "Deneme: Başlamamış"],
  ["ZZ_DHD Ece Süresi Bitmiş", "Hesap: Aktif", "Deneme: Süresi dolmuş"],
  ["ZZ_DHD Fikret Durdurulmuş", "Hesap: Aktif", "Deneme: Durdurulmuş"],
  ["ZZ_DHD Gül Pasif Süresi Bitmiş", "Hesap: Pasif", "Deneme: Süresi dolmuş"],
];

for (const [label, vp] of [["masaustu-1280", { width: 1280, height: 900 }], ["mobil-320", { width: 320, height: 780 }], ["mobil-375", { width: 375, height: 812 }], ["mobil-390", { width: 390, height: 844 }]]) {
  console.log(`\n[${label}]`);
  const { ctx, page } = await open(vp);
  for (const [name, acc, trial] of CASES) {
    const b = await badges(page, name);
    ok(b.account === acc && b.trial === trial, `${name.replace("ZZ_DHD ", "")}: "${acc}" + "${trial}"`, b);
    ok(!b.pills.some((t) => t.trim() === "Aktif"), `${name.replace("ZZ_DHD ", "")}: tek başına yanıltıcı "Aktif" rozeti yok`, b.pills);
  }
  const kalan = await card(page, "ZZ_DHD Bora Pasif Denemede").locator("button span.rounded-full").filter({ hasText: "Kalan:" }).innerText();
  ok(/Kalan: \d+ gün/.test(kalan), "pasif hesapta deneme kalan süresi gösterilmeye devam eder (hesaplama değişmedi)", kalan);
  const tabs = await page.locator("main > div.mt-5 button").allInnerTexts();
  ok(tabs.length === 7 && /^Devam eden\s*\d+$/.test(tabs[1].trim()), "filtre düzeni korunur (7 sekme); deneme sekmesi \"Devam eden\"", tabs);
  const ov = await overflow(page);
  ok(ov.pageOv <= 0 && ov.n === 0, `yatay taşma yok (${vp.width}px)`, ov);
  await page.screenshot({ path: path.join(SHOTS, `${label}-01-liste.png`), fullPage: true });

  await card(page, "ZZ_DHD Bora Pasif Denemede").locator("button").first().click();
  const note = card(page, "ZZ_DHD Bora Pasif Denemede").locator("[data-account-note]");
  await note.waitFor({ timeout: 5000 });
  ok(/Hesap pasif: üye giriş yapamaz\. Deneme süresi hesap durumundan bağımsız işlemeye devam eder\./.test(await note.innerText()), "pasif kart açılınca açıklama notu görünür");
  ok((await card(page, "ZZ_DHD Ada Aktif Denemede").locator("[data-account-note]").count()) === 0, "aktif hesapta not yok");
  // Not: "Günlük Roxy kredisi" limit girişleri (bu PR'da DEĞİŞMEYEN bölüm) dar ekranda kartın dışına taşıyor — main'de
  // de aynı, ayrı bulgu olarak raporlanır. Burada yalnız sayfa kaydırması ve bu PR'ın öğeleri (rozet / not) denetlenir.
  const ov2 = await overflow(page);
  const extra = ov2.out.filter((o) => !o.startsWith("INPUT.h-9 rounded-lg border border-slate-200"));
  ok(ov2.pageOv <= 0 && extra.length === 0, `açık kartta sayfa kaydırması yok; rozet / not taşmıyor (${vp.width}px)`, ov2);
  if (ov2.n > 0) console.log(`    · bilgi: mevcut kredi limiti girişlerinde ${ov2.n} taşma (değişmeyen bölüm, ayrı bulgu)`);
  const noteBox = await note.boundingBox();
  ok(noteBox && noteBox.x >= 0 && noteBox.x + noteBox.width <= vp.width, "pasif notu ekran genişliği içinde", noteBox);
  await card(page, "ZZ_DHD Bora Pasif Denemede").screenshot({ path: path.join(SHOTS, `${label}-02-pasif-kart-acik.png`) });

  await page.locator("main > div.mt-5 button").nth(1).click();
  await page.waitForTimeout(1200);
  const names = await page.locator("main div.rounded-2xl.border p.text-base").allInnerTexts();
  ok(names.length === 3 && names.every((n) => /Denemede$/.test(n)), "\"Devam eden\" filtresi: aktif + pasif + arşivde hesap (3 satır), her biri kendi hesap rozetiyle", names);
  await page.screenshot({ path: path.join(SHOTS, `${label}-03-devam-eden-filtre.png`), fullPage: true });
  await ctx.close();
}

ok(writes.length === 0, "doğrulama sırasında hiçbir yazma isteği gönderilmedi (salt-okunur)", writes);
ok(consoleErrors.length === 0, "konsol / sayfa hatası yok", consoleErrors.slice(0, 5));
await browser.close();
console.log(`\nDENEME ÜYELERİ · HESAP DURUMU UI: PASS ${pass} · FAIL ${fail} · görüntüler ${SHOTS}`);
if (fail) { console.log("Başarısız:", failures); process.exit(1); }
