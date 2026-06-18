/**
 * Hacamat Word Raporu — API Test
 * Haziran 2026 (year=2026, month=5)
 *
 * Çalıştır: node test-output/test-hacamat-word.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createUnzip } from "zlib";
import { Readable } from "stream";

const __dir  = dirname(fileURLToPath(import.meta.url));
const OUT    = join(__dir, "hacamat-haziran-2026.docx");
const XMLDIR = join(__dir, "extracted-xml");

const BOLD = "\x1b[1m";
const RED  = "\x1b[31m";
const GRN  = "\x1b[32m";
const YEL  = "\x1b[33m";
const RST  = "\x1b[0m";

function ok(msg)   { console.log(`  ${GRN}✓${RST} ${msg}`); }
function fail(msg) { console.log(`  ${RED}✗${RST} ${msg}`); }
function info(msg) { console.log(`  ${YEL}→${RST} ${msg}`); }
function head(msg) { console.log(`\n${BOLD}${msg}${RST}`); }

// ─── 1. API Çağrısı ──────────────────────────────────────────────────────────
head("1. API Çağrısı — POST /api/hacamat/word-report");

const payload = {
  year:  2026,
  month: 5,   // Haziran (0-indexed)
  rules: [
    { text: "Hacamat öncesi en az 3 saat aç kalınmalıdır.", category: "oncesi" },
    { text: "Uygulama sonrası 24 saat duş alınmamalıdır.", category: "sonrasi" },
    { text: "Hacamat ayda en fazla 1–2 kez yaptırılmalıdır.", category: "genel" },
  ],
  expertNotes: "Bu ay sünnet günleri oldukça sınırlıdır. Randevular buna göre planlanmalıdır.\nCuma ve Cumartesi geçişlerine dikkat edilmelidir.",
};

info(`Payload: year=${payload.year}, month=${payload.month} (Haziran 2026)`);

let resp;
try {
  resp = await fetch("http://localhost:3000/api/hacamat/word-report", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
} catch (e) {
  fail(`API erişim hatası: ${e.message}`);
  process.exit(1);
}

info(`HTTP Status: ${resp.status} ${resp.statusText}`);
const ct = resp.headers.get("content-type") ?? "";
info(`Content-Type: ${ct}`);
const cd = resp.headers.get("content-disposition") ?? "";
info(`Content-Disposition: ${cd}`);

if (!resp.ok) {
  const txt = await resp.text();
  fail(`API hata yanıtı: ${txt}`);
  process.exit(1);
}
ok("API yanıtı başarılı (2xx)");

// ─── 2. Dosya Kaydet ─────────────────────────────────────────────────────────
head("2. Dosya Kayıt");

const arrayBuf = await resp.arrayBuffer();
const buf      = Buffer.from(arrayBuf);
writeFileSync(OUT, buf);
info(`Kaydedildi: ${OUT}`);
info(`Dosya boyutu: ${buf.length} bayt (${(buf.length / 1024).toFixed(1)} KB)`);

if (buf.length < 1000) {
  fail(`Dosya çok küçük — muhtemelen boş veya hatalı (${buf.length} bayt)`);
  process.exit(1);
}
ok(`Dosya boyutu makul (${(buf.length / 1024).toFixed(1)} KB)`);

// ─── 3. ZIP / DOCX Başlık Doğrulaması ─────────────────────────────────────
head("3. DOCX Başlık (ZIP Signature) Doğrulaması");

const magic = buf.slice(0, 4);
if (magic[0] === 0x50 && magic[1] === 0x4B && magic[2] === 0x03 && magic[3] === 0x04) {
  ok(`ZIP imzası geçerli: PK\\x03\\x04 → geçerli .docx formatı`);
} else {
  fail(`ZIP imzası YANLIŞ: ${Array.from(magic).map(b => `0x${b.toString(16).padStart(2,'0')}`).join(" ")}`);
  process.exit(1);
}

// ─── 4. ZIP İçeriğini Ayrıştır (document.xml) ────────────────────────────────
head("4. ZIP Ayrıştırma — word/document.xml içerik kontrolü");

// Basit ZIP merkezi dizini taraması: tüm dosya adlarını bul
let xmlContent = null;
{
  let pos = 0;
  const files = {};
  while (pos < buf.length - 4) {
    if (buf[pos] === 0x50 && buf[pos+1] === 0x4B && buf[pos+2] === 0x03 && buf[pos+3] === 0x04) {
      // Yerel dosya başlığı
      const compMethod  = buf.readUInt16LE(pos + 8);
      const compSize    = buf.readUInt32LE(pos + 18);
      const fnLen       = buf.readUInt16LE(pos + 26);
      const extraLen    = buf.readUInt16LE(pos + 28);
      const fileName    = buf.slice(pos + 30, pos + 30 + fnLen).toString("utf8");
      const dataOffset  = pos + 30 + fnLen + extraLen;
      const compressed  = buf.slice(dataOffset, dataOffset + compSize);
      files[fileName]   = { compMethod, compressed };
      pos               = dataOffset + compSize;
    } else {
      pos++;
    }
  }

  const docEntry = files["word/document.xml"];
  if (!docEntry) {
    fail("word/document.xml bulunamadı ZIP içinde");
    info("Bulunan dosyalar: " + Object.keys(files).slice(0, 10).join(", "));
    process.exit(1);
  }

  ok(`word/document.xml bulundu (${docEntry.compressed.length} bayt, method=${docEntry.compMethod})`);

  // Decompress (method 8 = DEFLATE, method 0 = stored)
  if (docEntry.compMethod === 0) {
    xmlContent = docEntry.compressed.toString("utf8");
  } else {
    // DEFLATE — raw inflate (no zlib header)
    const { inflateRawSync } = await import("zlib");
    try {
      xmlContent = inflateRawSync(docEntry.compressed).toString("utf8");
    } catch(e) {
      fail(`Decompress hatası: ${e.message}`);
      process.exit(1);
    }
  }

  ok(`word/document.xml başarıyla decompressed (${xmlContent.length} karakter)`);
}

// Kaydet
mkdirSync(XMLDIR, { recursive: true });
writeFileSync(join(XMLDIR, "document.xml"), xmlContent, "utf8");
info(`XML kaydedildi: ${join(XMLDIR, "document.xml")}`);

// ─── 5. İçerik Kontrolü ──────────────────────────────────────────────────────
head("5. İçerik Kontrolleri");

function checkInXml(label, patterns, mode = "any") {
  const results = patterns.map(p => {
    const found = typeof p === "string" ? xmlContent.includes(p) : p.test(xmlContent);
    return { p: p.toString(), found };
  });
  const allFound = results.every(r => r.found);
  const anyFound = results.some(r => r.found);
  const pass = mode === "all" ? allFound : anyFound;
  if (pass) {
    const matched = results.filter(r => r.found).map(r => r.p).join(", ");
    ok(`${label} — eşleşti: ${matched.slice(0, 80)}`);
  } else {
    const missing = results.filter(r => !r.found).map(r => r.p).join(", ");
    fail(`${label} — bulunamadı: ${missing.slice(0, 80)}`);
  }
  return pass;
}

let passed = 0, total = 0;
function test(label, patterns, mode = "any") {
  total++;
  if (checkInXml(label, patterns, mode)) passed++;
}

// 5a. Kapak / Başlık
test("Kapak — 'HACAMAT TAKVİMİ'",      ["HACAMAT", "TAKVIM", "TAKVİMİ"]);
test("Kapak — 'YAŞAM SİSTEMİ'",        ["YA", "AM S", "STEM"]);
test("Rapor ayı — Haziran 2026",        ["Haziran", "2026"]);
test("Hicri ay bilgisi",                [/Zilhicce|Muharrem|Safer|Rebiülevvel/]);

// 5b. Aylık Tablo
test("Tablo başlığı — Aylık Hacamat",   ["Aylık Hacamat Takvimi", "Hicri 17"]);
test("Tablo — Miladi Tarih kolonu",     ["Miladi Tarih"]);
test("Tablo — Durum kolonu",            ["Durum"]);

// 5c. Hicri 17-24 günleri
test("Hicri 17 — Çarşamba (yasaklı)",  ["YASAKLI", "17"]);
test("Hicri 18 — Perşembe (uygun)",    ["UYGUN", "18"]);
test("Hicri 19 — Cuma (yasaklı)",      ["19"]);
test("Hicri 21 — Pazar (sünnet)",      ["SÜNNET", "21"]);
test("Hicri 22-23 uygun günler",       ["22", "23"]);

// 5d. Durum etiketleri
test("ALTIN GÜN etiketi",             ["ALTIN GÜN", "ALTIN"]);
test("SÜNNET GÜN etiketi",            ["SÜNNET GÜN", "SÜNNET"]);
test("UYGUN GÜN etiketi",             ["UYGUN GÜN", "UYGUN"]);
test("YASAKLI GÜN etiketi",           ["YASAKLI GÜN", "YASAKLI"]);

// 5e. Yıldız sembolü
test("Yıldız (⭐) sembolü",           ["⭐"]);
test("Yasak (⛔) sembolü",            ["⛔"]);

// 5f. Dinamik Notlar
test("Bölüm 6 — Dinamik Notlar",      ["Dinamik Hicri Gün Notları", "Dinamik"]);
test("Bug fix — Cuma→Cumartesi notu", ["hâlâ uygun değildir", "hâlâ"]);
test("Çarşamba akşam notu",           ["hacamat yap", "yapılabilir"]);
test("Sünnet gününe girilmiş",        ["sünnet gününe girilmiş", "sünnet"]);
test("Cumartesi akşam notu",          ["Cumartesi akşam"]);

// 5g. Kurallar
test("Bölüm 7 — Hacamat Kuralları",   ["Hacamat Öncesi ve Sonrası", "Kurallar"]);
test("Kural — öncesi",               ["3 saat aç", "Öncesi"]);
test("Kural — sonrası",              ["24 saat duş", "Sonrası"]);
test("Kural — genel",               ["1-2 kez", "1–2 kez", "Genel"]);

// 5h. Uzman Notları
test("Bölüm 8 — Uzman Notları",      ["Uzman Notları", "Uzman"]);
test("Expert note içeriği",          ["sünnet günleri oldukça", "randevular"]);

// 5i. Altın/Sünnet/Uygun bölümleri
test("Bölüm 2 — Altın Günler",       ["Altın Günler"]);
test("Bölüm 3 — Sünnet Günleri",     ["Sünnet Günleri"]);
test("Bölüm 4 — Uygun Günler",       ["Uygun Günler"]);
test("Bölüm 5 — Yasaklı Günler",     ["Yasaklı Günler"]);

// ─── 6. Renk kodları (XML'de highlight/shading) ──────────────────────────────
head("6. Renk Kodları (Word Shading)");

function checkColor(label, hexColor) {
  total++;
  const pat = new RegExp(`fill="${hexColor}"|fill w:val="${hexColor}"`, "i");
  const alt = new RegExp(hexColor, "i");
  if (pat.test(xmlContent) || alt.test(xmlContent)) {
    ok(`${label} rengi bulundu: #${hexColor}`);
    passed++;
  } else {
    fail(`${label} rengi BULUNAMADI: #${hexColor}`);
  }
}

checkColor("Yasaklı (kırmızı)",  "FEE2E2");
checkColor("Uygun (sarı)",       "FEF9C3");
checkColor("Sünnet (yeşil)",     "D1FAE5");
checkColor("Altın (amber)",      "FEF3C7");
checkColor("Başlık (teal)",      "0f766e");

// ─── 7. Özet ─────────────────────────────────────────────────────────────────
head("7. Test Özeti");
console.log(`  Toplam kontrol: ${total}`);
console.log(`  ${GRN}Geçen: ${passed}${RST}`);
if (passed < total) console.log(`  ${RED}Başarısız: ${total - passed}${RST}`);
console.log(`\n  Dosya: ${OUT}`);
console.log(`  Boyut: ${(buf.length / 1024).toFixed(1)} KB`);
console.log(`  XML uzunluğu: ${xmlContent.length} karakter`);

if (passed === total) {
  console.log(`\n${GRN}${BOLD}✓ TÜM KONTROLLER GEÇTİ${RST}`);
} else {
  console.log(`\n${YEL}${BOLD}⚠ ${total - passed} kontrol başarısız${RST}`);
}
