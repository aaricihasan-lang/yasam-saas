/**
 * qa-urun-stok-k1-verify.mjs
 * K-1 düzeltme doğrulaması: manuel doğaltaş kaydı DB'ye yazılıyor, yenilemede
 * kaybolmuyor, cihazlar arası senkron oluyor. Yerel production sunucu (aynı Supabase DB).
 * Test kayıtları SİLİNMEZ.  PORT vary: BASE_URL=http://localhost:3100 node scripts/qa-urun-stok-k1-verify.mjs
 */
import { chromium, devices } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3100";
const EMAIL = "esra@outlook.com";
const PASS = "123456";
const TAG = "K1-" + Math.floor(Date.now() / 1000).toString().slice(-6);
const log = (...a) => console.log(...a);

async function login(ctx) {
  const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Giriş Yap" }).first().click({ timeout: 15000 });
  await p.waitForTimeout(400);
  await p.locator('input[type="email"]').fill(EMAIL);
  await p.locator('input[type="password"]').fill(PASS);
  await p.getByRole("button", { name: /Uzman Paneline Gir/i }).click();
  await p.waitForFunction(() => !!localStorage.getItem("yasam_session_token"), { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1200);
  return p;
}

async function dbCount(page) {
  return page.evaluate(async () => {
    const u = JSON.parse(localStorage.getItem("yasam_user"));
    const t = localStorage.getItem("yasam_session_token");
    const r = await fetch("/api/dogaltas/inventory", { headers: { "x-user-id": u.id, "x-session-token": t } });
    const j = await r.json();
    return { count: (j.rows || []).length, names: (j.rows || []).map((x) => x.name) };
  });
}

async function addStone(page, name, { stok = "7", tl = "140", usd = "", rate = "" } = {}) {
  await page.goto(BASE + "/urun-stok/dogaltas", { waitUntil: "domcontentloaded", timeout: 35000 });
  await page.waitForTimeout(2000);
  const sec = page.locator("section").filter({ hasText: "Yeni Kayıt Ekle" }).first();
  await sec.locator('label:has-text("Taş adı") input').fill(name);
  await sec.locator('label:has-text("Stok adedi") input').fill(stok);
  await sec.locator('label:has-text("Dizi / ürün maliyeti TL") input').fill(tl);
  if (usd) await sec.locator('label:has-text("Dizi / ürün maliyeti USD") input').fill(usd);
  if (rate) await sec.locator('label:has-text("Dolar kuru") input').fill(rate);
  await page.waitForTimeout(500);
  await sec.getByRole("button", { name: /^Ekle$/ }).click();
  // DB yazımı + reloadInventory bekle
  await page.waitForTimeout(3500);
  return (await page.locator("body").innerText()).includes(name);
}

const browser = await chromium.launch({ headless: true });
const R = {};
try {
  // ── 0. TEK login → storageState (tüm context'ler aynı oturumu paylaşır;
  //      app tek-oturum güvenliği uyguladığı için yeniden login eski token'ı düşürür) ──
  const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await login(loginCtx);
  const storageState = await loginCtx.storageState();
  await loginCtx.close();

  // ── 1. Başlangıç DB ──
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
  const p = await ctx.newPage();
  await p.goto(BASE + "/urun-stok/dogaltas", { waitUntil: "domcontentloaded", timeout: 35000 });
  await p.waitForTimeout(1500);
  const before = await dbCount(p);
  log("Başlangıç DB:", before.count, before.names.join(", "));
  R.dbBefore = before.count;
  const baseStones = ["Ametist", "Ay Taşı", "Obsidyen", "Sitrin"];
  R.baseIntactBefore = baseStones.every((s) => before.names.some((n) => n.toUpperCase().includes(s.toUpperCase())));

  // ── 2. Masaüstünde ekle ──
  const deskName = `K1TEST DESK ${TAG}`;
  const added = await addStone(p, deskName, { stok: "10", tl: "100", usd: "5", rate: "40" });
  log(`2) Masaüstü ekleme listede: ${added ? "✅" : "❌"}`);
  R.added = added;

  // hesap/format hâlâ doğru mu (eklenen kayıt satırı)
  const dbAfterAdd = await dbCount(p);
  log(`   DB sayım ${before.count} → ${dbAfterAdd.count}, kayıt DB'de: ${dbAfterAdd.names.includes(deskName) ? "✅" : "❌"}`);
  R.inDbAfterAdd = dbAfterAdd.names.includes(deskName);

  // ── 3. RELOAD kalıcılık ──
  await p.reload({ waitUntil: "domcontentloaded", timeout: 35000 });
  await p.waitForTimeout(3000);
  const persists = (await p.locator("body").innerText()).includes(deskName);
  log(`3) RELOAD sonrası kalıcı: ${persists ? "✅ KALDI" : "❌ KAYBOLDU"}`);
  R.persistsAfterReload = persists;

  // ── 4. SYNC: taze context (aynı oturum) masaüstü kaydı görüyor ──
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + "/urun-stok/dogaltas", { waitUntil: "domcontentloaded", timeout: 35000 });
  await p2.waitForTimeout(3000);
  const sync1 = (await p2.locator("body").innerText()).includes(deskName);
  log(`4) Taze cihaz masaüstü kaydını görüyor: ${sync1 ? "✅" : "❌"}`);
  R.crossDeviceSeesDesk = sync1;

  // ── 5. MOBİL ekle → MASAÜSTÜ görsün (aynı oturum) ──
  const mctx = await browser.newContext({ ...devices["iPhone 13"], storageState });
  const mp = await mctx.newPage();
  const mobName = `K1TEST MOBIL ${TAG}`;
  const mAdded = await addStone(mp, mobName, { stok: "4", tl: "80" });
  log(`5a) Mobil ekleme listede: ${mAdded ? "✅" : "❌"}`);
  R.mobileAdded = mAdded;
  // masaüstü context (p) yenile → mobil kaydı görüyor mu
  await p.goto(BASE + "/urun-stok/dogaltas", { waitUntil: "domcontentloaded", timeout: 35000 });
  await p.waitForTimeout(3000);
  const deskSeesMob = (await p.locator("body").innerText()).includes(mobName);
  log(`5b) Masaüstü, mobil kaydını görüyor: ${deskSeesMob ? "✅" : "❌"}`);
  R.deskSeesMobile = deskSeesMob;

  // ── 6. MASAÜSTÜ ekle → MOBİL görsün ──
  const desk2Name = `K1TEST DESK2 ${TAG}`;
  await addStone(p, desk2Name, { stok: "3", tl: "60" });
  await mp.goto(BASE + "/urun-stok/dogaltas", { waitUntil: "domcontentloaded", timeout: 35000 });
  await mp.waitForTimeout(3000);
  const mobSeesDesk = (await mp.locator("body").innerText()).includes(desk2Name);
  log(`6) Mobil, masaüstü kaydını görüyor: ${mobSeesDesk ? "✅" : "❌"}`);
  R.mobileSeesDesk = mobSeesDesk;

  // ── 7. Mevcut 4 kayıt bozulmadı mı ──
  const finalDb = await dbCount(p);
  const baseIntact = baseStones.every((s) => finalDb.names.some((n) => n.toUpperCase().includes(s.toUpperCase())));
  log(`7) Ametist/AyTaşı/Obsidyen/Sitrin korunuyor: ${baseIntact ? "✅" : "❌"} (DB toplam ${finalDb.count})`);
  R.baseIntact = baseIntact;
  R.dbFinal = finalDb.count;
  R.dbFinalNames = finalDb.names;

  // ── 8. Hesap/format hâlâ çalışıyor mu ──
  await p.goto(BASE + "/urun-stok/dogaltas", { waitUntil: "domcontentloaded", timeout: 35000 });
  await p.waitForTimeout(2000);
  const sec = p.locator("section").filter({ hasText: "Yeni Kayıt Ekle" }).first();
  await sec.locator('label:has-text("Stok adedi") input').fill("10");
  await sec.locator('label:has-text("Dizi / ürün maliyeti TL") input').fill("100");
  await sec.locator('label:has-text("Dizi / ürün maliyeti USD") input').fill("5");
  await sec.locator('label:has-text("Dolar kuru") input').fill("40");
  await p.waitForTimeout(700);
  const prev = await p.locator("text=Anlık maliyet özeti").locator("..").innerText();
  const calcOk = /₺300,00/.test(prev) && /₺30,00/.test(prev);
  log(`8) Hesap/format doğru (₺300,00 / ₺30,00): ${calcOk ? "✅" : "❌"}`);
  R.calcOk = calcOk;

  const allPass = R.added && R.inDbAfterAdd && R.persistsAfterReload && R.crossDeviceSeesDesk &&
    R.mobileAdded && R.deskSeesMobile && R.mobileSeesDesk && R.baseIntact && R.calcOk;
  log("\n═══ SONUÇ:", allPass ? "✅ TÜM TESTLER GEÇTİ" : "❌ BAŞARISIZ VAR", "═══");
  log(JSON.stringify(R, null, 2));
  log("Oluşturulan test kayıtları (SİLİNMEDİ):", deskName, "|", mobName, "|", desk2Name);
} catch (e) {
  log("FATAL:", e.message, e.stack?.split("\n").slice(0, 4).join(" | "));
} finally {
  await browser.close();
}
