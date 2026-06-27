/**
 * verify-canli-stok-dbfirst.mjs — K-3 Canlı Stok DB-first doğrulaması.
 * Yerel production + prod Supabase. Kayıt eklemez/silmez (salt okuma).
 *
 * Amaç: TAZE context'te (modül localStorage cache YOK) Canlı Stok sayfası
 * yağ/sabun-krem/aksesuar/diğer modüllerini de DB'den gösteriyor mu?
 * (Düzeltme öncesi yalnız Doğaltaş DB-first idi; diğerleri boş görünürdü.)
 */
import { chromium, devices } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3215";
const EMAIL = "esra@outlook.com";
const PASS = "123456";
const log = (...a) => console.log(...a);

const results = [];
const rec = (name, ok, detail) => { results.push({ name, ok, detail }); log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`); };

const browser = await chromium.launch({ headless: true });
try {
  // ── Login ──
  log("\n═══ Login ═══");
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
  const auth = await lp.evaluate(() => ({
    user: localStorage.getItem("yasam_user"),
    token: localStorage.getItem("yasam_session_token"),
  }));
  rec("Login + token", !!auth.token);
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

  // Beklenen: her modülde stoklu test kaydı var (önceki K-2 testlerinden).
  const expect = [
    { label: "Yağ (oil)", re: /TEST YAG K2/ },
    { label: "Sabun/Krem", re: /TEST (SABUN|KREM) K2/ },
    { label: "Aksesuar", re: /TEST (TESPIH|BILEKLIK) K2/ },
    { label: "Diğer", re: /TEST DIGER K2/ },
  ];

  // ── TAZE DESKTOP context: Canlı Stok ──
  log("\n═══ TAZE context — Canlı Stok (cache YOK) ═══");
  const fc = await freshAuthCtx({ viewport: { width: 1440, height: 900 } });
  const fp = await fc.newPage();
  await fp.goto(BASE + "/urun-stok/canli-stok", { waitUntil: "domcontentloaded", timeout: 45000 });
  await fp.waitForTimeout(4000); // 5 modül DB yüklemesi
  const bodyText = await fp.locator("main").innerText().catch(() => "");
  for (const e of expect) {
    rec(`Canlı Stok ${e.label} kaydını DB'den gösteriyor`, e.re.test(bodyText), e.re.test(bodyText) ? "görünür" : "YOK");
  }
  // Özet/filtre paneli render oldu mu (ASCII-güvenli; CSS uppercase'e dikkat)
  const varietyOk = /Listelenen/.test(bodyText) && /Filtreler/.test(bodyText);
  rec("Özet/filtre paneli render", varietyOk);
  await fc.close();

  // ── TAZE MOBİL context: aynı kontrol (müşteri 'elinde var mı?') ──
  log("\n═══ TAZE MOBİL context — Canlı Stok ═══");
  const mc = await freshAuthCtx({ ...devices["iPhone 13"] });
  const mp = await mc.newPage();
  await mp.goto(BASE + "/urun-stok/canli-stok", { waitUntil: "domcontentloaded", timeout: 45000 });
  await mp.waitForTimeout(4000);
  const mobText = await mp.locator("main").innerText().catch(() => "");
  // Mobilde en az bir modül + arama kutusu çalışıyor mu
  const anyMod = expect.some((e) => e.re.test(mobText));
  rec("Mobil taze context'te stoklar DB'den görünüyor", anyMod);
  // Arama: bir test ürününü ara, sonuç gelmeli
  await mp.locator('input[type="search"]').fill("TEST DIGER K2").catch(() => {});
  await mp.waitForTimeout(800);
  const afterSearch = await mp.locator("main").innerText().catch(() => "");
  rec("Mobil arama ile hızlı bulma çalışıyor", /TEST DIGER K2/.test(afterSearch));
  await mc.close();

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
