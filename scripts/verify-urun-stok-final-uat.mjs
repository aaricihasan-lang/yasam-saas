/**
 * verify-urun-stok-final-uat.mjs — Ürün & Stok Merkezi SON kapsamlı UAT.
 * Yerel production + prod Supabase. Gerçek kullanıcı gözüyle uçtan uca.
 * Kayıtlar SİLİNMEZ (Hasan gözle kontrol edecek).
 *
 *  A  Login
 *  B  Stok artır (delta) + düzenle + SAT (stok düşme) → DB kalıcılığı
 *  C  Canlı Stok satış sonrası kalan stoğu yansıtıyor mu (taze context)
 *  D  Responsive/taşma taraması (390px + 1280px, hub + 5 modül + canlı stok)
 *  E  Hub linkleri + stok-hareketleri redirect
 *  F  JSON özet
 */
import { chromium, devices } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3216";
const EMAIL = "esra@outlook.com";
const PASS = "123456";
const TAG = new Date().toISOString().slice(5, 19).replace(/[-:T]/g, "");
const log = (...a) => console.log(...a);
const NAME = `UAT YAG AKIS ${TAG}`;

const results = [];
const rec = (name, ok, detail) => { results.push({ name, ok, detail }); log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`); };

const browser = await chromium.launch({ headless: true });
let auth = null, storageState = null;

try {
  // ═══ A: LOGIN ═══
  log("\n═══ A: Login ═══");
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
  auth = await lp.evaluate(() => ({ user: localStorage.getItem("yasam_user"), token: localStorage.getItem("yasam_session_token") }));
  rec("Login + token", !!auth.token);
  storageState = await lc.storageState();
  await lc.close();
  if (!auth.token) throw new Error("Login başarısız");

  const freshAuthCtx = async (opts) => {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(([uu, tt]) => {
      localStorage.setItem("yasam_user", uu);
      localStorage.setItem("yasam_session_token", tt);
    }, [auth.user, auth.token]);
    return ctx;
  };
  const dbStock = async (page) => page.evaluate(async (nm) => {
    const uu = JSON.parse(localStorage.getItem("yasam_user"));
    const tt = localStorage.getItem("yasam_session_token");
    const r = await fetch("/api/urun-stok/yag", { headers: { "x-user-id": uu.id, "x-session-token": tt }, cache: "no-store" });
    const j = await r.json();
    const row = (j.rows || []).find((x) => x.name === nm);
    return row ? row.stock_base : null;
  }, NAME);

  // ═══ B: EKLE → ARTIR (delta) → SAT (stok düşme) → DB kalıcılığı ═══
  log("\n═══ B: Stok artır + sat akışı (yağ) ═══");
  const dc = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
  const dp = await dc.newPage();
  await dp.goto(BASE + "/urun-stok/yag", { waitUntil: "domcontentloaded", timeout: 45000 });
  await dp.waitForTimeout(1500);

  // B1: yeni ürün, 100 ml, alış 1000 (10₺/ml), satış 2000, kar 100
  await dp.locator('label:has-text("Ürün adı") input').fill(NAME);
  await dp.locator('label:has-text("Birim") select').selectOption("ml");
  await dp.locator('label:has-text("Stok miktarı") input').fill("100");
  await dp.locator('label:has-text("Alış maliyeti") input').fill("1000");
  await dp.locator('label:has-text("Satış fiyatı") input').fill("2000");
  await dp.locator('label:has-text("Kâr oranı") input').fill("100");
  await dp.getByRole("button", { name: "Ekle", exact: true }).click();
  await dp.waitForSelector('text=/buluta kaydedildi/i', { timeout: 20000 }).catch(() => {});
  await dp.waitForTimeout(800);
  rec("B1 Ekleme: DB stock_base=100", (await dbStock(dp)) === 100, `db=${await dbStock(dp)}`);

  // B2: Düzenle → "Mevcut stoğa ekle" işaretli, +50 → 150
  await dp.locator(`tr:has(td:has-text("${NAME}")) button:has-text("Düzenle")`).first().click();
  await dp.waitForTimeout(600);
  const addChk = dp.locator('label:has-text("Mevcut stoğa ekle") input[type="checkbox"]');
  if (!(await addChk.isChecked())) await addChk.check();
  await dp.locator('label:has-text("Stok miktarı") input').fill("50");
  await dp.getByRole("button", { name: "Güncelle", exact: true }).click();
  await dp.waitForSelector('text=/buluta kaydedildi/i', { timeout: 20000 }).catch(() => {});
  await dp.waitForTimeout(1000);
  rec("B2 Stok artırma (+50): DB stock_base=150", (await dbStock(dp)) === 150, `db=${await dbStock(dp)}`);

  // B3: Satış — pricing tab, 30 ml sat → 120 kalmalı
  await dp.getByRole("button", { name: /Satış & Fiyatlandırma/i }).click();
  await dp.waitForTimeout(800);
  const optVal = await dp.evaluate((nm) => {
    const s = document.querySelector("select");
    const o = s ? [...s.options].find((o) => o.text.includes(nm)) : null;
    return o ? o.value : "";
  }, NAME);
  await dp.locator("select").first().selectOption(optVal);
  await dp.waitForTimeout(500);
  await dp.locator('label:has-text("Satılacak miktar") input').fill("30");
  await dp.getByRole("button", { name: "Sepete Ekle", exact: true }).click();
  await dp.waitForTimeout(500);
  await dp.getByRole("button", { name: /Satışı Kaydet/i }).click();
  await dp.waitForSelector('text=/stok düşüldü|stok dusuldu/i', { timeout: 20000 }).catch(() => {});
  await dp.waitForTimeout(2500); // fire-and-forget sync
  rec("B3 Satış sonrası DB stock_base=120 (150-30)", (await dbStock(dp)) === 120, `db=${await dbStock(dp)}`);
  await dc.close();

  // ═══ C: Taze context — satış sonrası kalan stok DB'den ═══
  log("\n═══ C: Taze context — satış sonrası stok kalıcılığı ═══");
  const fc = await freshAuthCtx({ viewport: { width: 1440, height: 900 } });
  const fp = await fc.newPage();
  await fp.goto(BASE + "/urun-stok/yag", { waitUntil: "domcontentloaded", timeout: 45000 });
  await fp.waitForTimeout(2500);
  const cRow = await fp.locator(`tr:has(td:has-text("${NAME}"))`).first().innerText().catch(() => "");
  rec("Taze context 120 ml gösteriyor", /\b120 ml\b/.test(cRow), cRow.replace(/\s+/g, " ").slice(0, 80));
  // Canlı Stok'ta da yansıyor mu
  await fp.goto(BASE + "/urun-stok/canli-stok", { waitUntil: "domcontentloaded", timeout: 45000 });
  await fp.waitForTimeout(3500);
  const liveText = await fp.locator("main").innerText().catch(() => "");
  rec("Canlı Stok satılan ürünü 120 ml ile gösteriyor", liveText.includes(NAME) && /120 ml/.test(liveText));
  await fc.close();

  // ═══ D: Responsive / taşma taraması ═══
  log("\n═══ D: Responsive taşma taraması ═══");
  const pages = [
    ["Hub", "/urun-stok"],
    ["Yağ", "/urun-stok/yag"],
    ["Sabun/Krem", "/urun-stok/sabun-krem"],
    ["Aksesuar", "/urun-stok/aksesuar"],
    ["Diğer", "/urun-stok/diger"],
    ["Canlı Stok", "/urun-stok/canli-stok"],
  ];
  for (const [vpLabel, vp] of [["mobil 390", { width: 390, height: 844 }], ["desktop 1280", { width: 1280, height: 900 }]]) {
    const rc = await freshAuthCtx({ viewport: vp });
    const rp = await rc.newPage();
    for (const [label, path] of pages) {
      await rp.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 });
      await rp.waitForTimeout(1800);
      const o = await rp.evaluate(() => {
        const de = document.documentElement;
        return { sw: de.scrollWidth, cw: de.clientWidth };
      });
      const over = o.sw > o.cw + 2;
      rec(`${vpLabel} · ${label} yatay taşma yok`, !over, over ? `scrollW=${o.sw} > clientW=${o.cw}` : "ok");
    }
    await rc.close();
  }

  // ═══ E: Hub linkleri + redirect ═══
  log("\n═══ E: Hub linkleri + stok-hareketleri redirect ═══");
  const ec = await freshAuthCtx({ viewport: { width: 1280, height: 900 } });
  const ep = await ec.newPage();
  const hubLinks = [
    "/urun-stok/canli-stok", "/urun-stok/dogaltas", "/urun-stok/yag",
    "/urun-stok/sabun-krem", "/urun-stok/aksesuar", "/urun-stok/satis-fiyatlandirma",
    "/urun-stok/satis-gecmisi", "/urun-stok/diger",
  ];
  let allOk = true; const broken = [];
  for (const href of hubLinks) {
    const resp = await ep.goto(BASE + href, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    const status = resp ? resp.status() : 0;
    if (status >= 400 || status === 0) { allOk = false; broken.push(`${href}:${status}`); }
  }
  rec("8 hub linki açılıyor (404 yok)", allOk, broken.join(", ") || "hepsi ok");
  // redirect
  await ep.goto(BASE + "/urun-stok/stok-hareketleri", { waitUntil: "domcontentloaded", timeout: 45000 });
  await ep.waitForTimeout(1200);
  rec("stok-hareketleri → canlı-stok redirect", ep.url().includes("/urun-stok/canli-stok"), ep.url());
  await ec.close();

  // ═══ F: ÖZET ═══
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  log("\n═══ ÖZET ═══");
  log(JSON.stringify({ pass, fail, total: results.length, failed: results.filter((r) => !r.ok).map((r) => `${r.name} (${r.detail || ""})`) }, null, 2));
} catch (e) {
  log("HATA:", e.message, e.stack);
  process.exitCode = 1;
} finally {
  await browser.close();
}
