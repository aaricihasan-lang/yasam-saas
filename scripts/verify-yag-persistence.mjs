/**
 * verify-yag-persistence.mjs — K-2 Yağ ürün/stok DB kalıcılık canlı testi.
 * Yerel production (next start) + prod Supabase. Kayıtlar SİLİNMEZ.
 *
 *  FAZ A  login (esra, localhost) → storageState (tek login, paylaşılır)
 *  FAZ B  desktop: yağ kaydı ekle → listede gör → birim maliyet/satış doğrula
 *  FAZ C  F5 (reload) → kayıt kaybolmuyor mu
 *  FAZ D  TAZE context (yalnız auth, oil cache YOK) → DB'den yükleniyor mu
 *  FAZ E  mobil ekle → taze desktop görüyor mu (mobil→web senkron)
 *  FAZ F  JSON özet
 */
import { chromium, devices } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3210";
const EMAIL = "esra@outlook.com";
const PASS = "123456";
const TAG = new Date().toISOString().slice(5, 19).replace(/[-:T]/g, "");
const log = (...a) => console.log(...a);

const NAME_DESK = `TEST YAG K2 WEB ${TAG}`;
const NAME_MOB = `TEST YAG K2 MOBIL ${TAG}`;

const results = [];
const rec = (name, ok, detail) => { results.push({ name, ok, detail }); log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`); };

async function fillStockForm(p, { name, unit, qty, cost, sale, profit }) {
  await p.locator('label:has-text("Ürün adı") input').fill(name);
  if (unit) await p.locator('label:has-text("Birim") select').selectOption(unit);
  await p.locator('label:has-text("Stok miktarı") input').fill(String(qty));
  await p.locator('label:has-text("Alış maliyeti") input').fill(String(cost));
  await p.locator('label:has-text("Satış fiyatı") input').fill(String(sale));
  await p.locator('label:has-text("Kâr oranı") input').fill(String(profit));
}

const browser = await chromium.launch({ headless: true });
let storageState = null;
let auth = null;

try {
  // ═══ FAZ A: LOGIN ═══
  log("\n═══ FAZ A: Login ═══");
  const lc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await lc.newPage();
  await lp.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await lp.waitForTimeout(800);
  await lp.getByRole("button", { name: "Giriş Yap" }).first().click({ timeout: 15000 });
  await lp.waitForTimeout(400);
  await lp.locator('input[type="email"]').fill(EMAIL);
  await lp.locator('input[type="password"]').fill(PASS);
  await lp.getByRole("button", { name: /Uzman Paneline Gir/i }).click();
  await lp.waitForFunction(() => !!localStorage.getItem("yasam_session_token"), { timeout: 30000 })
    .catch(() => log("⚠️ token timeout"));
  await lp.waitForTimeout(1500);
  auth = await lp.evaluate(() => ({
    user: localStorage.getItem("yasam_user"),
    token: localStorage.getItem("yasam_session_token"),
  }));
  rec("Login + session token", !!auth.token, auth.token ? "token alındı" : "TOKEN YOK");
  const u = JSON.parse(auth.user);
  rec("Hesap demo değil", u.is_demo_account !== true, `is_demo=${u.is_demo_account}`);
  storageState = await lc.storageState();
  await lc.close();

  if (!auth.token) throw new Error("Login başarısız — token yok");

  // Taze (auth-only) context kurucu: oil cache localStorage'ı YOK, sadece kimlik.
  const freshAuthCtx = async (opts) => {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(([uu, tt]) => {
      localStorage.setItem("yasam_user", uu);
      localStorage.setItem("yasam_session_token", tt);
    }, [auth.user, auth.token]);
    return ctx;
  };

  // ═══ FAZ B: DESKTOP EKLE ═══
  log("\n═══ FAZ B: Desktop yağ kaydı ekle ═══");
  const dc = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
  const dp = await dc.newPage();
  await dp.goto(BASE + "/urun-stok/yag", { waitUntil: "domcontentloaded", timeout: 45000 });
  await dp.waitForTimeout(1500);
  // 1 litre, alış 3000 → 3₺/ml; satış 6000 → 6₺/ml
  await fillStockForm(dp, { name: NAME_DESK, unit: "litre", qty: 1, cost: 3000, sale: 6000, profit: 100 });
  await dp.getByRole("button", { name: "Ekle", exact: true }).click();
  // buluta kaydedildi mesajı
  const cloudMsg = await dp.waitForSelector('text=/buluta kaydedildi/i', { timeout: 20000 })
    .then(() => true).catch(() => false);
  rec("Desktop ekleme — 'buluta kaydedildi' mesajı", cloudMsg);
  await dp.waitForTimeout(800);
  const rowVisible = await dp.locator(`td:has-text("${NAME_DESK}")`).first().isVisible().catch(() => false);
  rec("Desktop listede görünüyor", rowVisible);

  // Birim maliyet / satış doğrulama (litre→ml dönüşümü bozulmamış mı)
  const rowText = await dp.locator(`tr:has(td:has-text("${NAME_DESK}"))`).first().innerText().catch(() => "");
  const costOk = /3,00\s*\/\s*ml/.test(rowText);
  const saleOk = /6,00\s*\/\s*ml/.test(rowText);
  rec("Birim maliyet ₺3,00/ml (1L=1000ml)", costOk, rowText.replace(/\s+/g, " ").slice(0, 90));
  rec("Birim satış ₺6,00/ml", saleOk);

  // DB doğrulama (server'da gerçekten var mı)
  const dbCount = await dp.evaluate(async (nm) => {
    const uu = JSON.parse(localStorage.getItem("yasam_user"));
    const tt = localStorage.getItem("yasam_session_token");
    const r = await fetch("/api/urun-stok/yag", { headers: { "x-user-id": uu.id, "x-session-token": tt }, cache: "no-store" });
    const j = await r.json();
    return (j.rows || []).filter((x) => x.name === nm).length;
  }, NAME_DESK);
  rec("API/DB'de kayıt mevcut", dbCount >= 1, `eşleşen satır=${dbCount}`);

  // ═══ FAZ C: F5 RELOAD ═══
  log("\n═══ FAZ C: F5 (reload) ═══");
  await dp.reload({ waitUntil: "domcontentloaded" });
  await dp.waitForTimeout(2000);
  const afterReload = await dp.locator(`td:has-text("${NAME_DESK}")`).first().isVisible().catch(() => false);
  rec("F5 sonrası kayıt duruyor", afterReload);
  await dc.close();

  // ═══ FAZ D: TAZE CONTEXT (DB'den yükleme) ═══
  log("\n═══ FAZ D: Taze context — DB'den yükleme (oil cache YOK) ═══");
  const fc = await freshAuthCtx({ viewport: { width: 1440, height: 900 } });
  const fp = await fc.newPage();
  await fp.goto(BASE + "/urun-stok/yag", { waitUntil: "domcontentloaded", timeout: 45000 });
  await fp.waitForTimeout(2500);
  const freshSees = await fp.locator(`td:has-text("${NAME_DESK}")`).first().isVisible().catch(() => false);
  rec("Taze context kaydı DB'den görüyor", freshSees);
  await fc.close();

  // ═══ FAZ E: MOBİL EKLE → TAZE DESKTOP GÖRÜR ═══
  log("\n═══ FAZ E: Mobil ekle → taze desktop senkron ═══");
  const mc = await freshAuthCtx({ ...devices["iPhone 13"] });
  const mp = await mc.newPage();
  await mp.goto(BASE + "/urun-stok/yag", { waitUntil: "domcontentloaded", timeout: 45000 });
  await mp.waitForTimeout(2000);
  await fillStockForm(mp, { name: NAME_MOB, unit: "ml", qty: 50, cost: 500, sale: 1000, profit: 100 });
  await mp.getByRole("button", { name: "Ekle", exact: true }).click();
  const mCloud = await mp.waitForSelector('text=/buluta kaydedildi/i', { timeout: 20000 })
    .then(() => true).catch(() => false);
  rec("Mobil ekleme — buluta kaydedildi", mCloud);
  await mc.close();

  const dc2 = await freshAuthCtx({ viewport: { width: 1440, height: 900 } });
  const dp2 = await dc2.newPage();
  await dp2.goto(BASE + "/urun-stok/yag", { waitUntil: "domcontentloaded", timeout: 45000 });
  await dp2.waitForTimeout(2500);
  const deskSeesMob = await dp2.locator(`td:has-text("${NAME_MOB}")`).first().isVisible().catch(() => false);
  rec("Mobilde eklenen masaüstünde görünüyor", deskSeesMob);
  // 50 ml, 500 → 10₺/ml
  const mobRow = await dp2.locator(`tr:has(td:has-text("${NAME_MOB}"))`).first().innerText().catch(() => "");
  rec("Mobil kayıt birim maliyet ₺10,00/ml", /10,00\s*\/\s*ml/.test(mobRow), mobRow.replace(/\s+/g, " ").slice(0, 90));
  await dc2.close();

  // ═══ FAZ F: ÖZET ═══
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  log("\n═══ ÖZET ═══");
  log(JSON.stringify({ pass, fail, total: results.length, failed: results.filter((r) => !r.ok).map((r) => r.name) }, null, 2));
} catch (e) {
  log("HATA:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
