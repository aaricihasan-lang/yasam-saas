/**
 * ÜYE YÖNETİMİ 360° — yerel tarayıcı duman + duyarlılık testi (Playwright Chromium).
 * Önkoşul: ui-smoke-stack.ts çalışıyor + yerel build `next start -p 3927`. Ağ: yalnız 127.0.0.1.
 *
 * Kontroller: yatay taşma (320–1920), Yönetim Özeti kartları + filtre uygulama, mobil filtre katlama,
 * yeni filtre/sıralama URL senkronu, satır "Dikkat" metni, detay bölüm navigasyonu, Ticari fiyat
 * dönemi ekleme + çakışma uyarısı, Kullanım paneli, Yönetim Geçmişi, sentinel özel içerik sızıntısı yok,
 * konsol hatası yok.
 *
 * Çalıştır: node scripts/uye-yonetimi-360/ui-smoke.mjs
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.M360_BASE ?? "http://127.0.0.1:3927";
const cfg = JSON.parse(readFileSync(path.join(os.tmpdir(), "uye-yonetimi-360-ui.json"), "utf8"));
const SHOTS = process.env.M360_SHOTS ?? path.join(os.tmpdir(), "m360-shots");
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}`); } };

const WIDTHS = [320, 360, 375, 390, 412, 768, 1024, 1280, 1440, 1920];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
await ctx.addCookies([{ name: "yasam_admin_session", value: cfg.token, url: BASE }]);
await ctx.route((url) => !/^http:\/\/127\.0\.0\.1(:\d+)?\//.test(url.toString()), (r) => r.abort());
await ctx.addInitScript(([u, t]) => {
  try { localStorage.setItem("yasam_user", u); localStorage.setItem("yasam_session_token", t); } catch { /* yok */ }
}, [JSON.stringify(cfg.user), cfg.token]);
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`${m.text().slice(0, 160)} @ ${m.location()?.url ?? ""}`); });
const notFound = [];
page.on("response", (r) => { if (r.status() >= 400) notFound.push(`${r.status()} ${r.url()}`); });
const bodies = [];
page.on("response", async (r) => {
  if (r.url().includes("/api/")) { try { bodies.push(await r.text()); } catch { /* akış */ } }
});

