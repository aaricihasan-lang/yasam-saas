/**
 * Şifa Rehberi Demo V2 doğrulaması
 * - Liste: ~40 kayıt, başlık/kategori/dolu-bölüm görünür, özet blur
 * - Detay: sol menü + bölüm başlıkları görünür, içerik blur, kilit rozeti
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE = "http://localhost:3000";
const SS_DIR = "scripts/screenshots/verify-sifa-demo";
fs.mkdirSync(SS_DIR, { recursive: true });

let idx = 0;
const shot = async (page, label, full = false) => {
  const f = path.join(SS_DIR, `S${String(idx++).padStart(2, "0")}-${label}.png`);
  await page.screenshot({ path: f, fullPage: full });
  console.log(`  📸 ${f}${full ? " (full)" : ""}`);
  return f;
};

const results = [];
const pass = (l) => { results.push({ l, ok: true }); console.log(`  ✅ ${l}`); };
const fail = (l, r) => { results.push({ l, ok: false, r }); console.log(`  ❌ ${l}: ${r}`); };
const info = (m) => console.log(`  ℹ️  ${m}`);

const DEMO_USER = {
  id: "demo-uzman-test-001", tenant_id: "demo-tenant-001",
  full_name: "Demo Uzman", email: "uzman@test.com",
  role: "expert", status: "active", active: true,
  approval_status: "approved", subscription_status: "active",
  is_demo_account: true,
  // Modül erişim guard'ı için premium üyelik (gerçek demo hesabı da premium)
  package_type: "premium", plan: "premium", membership_status: "active",
  module_permissions: { sifa_rehberi: true, healing: true },
};

// DemoBlur uygulanan element sayısı (aria-hidden + filter:blur inline style)
async function countBlurred(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('[aria-hidden="true"]'))
      .filter((el) => (el.style?.filter || "").includes("blur")).length;
  });
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();

try {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((u) => localStorage.setItem("yasam_user", JSON.stringify(u)), DEMO_USER);

  // ── 1. LİSTE (kart görünümü) ──────────────────────────────────────────────
  console.log("\n=== 1. LİSTE — KART GÖRÜNÜMÜ ===");
  await page.goto(`${BASE}/sifa-rehberi?view=list`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await shot(page, "liste-kart");

  const cardCount = await page.locator("article").count();
  info(`Kart sayısı: ${cardCount}`);
  if (cardCount >= 30) pass(`Liste — ${cardCount} kayıt (≥30 hedefi)`);
  else fail("Liste kayıt sayısı", `${cardCount} < 30`);

  const body1 = await page.locator("body").textContent();
  const sampleTitles = ["Migren", "Astım", "Reflü", "Siyatik", "Hipertansiyon", "Egzama"];
  const foundTitles = sampleTitles.filter((t) => body1.includes(t));
  info(`Görünür başlıklar: ${foundTitles.join(", ")}`);
  if (foundTitles.length >= 5) pass(`Liste — başlıklar görünür (${foundTitles.length}/6)`);
  else fail("Liste başlıkları", `yalnız ${foundTitles.length}/6 bulundu`);

  const hasFillBadge = body1.includes("bölüm dolu");
  if (hasFillBadge) pass("Liste — 'bölüm dolu' doluluk etiketi görünür");
  else fail("Doluluk etiketi", "'bölüm dolu' bulunamadı");

  const blurredCards = await countBlurred(page);
  info(`Kart görünümünde blurlu özet sayısı: ${blurredCards}`);
  if (blurredCards >= 30) pass(`Liste — özet metinleri blur (${blurredCards} blurlu öğe)`);
  else fail("Liste özet blur", `yalnız ${blurredCards} blurlu öğe`);

  // ── 2. LİSTE (satır görünümü) ─────────────────────────────────────────────
  console.log("\n=== 2. LİSTE — SATIR GÖRÜNÜMÜ ===");
  const listeBtn = page.locator('button:has-text("Liste")').first();
  if (await listeBtn.isVisible().catch(() => false)) {
    await listeBtn.click();
    await page.waitForTimeout(1200);
  }
  await shot(page, "liste-satir");
  const blurredRows = await countBlurred(page);
  info(`Satır görünümünde blurlu özet sayısı: ${blurredRows}`);
  if (blurredRows >= 30) pass(`Satır — özet metinleri blur (${blurredRows})`);
  else fail("Satır özet blur", `yalnız ${blurredRows} blurlu öğe`);

  // ── 3. DETAY — tüm sekmeler ───────────────────────────────────────────────
  console.log("\n=== 3. DETAY — TÜM SEKMELER ===");
  await page.goto(`${BASE}/sifa-rehberi/demo-sifa-migren`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await shot(page, "detay-rahatsizlik");

  const bodyD = await page.locator("body").textContent();
  if (bodyD.includes("Migren")) pass("Detay — başlık (Migren) görünür");
  else fail("Detay başlık", "Migren bulunamadı");

  const menuItems = ["Rahatsızlık", "Belirtiler / Sebepler", "Uygulamalar / Yöntemler",
    "Doğaltaş & Mineral", "Aromaterapi", "İslami Öneriler", "Destekleyici"];
  const foundMenu = menuItems.filter((m) => bodyD.includes(m));
  info(`Sol menü bölümleri: ${foundMenu.length}/7`);
  if (foundMenu.length === 7) pass("Detay — 7 sol menü bölümü görünür");
  else fail("Detay sol menü", `${foundMenu.length}/7 — eksik: ${menuItems.filter(m=>!foundMenu.includes(m)).join(", ")}`);

  const lockChips = await page.locator('text=🔒 Demo').count();
  info(`Kilit rozeti sayısı (ilk sekme): ${lockChips}`);
  if (lockChips >= 1) pass(`Detay — kilit rozeti görünür (${lockChips})`);
  else fail("Detay kilit rozeti", "🔒 Demo bulunamadı");

  // Her sekmeye tıkla; başlık görünür + içerik blur kontrolü
  const tabsToCheck = [
    { label: "Belirtiler / Sebepler", heading: "Tıbbi Nedenler" },
    { label: "Uygulamalar / Yöntemler", heading: "Refleksoloji" },
    { label: "Doğaltaş & Mineral", heading: "Doğaltaş Önerileri" },
    { label: "Aromaterapi", heading: "Aromaterapi" },
    { label: "İslami Öneriler", heading: "İslami Öneriler" },
    { label: "Destekleyici", heading: "Meditasyon" },
  ];

  for (const t of tabsToCheck) {
    const btn = page.locator(`button:has-text("${t.label}")`).first();
    if (!(await btn.isVisible().catch(() => false))) {
      fail(`Sekme "${t.label}"`, "buton görünmez");
      continue;
    }
    await btn.click();
    await page.waitForTimeout(700);
    const b = await page.locator("body").textContent();
    const headingVisible = b.includes(t.heading);
    const blurred = await countBlurred(page);
    info(`[${t.label}] başlık "${t.heading}": ${headingVisible}, blurlu içerik: ${blurred}`);
    if (headingVisible && blurred >= 1) pass(`Sekme "${t.label}" — başlık açık, içerik blur (${blurred})`);
    else fail(`Sekme "${t.label}"`, `başlık=${headingVisible}, blur=${blurred}`);
    await shot(page, `detay-${t.label.replace(/[^a-zA-Z]/g, "").slice(0, 10)}`);
  }

  // Düzenle/Sil butonu demo'da olmamalı
  const editBtn = await page.locator('button:has-text("Düzenle")').count();
  const delBtn = await page.locator('button:has-text("Sil")').count();
  info(`Düzenle butonu: ${editBtn}, Sil butonu: ${delBtn}`);
  if (editBtn === 0 && delBtn === 0) pass("Detay — Düzenle/Sil butonları demo'da gizli");
  else fail("Detay aksiyon butonları", `Düzenle=${editBtn}, Sil=${delBtn} (gizli olmalı)`);

} catch (e) {
  console.error(`\n🔴 HATA: ${e.message}`);
  await shot(page, "error").catch(() => {});
  fail("Genel hata", e.message.slice(0, 200));
} finally {
  await browser.close();
}

console.log("\n" + "═".repeat(55));
const ok = results.filter((r) => r.ok).length;
const bad = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? "✅" : "❌"} ${r.l}${r.r ? `: ${r.r}` : ""}`));
console.log(`\nSONUÇ: ${ok} PASS, ${bad.length} FAIL`);
process.exit(bad.length === 0 ? 0 : 1);
