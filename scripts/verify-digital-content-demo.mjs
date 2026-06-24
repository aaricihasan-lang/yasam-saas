/**
 * Dijital İçerik Merkezi — Demo Hesap Dönüşümü doğrulaması
 * - Hub + 4 alt modülde standart Demo Banner
 * - Temiz boş sistem (örnek/fixture kayıt yok)
 * - Tüm işlem tetikleyicileri standart uyarı gösterir, işlem çalışmaz
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE = "http://localhost:3000";
const SS_DIR = "scripts/screenshots/verify-digital-content-demo";
const TMP = "scripts/.dc-tmp";
fs.mkdirSync(SS_DIR, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

// Dummy yükleme dosyaları
const pdfPath = path.join(TMP, "demo.pdf");
const txtPath = path.join(TMP, "demo.txt");
const mp3Path = path.join(TMP, "demo.mp3");
fs.writeFileSync(pdfPath, "%PDF-1.4\n%demo\n");
fs.writeFileSync(txtPath, "Demo ham transkript metni.");
fs.writeFileSync(mp3Path, Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00]));

let idx = 0;
const shot = async (page, label) => {
  const f = path.join(SS_DIR, `D${String(idx++).padStart(2, "0")}-${label}.png`);
  await page.screenshot({ path: f, fullPage: false });
  console.log(`  📸 ${f}`);
};

const results = [];
const pass = (l) => { results.push({ l, ok: true }); console.log(`  ✅ ${l}`); };
const fail = (l, r) => { results.push({ l, ok: false, r }); console.log(`  ❌ ${l}: ${r}`); };
const info = (m) => console.log(`  ℹ️  ${m}`);

const WARN = "demo hesapta pasiftir";
const BANNER = "Dijital İçerik Merkezi'ni demo olarak";

const DEMO_USER = {
  id: "demo-uzman-test-001", tenant_id: "demo-tenant-001",
  full_name: "Demo Uzman", email: "uzman@test.com",
  role: "expert", status: "active", active: true,
  approval_status: "approved", subscription_status: "active",
  is_demo_account: true,
  package_type: "premium", plan: "premium", membership_status: "active",
  module_permissions: {
    personal_archive: true, kisisel_arsiv: true,
    video_ceviri: true, belge_ceviri: true, ders_notu: true,
    digital_content: true,
  },
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const bodyText = () => page.locator("body").textContent();

try {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((u) => localStorage.setItem("yasam_user", JSON.stringify(u)), DEMO_USER);

  // ── HUB ───────────────────────────────────────────────────────────────────
  console.log("\n=== HUB /digital-content ===");
  await page.goto(`${BASE}/digital-content`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await shot(page, "hub");
  let b = await bodyText();
  if (b.includes(BANNER)) pass("Hub — standart Demo Banner görünür");
  else fail("Hub banner", "banner metni yok");
  const cards = ["Kişisel Arşiv", "Belge Çeviri Merkezi", "Video", "Ders Notu Merkezi"];
  const foundCards = cards.filter((c) => b.includes(c));
  if (foundCards.length === 4) pass("Hub — 4 modül kartı görünür");
  else fail("Hub kartları", `${foundCards.length}/4`);

  // ── KİŞİSEL ARŞİV ───────────────────────────────────────────────────────────
  console.log("\n=== /dashboard/kisisel-arsiv ===");
  await page.goto(`${BASE}/dashboard/kisisel-arsiv`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  await shot(page, "kisisel-arsiv");
  b = await bodyText();
  if (b.includes(BANNER)) pass("Kişisel Arşiv — Demo Banner görünür");
  else fail("Kişisel Arşiv banner", "yok");
  if (b.includes("Henüz arşiv kaydı yok")) pass("Kişisel Arşiv — temiz boş liste (kayıt yok)");
  else fail("Kişisel Arşiv boş liste", "boş durum metni yok");
  // "+ Yeni Kayıt" → uyarı
  await page.locator('button:has-text("+ Yeni Kayıt")').first().click();
  await page.waitForTimeout(600);
  b = await bodyText();
  if (b.includes(WARN)) pass("Kişisel Arşiv — 'Yeni Kayıt' standart uyarı gösterdi");
  else fail("Kişisel Arşiv Yeni Kayıt", "uyarı çıkmadı");
  // Modal açılmamalı (işlem yapılamaz)
  const modalOpen = await page.locator('text=Yeni Arşiv Kaydı').isVisible().catch(() => false);
  if (!modalOpen) pass("Kişisel Arşiv — kayıt modalı açılmadı (işlem engellendi)");
  else fail("Kişisel Arşiv modal", "modal açıldı");

  // ── BELGE ÇEVİRİ ───────────────────────────────────────────────────────────
  console.log("\n=== /belge-ceviri ===");
  await page.goto(`${BASE}/belge-ceviri`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await shot(page, "belge-ceviri");
  b = await bodyText();
  if (b.includes(BANNER)) pass("Belge Çeviri — Demo Banner görünür");
  else fail("Belge Çeviri banner", "yok");
  // PDF seç → İşlem başlat → uyarı
  const pdfInput = page.locator('input[type="file"]').first();
  await pdfInput.setInputFiles(pdfPath);
  await page.waitForTimeout(500);
  // "Word'e Dönüştür" butonunu bul ve tıkla
  const convertBtn = page.locator('button:has-text("Word\'e Dönüştür")').first();
  await convertBtn.click();
  await page.waitForTimeout(700);
  b = await bodyText();
  if (b.includes(WARN)) pass("Belge Çeviri — dönüştürme standart uyarı gösterdi");
  else fail("Belge Çeviri dönüştür", "uyarı çıkmadı");

  // ── VİDEO ÇEVİRİ ───────────────────────────────────────────────────────────
  console.log("\n=== /video-ceviri ===");
  await page.goto(`${BASE}/video-ceviri`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await shot(page, "video-ceviri");
  b = await bodyText();
  if (b.includes(BANNER)) pass("Video Çeviri — Demo Banner görünür");
  else fail("Video Çeviri banner", "yok");
  if (b.includes("Henüz işlem kaydı yok")) pass("Video Çeviri — temiz boş liste");
  else fail("Video Çeviri boş liste", "boş durum metni yok");
  // Dosya seç → İşlem Başlat → standart uyarı (error banner)
  const vInput = page.locator('input[type="file"]').first();
  await vInput.setInputFiles(mp3Path);
  await page.waitForTimeout(500);
  await page.locator('button:has-text("İşlem Başlat")').first().click();
  await page.waitForTimeout(700);
  b = await bodyText();
  if (b.includes(WARN)) pass("Video Çeviri — yükleme standart uyarı gösterdi");
  else fail("Video Çeviri yükleme", "uyarı çıkmadı");

  // ── DERS NOTU ──────────────────────────────────────────────────────────────
  console.log("\n=== /ders-notu ===");
  await page.goto(`${BASE}/ders-notu`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await shot(page, "ders-notu");
  b = await bodyText();
  if (b.includes(BANNER)) pass("Ders Notu — Demo Banner görünür");
  else fail("Ders Notu banner", "yok");
  // Metin gir → Temizle (AI) → uyarı
  await page.locator("textarea").first().fill("Bu bir demo ham transkript metnidir. Temizlenecek.");
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Ders Notunu Temizle")').first().click();
  await page.waitForTimeout(700);
  b = await bodyText();
  if (b.includes(WARN)) pass("Ders Notu — AI temizleme standart uyarı gösterdi");
  else fail("Ders Notu AI", "uyarı çıkmadı");
  // Sonuç oluşmamalı — sağ panel hâlâ boş durum metnini göstermeli,
  // başarı toast'ı ("başarıyla temizlendi") çıkmamalı.
  const stillEmpty = b.includes("Temizlenmiş not burada görünecek");
  const noSuccess = !b.includes("başarıyla temizlendi");
  if (stillEmpty && noSuccess) pass("Ders Notu — sonuç üretilmedi (AI çalışmadı)");
  else fail("Ders Notu sonuç", `stillEmpty=${stillEmpty}, noSuccess=${noSuccess}`);

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
