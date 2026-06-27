/**
 * verify-kritik-stok.mjs — K-3 Öncelik 2 doğrulaması.
 * Ayarlanabilir kritik eşik (canlı), kritik toggle, "kritik listeyi kopyala" (pano),
 * hub canlı kritik rozeti. Yerel production + prod Supabase. Kayıt silinmez.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3218";
const EMAIL = "esra@outlook.com";
const PASS = "123456";
const log = (...a) => console.log(...a);
const results = [];
const rec = (n, ok, d) => { results.push({ n, ok, d }); log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

const critCount = async (page) => {
  const t = await page.locator('button', { hasText: "Kritik Stok (" }).first().innerText().catch(() => "");
  const m = t.match(/Kritik Stok \((\d+)\)/);
  return m ? parseInt(m[1], 10) : -1;
};
const totalVarieties = async (page) => {
  const t = await page.locator("main").innerText().catch(() => "");
  const m = t.match(/Listelenen:\s*\d+\s*\/\s*(\d+)/);
  return m ? parseInt(m[1], 10) : -1;
};

const browser = await chromium.launch({ headless: true });
try {
  // Login
  const lc = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const lp = await lc.newPage();
  await lp.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await lp.waitForTimeout(800);
  await lp.getByRole("button", { name: "Giriş Yap" }).first().click({ timeout: 15000 });
  await lp.waitForTimeout(400);
  await lp.locator('input[type="email"]').fill(EMAIL);
  await lp.locator('input[type="password"]').fill(PASS);
  await lp.getByRole("button", { name: /Uzman Paneline Gir/i }).click();
  await lp.waitForFunction(() => !!localStorage.getItem("yasam_session_token"), { timeout: 30000 }).catch(() => {});
  await lp.waitForTimeout(1500);
  const auth = await lp.evaluate(() => ({ user: localStorage.getItem("yasam_user"), token: localStorage.getItem("yasam_session_token") }));
  rec("Login + token", !!auth.token);

  // Canlı Stok
  const p = lp;
  await p.goto(BASE + "/urun-stok/canli-stok", { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(3500);
  const variety = await totalVarieties(p);
  rec("Sayfa yüklendi, ürün çeşidi okundu", variety > 0, `çeşit=${variety}`);

  // Eşik inputlarını bul (kritik bar içinde)
  const bar = p.locator("section").filter({ hasText: "Kritik eşiği:" }).first();
  const inputs = bar.locator('input[type="number"]'); // adet, ml, gram sırası

  // Eşik = 0 → hiçbir ürün kritik değil (stok > 0)
  for (let i = 0; i < 3; i++) await inputs.nth(i).fill("0");
  await p.waitForTimeout(600);
  const c0 = await critCount(p);
  rec("Eşik 0 → kritik 0", c0 === 0, `kritik=${c0}`);

  // Eşik = 99999 → tüm stoklu ürünler kritik (= çeşit sayısı)
  for (let i = 0; i < 3; i++) await inputs.nth(i).fill("99999");
  await p.waitForTimeout(600);
  const cHigh = await critCount(p);
  rec("Eşik yüksek → tüm ürünler kritik (canlı yeniden hesap)", cHigh === variety, `kritik=${cHigh} / çeşit=${variety}`);

  // Kritik toggle → liste filtrelenir (kritik sayısı kadar kart)
  await p.locator('button', { hasText: "Kritik Stok (" }).first().click();
  await p.waitForTimeout(800);
  const cardCount = await p.locator("article").count();
  rec("Kritik toggle → kart sayısı = kritik sayısı", cardCount === cHigh, `kart=${cardCount}`);

  // Kritik listeyi kopyala → pano
  await p.locator('button', { hasText: "Kritik listeyi kopyala" }).first().click();
  await p.waitForTimeout(600);
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  rec("Kopyala → pano 'KRİTİK STOK' içeriyor", /KR[İI]T[İI]K STOK/.test(clip) && /🔴/.test(clip), clip.split("\n").slice(0, 2).join(" | ").slice(0, 80));
  rec("Kopyala mesajı görünüyor", await p.locator('text=/Kritik liste kopyaland/i').first().isVisible().catch(() => false));

  await lc.close();

  // Hub rozeti (taze auth context — eşik default)
  const hc = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await hc.addInitScript(([u, t]) => { localStorage.setItem("yasam_user", u); localStorage.setItem("yasam_session_token", t); }, [auth.user, auth.token]);
  const hp = await hc.newPage();
  await hp.goto(BASE + "/urun-stok", { waitUntil: "domcontentloaded", timeout: 45000 });
  await hp.waitForTimeout(4500); // rozet DB yüklemesi
  const hubText = await hp.locator("header").first().innerText().catch(() => "");
  rec("Hub canlı kritik rozeti render", /kritik ürün|Kritik stok yok/i.test(hubText), hubText.replace(/\s+/g, " ").slice(-60));
  await hc.close();

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  log("\n═══ ÖZET ═══");
  log(JSON.stringify({ pass, fail, total: results.length, failed: results.filter((r) => !r.ok).map((r) => `${r.n} (${r.d || ""})`) }, null, 2));
} catch (e) {
  log("HATA:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