async function overflow() {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const offenders = [...document.querySelectorAll("body *")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1; })
      .slice(0, 3).map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`);
    return { sw: doc.scrollWidth, iw: window.innerWidth, offenders };
  });
}

// ── 1) Liste ──────────────────────────────────────────────────────────────────
console.log("[1] Üye listesi");
await page.goto(`${BASE}/admin/users`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: /Yönetim Özeti/ }).waitFor({ timeout: 20000 });
ok(await page.getByText("Son 7 günde aktif").isVisible(), "Yönetim Özeti kartları görünür");
await page.getByText(/sonuçtan/).first().waitFor({ timeout: 20000 });
const ovText = await page.locator("section[aria-labelledby='member-overview-title']").innerText();
ok(/ölçüm/i.test(ovText) && /Oran paydası/.test(ovText), "ölçüm süresi + oran paydası açıkça yazılı");
ok(!/90 günlük ölçüm süresi henüz tamamlanmadı/.test(ovText) || /gündür açık/.test(ovText), "kapsam notu (varsa) ölçüm gününü söyler");
const dikkat = await page.getByText("Dikkat", { exact: true }).count();
ok(dikkat > 0, `satırlarda açık "Dikkat" nedeni var (${dikkat})`);
ok(await page.getByText(/gün gecikmiş|gündür kullanılmıyor/).first().isVisible(), "dikkat metni okunur (ör. 'Ödeme 12 gün gecikmiş')");
ok(!(await page.content()).match(/sağlık puanı|health score/i), "opak skor yok");
const overdueCard = await page.getByRole("button", { name: /Ödemesi gecikmiş/ }).textContent();
const overduePill = await page.locator("#member-filter-rows button", { hasText: /^Gecikmiş \(/ }).textContent();
const cardN = Number((overdueCard ?? "").match(/(\d+)/)?.[1]);
const pillN = Number((overduePill ?? "").match(/\((\d+)\)/)?.[1]);
ok(cardN > 0 && cardN === pillN, `özet "Ödemesi gecikmiş" (${cardN}) = filtre sayacı (${pillN})`);
const secCard = await page.getByRole("button", { name: /Güvenlik uyarısı olan/ }).textContent();
ok(Number((secCard ?? "").match(/(\d+)/)?.[1]) > 0, `güvenlik uyarısı kartı sentetik olayları sayar (${secCard})`);

await page.getByRole("button", { name: /30\+ gün kullanılmayan/ }).click();
await page.waitForURL(/activity=idle30/, { timeout: 10000 });
ok(page.url().includes("activity=idle30") && page.url().includes("approval=approved"), `kart filtre uyguladı (${page.url().split("?")[1]})`);
await page.getByText(/sonuçtan|0 sonuç/).first().waitFor({ timeout: 15000 });
ok(await page.locator("#member-filter-rows button[aria-pressed='true']", { hasText: "30+ gün yok" }).count() === 1, "aktivite filtresi seçili görünür");

await page.selectOption("#member-sort", "activity_asc");
await page.waitForURL(/sort=activity_asc/, { timeout: 10000 });
ok(true, "sıralama URL'ye yansır");
await page.selectOption("#member-module", "reflexology");
await page.waitForURL(/module=reflexology/, { timeout: 10000 });
ok(true, "modül filtresi URL'ye yansır");
await page.getByRole("button", { name: "Filtreleri Temizle" }).click();
await page.waitForURL((u) => !u.toString().includes("module="), { timeout: 10000 });

await page.fill("#member-search", "alperen");
await page.waitForURL(/q=alperen/, { timeout: 10000 });
await page.getByText(/sonuçtan/).first().waitFor({ timeout: 15000 });
const cnt = await page.locator("article").count();
ok(cnt >= 2, `"alperen" araması sonuç döner (${cnt} satır)`);
await page.fill("#member-search", "");
await page.waitForURL((u) => !u.toString().includes("q="), { timeout: 10000 });

for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(250);
  const o = await overflow();
  ok(o.sw <= o.iw + 1, `liste ${w}px yatay taşma yok (${o.sw}/${o.iw}) ${o.offenders.join(" ")}`);
  if ([320, 390, 1440].includes(w)) await page.screenshot({ path: path.join(SHOTS, `list-${w}.png`), fullPage: false });
}
await page.setViewportSize({ width: 375, height: 800 });
const toggle = page.getByRole("button", { name: /^Filtreler/ });
ok(await toggle.isVisible(), "mobilde filtre aç/kapa düğmesi");
ok(!(await page.locator("#member-filter-rows").isVisible()), "mobilde filtreler başlangıçta kapalı (kompakt)");
await toggle.click();
ok(await page.locator("#member-filter-rows").isVisible(), "filtreler açılır");
await page.setViewportSize({ width: 1280, height: 900 });

// ── 2) Detay ──────────────────────────────────────────────────────────────────
console.log("\n[2] Üye detayı");
await page.goto(`${BASE}/admin/users/${cfg.firstExpertId}`, { waitUntil: "networkidle" });
await page.getByRole("navigation", { name: "Üye detayı bölümleri" }).waitFor({ timeout: 20000 });
for (const label of ["Özet", "Ticari", "Kullanım", "Erişim", "Güvenlik", "Geçmiş"]) {
  const link = page.getByRole("navigation", { name: "Üye detayı bölümleri" }).getByRole("link", { name: label, exact: true });
  const href = await link.getAttribute("href");
  ok(Boolean(href) && (await page.locator(href).count()) === 1, `bölüm bağlantısı ${label} → ${href}`);
}
await page.getByText("Mevcut anlaşma").waitFor({ timeout: 15000 });
const tic = await page.locator("section[aria-labelledby='ticari-360-title']").innerText();
ok(/200 TL \/ Ay/.test(tic) && /600 TL \/ Ay/.test(tic) && /→/.test(tic), "Mevcut anlaşma 200 TL / Ay + Sonraki dönem 600 TL / Ay →");
await page.getByText("Kullanım · son 30 gün").waitFor();
await page.waitForFunction(() => !document.body.innerText.includes("Kullanım verisi yükleniyor"), null, { timeout: 15000 });
const use = await page.locator("#uye-kullanim").textContent();
ok(/Son gerçek aktivite/.test(use) && /ziyaret/.test(use) && /Kanal \/ platform/.test(use), "Kullanım paneli: son aktivite + ziyaret + kanal");
ok((await page.locator("#uye-ozet").textContent()).includes("Mevcut Ticari Fiyat"), "Özet: mevcut ticari fiyat kutusu");
const hist = await page.locator("#uye-gecmis").innerText();
ok(/Ticari fiyat dönemi eklendi/.test(hist) && !/Tanışma|200/.test(hist.replace(/\d{1,2} [A-ZÇĞİÖŞÜa-zçğıöşü]+ \d{4}/g, "")), "Yönetim Geçmişi: fiyat dönemi işlemi, değer yok");

// Fiyat dönemi ekleme: çakışma uyarısı + geçerli ekleme
await page.getByRole("button", { name: /Fiyat dönemi ekle/ }).click();
const form = page.getByRole("form", { name: "Yeni fiyat dönemi" });
await form.waitFor();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
await form.locator("input[type=date]").first().fill(today);
await form.locator("input[inputmode=decimal]").fill("250");
ok(await page.getByText(/mevcut dönemle çakışıyor/).isVisible(), "istemci tarafı çakışma uyarısı");
ok(await form.getByRole("button", { name: "Dönemi kaydet" }).isDisabled(), "çakışmada kaydet kapalı");
await form.getByRole("button", { name: "Vazgeç" }).click();

for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(250);
  const o = await overflow();
  ok(o.sw <= o.iw + 1, `detay ${w}px yatay taşma yok (${o.sw}/${o.iw}) ${o.offenders.join(" ")}`);
  if ([320, 390, 1440].includes(w)) await page.screenshot({ path: path.join(SHOTS, `detail-${w}.png`), fullPage: false });
}

// ── 3) Gizlilik + konsol ──────────────────────────────────────────────────────
console.log("\n[3] Gizlilik");
const all = bodies.join("\n") + (await page.content());
ok(!all.includes("SENTINEL_CLIENT_PII_M360"), "danışan sentinel içeriği hiçbir yanıtta/sayfada yok");
ok(!/password_hash|session_token"/.test(bodies.join("\n")), "API yanıtlarında parola özeti / token alanı yok");
// Yerel `next start`ta Vercel Web Analytics betiği (/_vercel/insights) yoktur → ortam kaynaklı, uygulama hatası değil.
const relevantErrors = consoleErrors.filter((e) => !/favicon|net::ERR_FAILED|_vercel\/(speed-)?insights/.test(e));
console.log("    4xx/5xx:", [...new Set(notFound)].join(" | ") || "yok");
ok(relevantErrors.length === 0, `konsol hatası yok (${relevantErrors.slice(0, 3).join(" | ")})`);

await browser.close();
console.log(`\nÜYE YÖNETİMİ 360 · UI: ${pass} PASS / ${fail} FAIL · ekran görüntüleri: ${SHOTS}`);
if (fail > 0) { console.error("Başarısız:\n - " + failures.join("\n - ")); process.exit(1); }
