/**
 * verify-aksesuar-persistence.mjs — K-2 Aksesuar DB kalıcılık canlı testi.
 * Yerel production (next start) + prod Supabase. Kayıtlar SİLİNMEZ.
 *
 *  FAZ A  login (esra, localhost) → storageState (tek login, paylaşılır)
 *  FAZ B  desktop: kayıt ekle → listede gör → birim maliyet/satış/adet doğrula
 *  FAZ C  F5 (reload) → kayıt kaybolmuyor mu
 *  FAZ D  TAZE context (yalnız auth, cache YOK) → DB'den yükleniyor mu
 *  FAZ E  mobil ekle → taze desktop görüyor mu (mobil→web senkron)
 *  FAZ F  JSON özet
 */
import { chromium, devices } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3213";
const EMAIL = "esra@outlook.com";
const PASS = "123456";
const TAG = new Date().toISOString().slice(5, 19).replace(/[-:T]/g, "");
const log = (...a) => console.log(...a);

const NAME_DESK = `TEST TESPIH K2 WEB ${TAG}`;
const NAME_MOB = `TEST BILEKLIK K2 MOBIL ${TAG}`;

const results = [];
const rec = (name, ok, detail) => { results.push({ name, ok, detail }); log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`); };

async function fillStockForm(p, { name, qty, cost, sale, profit }) {
  await p.locator('label:has-text("Urun adi") input').fill(name);
  await p.locator('label:has-text("Stok adedi") input').fill(String(qty));
  await p.locator('label:has-text("Alis maliyeti") input').fill(String(cost));
  await p.locator('label:has-text("Satis fiyati") input').fill(String(sale));
  await p.locator('label:has-text("Kar orani") input').fill(String(profit));
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

  const freshAuthCtx = async (opts) => {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(([uu, tt]) => {
      localStorage.setItem("yasam_user", uu);
      localStorage.setItem("yasam_session_token", tt);
    }, [auth.user, auth.token]);
    return ctx;
  };

  // ═══ FAZ B: DESKTOP EKLE ═══
  log("\n═══ FAZ B: Desktop aksesuar kaydı ekle ═══");
  const dc = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
  const dp = await dc.newPage();
  await dp.goto(BASE + "/urun-stok/aksesuar", { waitUntil: "domcontentloaded", timeout: 45000 });
  await dp.waitForTimeout(1500);
  // 10 adet, alış 500 → 50₺/adet; satış 1000 → 100₺/adet
  await fillStockForm(dp, { name: NAME_DESK, qty: 10, cost: 500, sale: 1000, profit: 100 });
  await dp.getByRole("button", { name: "Ekle", exact: true }).click();
  const cloudMsg = await dp.waitForSelector('text=/buluta kaydedildi/i', { timeout: 20000 })
    .then(() => true).catch(() => false);
  rec("Desktop ekleme — 'buluta kaydedildi' mesajı", cloudMsg);
  await dp.waitForTimeout(800);
  const rowVisible = await dp.locator(`td:has-text("${NAME_DESK}")`).first().isVisible().catch(() => false);
  rec("Desktop listede görünüyor", rowVisible);

  const rowText = await dp.locator(`tr:has(td:has-text("${NAME_DESK}"))`).first().innerText().catch(() => "");
  rec("Stok gösterimi 10 adet", /\b10 adet\b/.test(rowText), rowText.replace(/\s+/g, " ").slice(0, 110));
  rec("Birim maliyet ₺50,00/adet (500/10)", /50,00\s*\/\s*adet/.test(rowText));
  rec("Birim satış ₺100,00/adet", /100,00\s*\/\s*adet/.test(rowText));

  const dbCount = await dp.evaluate(async (nm) => {
    const uu = JSON.parse(localStorage.getItem("yasam_user"));
    const tt = localStorage.getItem("yasam_session_token");
    const r = await fetch("/api/urun-stok/aksesuar", { headers: { "x-user-id": uu.id, "x-session-token": tt }, cache: "no-store" });
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
  log("\n═══ FAZ D: Taze context — DB'den yükleme (cache YOK) ═══");
  const fc = await freshAuthCtx({ viewport: { width: 1440, height: 900 } });
  const fp = await fc.newPage();
  await fp.goto(BASE + "/urun-stok/aksesuar", { waitUntil: "domcontentloaded", timeout: 45000 });
  await fp.waitForTimeout(2500);
  const freshSees = await fp.locator(`td:has-text("${NAME_DESK}")`).first().isVisible().catch(() => false);
  rec("Taze context kaydı DB'den görüyor", freshSees);
  await fc.close();

  // ═══ FAZ E: MOBİL EKLE → TAZE DESKTOP GÖRÜR ═══
  log("\n═══ FAZ E: Mobil ekle → taze desktop senkron ═══");
  const mc = await freshAuthCtx({ ...devices["iPhone 13"] });
  const mp = await mc.newPage();
  await mp.goto(BASE + "/urun-stok/aksesuar", { waitUntil: "domcontentloaded", timeout: 45000 });
  await mp.waitForTimeout(2000);
  // 25 adet, alış 750 → 30₺/adet
  await fillStockForm(mp, { name: NAME_MOB, qty: 25, cost: 750, sale: 1500, profit: 100 });
  await mp.getByRole("button", { name: "Ekle", exact: true }).click();
  const mCloud = await mp.waitForSelector('text=/buluta kaydedildi/i', { timeout: 20000 })
    .then(() => true).catch(() => false);
  rec("Mobil ekleme — buluta kaydedildi", mCloud);
  await mc.close();

  const dc2 = await freshAuthCtx({ viewport: { width: 1440, height: 900 } });
  const dp2 = await dc2.newPage();
  await dp2.goto(BASE + "/urun-stok/aksesuar", { waitUntil: "domcontentloaded", timeout: 45000 });
  await dp2.waitForTimeout(2500);
  const deskSeesMob = await dp2.locator(`td:has-text("${NAME_MOB}")`).first().isVisible().catch(() => false);
  rec("Mobilde eklenen masaüstünde görünüyor", deskSeesMob);
  const mobRow = await dp2.locator(`tr:has(td:has-text("${NAME_MOB}"))`).first().innerText().catch(() => "");
  rec("Mobil kayıt 25 adet + ₺30,00/adet (750/25)", /\b25 adet\b/.test(mobRow) && /30,00\s*\/\s*adet/.test(mobRow), mobRow.replace(/\s+/g, " ").slice(0, 110));
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
