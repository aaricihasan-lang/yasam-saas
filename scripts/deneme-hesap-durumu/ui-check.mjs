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

const ACT = ["İncelemeye al", "Deneme erişimini durdur", "Pro üyeliğe geçir"];
const OPEN_CASES = [
  ["ZZ_DHD Ada Aktif Denemede", { slug: "aktif-devam", buttons: ACT }],
  ["ZZ_DHD Bora Pasif Denemede", { slug: "pasif-devam", buttons: ACT }],
  ["ZZ_DHD Cem Arşivde Denemede", { slug: "arsiv-devam", archived: true }],
  ["ZZ_DHD Derya Başlamamış", { slug: "baslamamis", buttons: ACT }],
  ["ZZ_DHD Ece Süresi Bitmiş", { slug: "suresi-bitmis", buttons: ["Pro üyeliğe geçir"] }],
  ["ZZ_DHD Fikret Durdurulmuş", { slug: "durdurulmus", buttons: ["Erişimi sürdür", "Pro üyeliğe geçir"] }],
  ["ZZ_DHD Gül Pasif Süresi Bitmiş", { slug: "pasif-suresi-bitmis", buttons: ["Pro üyeliğe geçir"] }],
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
  const noteBox = await note.boundingBox();
  ok(noteBox && noteBox.x >= 0 && noteBox.x + noteBox.width <= vp.width, "pasif notu ekran genişliği içinde", noteBox);
  await card(page, "ZZ_DHD Bora Pasif Denemede").locator("button").first().click();
  await page.waitForTimeout(300);

  // Açık kart vakaları: kredi kutuları taşmaz / çakışmaz; arşivde işlem düğmeleri yok; diğerlerinde düğmeler aynen.
  for (const [i, [name, expect]] of OPEN_CASES.entries()) {
    const short = name.replace("ZZ_DHD ", "");
    const c = card(page, name);
    await c.locator("button").first().click();
    await c.getByText("Günlük Roxy kredisi").waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);
    const ovc = await overflow(page);
    ok(ovc.pageOv <= 0 && ovc.n === 0, `${short}: açık kartta hiçbir öğe taşmıyor (${vp.width}px)`, ovc);
    const geo = await c.evaluate((el) => {
      const cr = el.getBoundingClientRect();
      const box = [...el.querySelectorAll("[data-credit-inputs] label, [data-credit-readonly] > div")].map((n) => n.getBoundingClientRect());
      const inputs = [...el.querySelectorAll("[data-credit-inputs] input")].map((n) => n.getBoundingClientRect());
      const inside = [...box, ...inputs].every((r) => r.left >= cr.left - 0.5 && r.right <= cr.right + 0.5);
      let overlap = 0;
      for (let a = 0; a < box.length; a++) for (let b = a + 1; b < box.length; b++) {
        const A = box[a], B = box[b];
        if (A.left < B.right - 0.5 && B.left < A.right - 0.5 && A.top < B.bottom - 0.5 && B.top < A.bottom - 0.5) overlap++;
      }
      // Her etiketin metni tek satır mı / girişin üstünde mi: metin alanı girişle çakışmamalı.
      const labelText = [...el.querySelectorAll("[data-credit-inputs] label")].map((l) => {
        const rng = document.createRange(); rng.selectNodeContents(l.firstChild); const t = rng.getBoundingClientRect();
        const inp = l.querySelector("input").getBoundingClientRect();
        return t.bottom <= inp.top + 0.5;
      });
      const rows = new Set(inputs.map((r) => Math.round(r.top))).size;
      return { n: box.length, inputs: inputs.length, inside, overlap, textAbove: labelText.every(Boolean), rows };
    });
    ok(geo.n === 4 && geo.inside && geo.overlap === 0, `${short}: 4 kredi alanı kartın içinde, birbirine binmiyor`, geo);
    if (expect.archived) {
      ok(geo.inputs === 0 && (await c.getByRole("button", { name: "Limitleri kaydet" }).count()) === 0, `${short}: arşivde kredi limitleri salt-okunur (giriş / kaydet yok)`, geo);
      const ro = await c.locator("[data-credit-readonly]").innerText();
      ok(/Ortak günlük\s*50/.test(ro), `${short}: arşivde kredi bilgisi okunur`, ro);
      for (const n of ["İncelemeye al", "İncelemeyi kaldır", "Deneme erişimini durdur", "Erişimi sürdür", "Pro üyeliğe geçir", "Pro üyeliğe geçişi onayla"]) {
        ok((await c.getByRole("button", { name: n, exact: true }).count()) === 0, `${short}: arşivde "${n}" düğmesi yok`);
      }
      ok((await c.locator("[data-trial-actions]").count()) === 0 && await c.locator("[data-archived-readonly]").isVisible(), `${short}: işlem alanı yerine salt-okunur açıklama`);
      const href = await c.getByRole("link", { name: "Üye detayını aç" }).getAttribute("href");
      ok(href === `/admin/users/${cfg.ids.archivedRun}`, `${short}: arşivden çıkarma yolu (Üye Detayı) bağlantısı`, href);
      ok(await c.getByRole("button", { name: "Talebi kapat", exact: true }).isVisible(), `${short}: sunucunun izin verdiği "Talebi kapat" korunur`);
      ok(/Deneme bitişi/.test(await c.innerText()), `${short}: hesap / deneme bilgileri okunur kalır`);
    } else {
      ok(geo.inputs === 4 && geo.textAbove, `${short}: etiket metinleri kutuların üstünde, üst üste binme yok`, geo);
      ok(vp.width >= 640 ? geo.rows === 1 : geo.rows === 4, vp.width >= 640 ? `${short}: masaüstünde 4 kutu tek satırda (mevcut görünüm)` : `${short}: mobilde kutular alt alta`, geo);
      ok(await c.getByRole("button", { name: "Limitleri kaydet" }).isVisible(), `${short}: "Limitleri kaydet" var`);
      const btns = (await c.locator("[data-trial-actions] button").allInnerTexts()).map((t) => t.trim());
      ok(JSON.stringify(btns) === JSON.stringify(expect.buttons), `${short}: yetkili işlem düğmeleri değişmedi (${expect.buttons.join(" · ")})`, btns);
    }
    await c.screenshot({ path: path.join(SHOTS, `${label}-02-kart-${String(i + 1).padStart(2, "0")}-${expect.slug}.png`) });
    await c.locator("button").first().click();
    await page.waitForTimeout(250);
  }

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
