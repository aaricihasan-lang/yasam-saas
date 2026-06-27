/**
 * verify-canli-stok-quick-actions.mjs — K-3 Öncelik 1 doğrulaması.
 * Canlı Stok kartında: satış fiyatı + kâr marjı gösterimi + hızlı "− Sat" / "+ Stok ekle".
 * Yerel production + prod Supabase. Kayıt silinmez.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3217";
const EMAIL = "esra@outlook.com";
const PASS = "123456";
const TAG = new Date().toISOString().slice(5, 19).replace(/[-:T]/g, "");
const NAME = `UAT CANLI HIZLI ${TAG}`;
const log = (...a) => console.log(...a);
const results = [];
const rec = (n, ok, d) => { results.push({ n, ok, d }); log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

const browser = await chromium.launch({ headless: true });
try {
  // Login
  const lc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
  const storageState = await lc.storageState();
  await lc.close();
  if (!auth.token) throw new Error("login fail");

  const freshAuthCtx = async (opts) => {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(([u, t]) => { localStorage.setItem("yasam_user", u); localStorage.setItem("yasam_session_token", t); }, [auth.user, auth.token]);
    return ctx;
  };
  const dbStock = (page) => page.evaluate(async (nm) => {
    const uu = JSON.parse(localStorage.getItem("yasam_user"));
    const tt = localStorage.getItem("yasam_session_token");
    const r = await fetch("/api/urun-stok/yag", { headers: { "x-user-id": uu.id, "x-session-token": tt }, cache: "no-store" });
    const j = await r.json();
    const row = (j.rows || []).find((x) => x.name === nm);
    return row ? row.stock_base : null;
  }, NAME);

  // Hazırlık: yağ modülünden bilinen ürün ekle (100 ml, alış 500 → 5/ml, satış 1500 → 15/ml, kâr %200)
  const dc = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
  const dp = await dc.newPage();
  await dp.goto(BASE + "/urun-stok/yag", { waitUntil: "domcontentloaded", timeout: 45000 });
  await dp.waitForTimeout(1500);
  await dp.locator('label:has-text("Ürün adı") input').fill(NAME);
  await dp.locator('label:has-text("Birim") select').selectOption("ml");
  await dp.locator('label:has-text("Stok miktarı") input').fill("100");
  await dp.locator('label:has-text("Alış maliyeti") input').fill("500");
  await dp.locator('label:has-text("Satış fiyatı") input').fill("1500");
  await dp.locator('label:has-text("Kâr oranı") input').fill("200");
  await dp.getByRole("button", { name: "Ekle", exact: true }).click();
  await dp.waitForSelector('text=/buluta kaydedildi/i', { timeout: 20000 }).catch(() => {});
  rec("Hazırlık: ürün eklendi (DB=100)", (await dbStock(dp)) === 100, `db=${await dbStock(dp)}`);

  // Canlı Stok'a git
  await dp.goto(BASE + "/urun-stok/canli-stok", { waitUntil: "domcontentloaded", timeout: 45000 });
  await dp.waitForTimeout(3500);
  const card = dp.locator("article").filter({ hasText: NAME }).first();
  const cardText = await card.innerText().catch(() => "");
  rec("Kartta satış fiyatı görünüyor (₺15,00/ml)", /Sat[ıi]ş:\s*₺15,00\s*\/\s*ml/.test(cardText), cardText.replace(/\s+/g, " ").slice(0, 120));
  rec("Kartta kâr marjı görünüyor (%200)", /%200/.test(cardText));

  // Hızlı SAT: − Sat (stok düş) 30 → 70
  await card.getByRole("button", { name: /Sat \(stok/ }).click();
  await dp.waitForTimeout(300);
  await card.locator('input[type="number"]').fill("30");
  await card.getByRole("button", { name: "Sat", exact: true }).click();
  await dp.waitForTimeout(2500);
  rec("Hızlı SAT 30 → DB stock_base=70", (await dbStock(dp)) === 70, `db=${await dbStock(dp)}`);

  // Hızlı EKLE: + Stok ekle 10 → 80
  const card2 = dp.locator("article").filter({ hasText: NAME }).first();
  await card2.getByRole("button", { name: /Stok ekle/ }).click();
  await dp.waitForTimeout(300);
  await card2.locator('input[type="number"]').fill("10");
  await card2.getByRole("button", { name: "Ekle", exact: true }).click();
  await dp.waitForTimeout(2500);
  rec("Hızlı EKLE 10 → DB stock_base=80", (await dbStock(dp)) === 80, `db=${await dbStock(dp)}`);
  await dc.close();

  // Taze context: 80 ml kalıcı + satış/marj görünür
  const fc = await freshAuthCtx({ viewport: { width: 1440, height: 900 } });
  const fp = await fc.newPage();
  await fp.goto(BASE + "/urun-stok/canli-stok", { waitUntil: "domcontentloaded", timeout: 45000 });
  await fp.waitForTimeout(3500);
  const fcard = await fp.locator("article").filter({ hasText: NAME }).first().innerText().catch(() => "");
  rec("Taze context 80 ml + satış/marj gösteriyor", /80 ml/.test(fcard) && /%200/.test(fcard), fcard.replace(/\s+/g, " ").slice(0, 120));
  await fc.close();

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
